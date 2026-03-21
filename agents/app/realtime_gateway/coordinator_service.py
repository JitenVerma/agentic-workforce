from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from uuid import uuid4

from google.adk.agents.live_request_queue import LiveRequest, LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.utils.context_utils import Aclosing
from google.genai import types

from app.conductor_agent.agent import root_agent
from app.realtime_gateway.config import RealtimeGatewaySettings
from app.realtime_gateway.event_mapper import map_adk_event, participant_state_event
from app.realtime_gateway.schemas import ServerEvent, create_server_event
from app.realtime_gateway.session_manager import RealtimeSessionContext
from app.shared.langfuse import langfuse_span


class CoordinatorRealtimeSession:
    def __init__(
        self,
        context: RealtimeSessionContext,
        settings: RealtimeGatewaySettings,
    ) -> None:
        self.context = context
        self.settings = settings
        self._output_queue: asyncio.Queue[ServerEvent] = asyncio.Queue()
        self._live_request_queue = LiveRequestQueue()
        self._session_service = InMemorySessionService()
        self._runner = Runner(
            app_name=root_agent.name,
            agent=root_agent,
            artifact_service=InMemoryArtifactService(),
            session_service=self._session_service,
            auto_create_session=False,
        )
        self._agent_task: asyncio.Task[None] | None = None
        self._tool_task: asyncio.Task[None] | None = None
        self._closed = False
        self._coordinator_speaking = False
        self._active_user_message_id: str | None = None
        self._active_coordinator_message_id: str | None = None

    def _start_turn(self, user_message_id: str) -> None:
        self._active_user_message_id = user_message_id
        self._active_coordinator_message_id = f"coordinator-{uuid4()}"

    async def start(self) -> None:
        await self._session_service.create_session(
            app_name=root_agent.name,
            user_id=self.context.user_id,
            session_id=self.context.session_id,
            state={
                "realtime_session_id": self.context.session_id,
                "room_id": self.context.room_id,
                "project_id": self.context.project_id,
                "project_name": self.context.project_name,
                "project_summary": self.context.project_summary,
                "selected_specialist_roles": self.context.selected_specialist_roles,
                "specialist_sessions": {},
                "turn_id": 0,
            },
        )
        self._agent_task = asyncio.create_task(self._run_agent_loop())
        self._tool_task = asyncio.create_task(self._forward_tool_events())

    async def close(self) -> None:
        if self._closed:
            return

        self._closed = True
        self._live_request_queue.close()

        tasks = [task for task in (self._agent_task, self._tool_task) if task]
        for task in tasks:
            task.cancel()

        for task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def events(self) -> AsyncGenerator[ServerEvent, None]:
        while not self._closed:
            yield await self._output_queue.get()

    async def send_user_text(self, message_id: str, text: str) -> None:
        await self._bump_turn()
        self._start_turn(message_id)
        await self._emit(
            participant_state_event(
                self.context.session_id,
                participant_id="participant-human",
                role="human",
                name="You",
                state="idle",
            )
        )
        await self._emit(
            create_server_event(
                "coordinator_thinking",
                session_id=self.context.session_id,
                payload={"messageId": message_id},
            )
        )
        await self._emit(
            create_server_event(
                "transcript_complete",
                session_id=self.context.session_id,
                payload={
                    "messageId": message_id,
                    "participantId": "participant-human",
                    "participantRole": "human",
                    "participantName": "You",
                    "text": text,
                    "isFinal": True,
                },
            )
        )
        self._live_request_queue.send(
            LiveRequest(
                content=types.Content(
                    role="user",
                    parts=[types.Part(text=text)],
                )
            )
        )

    async def send_audio_start(self, message_id: str) -> None:
        await self._bump_turn()
        self._start_turn(message_id)
        await self._emit(
            participant_state_event(
                self.context.session_id,
                participant_id="participant-human",
                role="human",
                name="You",
                state="speaking",
            )
        )
        await self._emit(
            create_server_event(
                "coordinator_listening",
                session_id=self.context.session_id,
                payload={"messageId": message_id},
            )
        )
        self._live_request_queue.send(LiveRequest.model_validate({"activity_start": {}}))

    async def send_audio_chunk(self, audio: str, mime_type: str) -> None:
        self._live_request_queue.send(
            LiveRequest(
                blob=types.Blob(
                    data=audio,
                    mime_type=mime_type,
                )
            )
        )

    async def send_audio_end(self, message_id: str) -> None:
        await self._emit(
            participant_state_event(
                self.context.session_id,
                participant_id="participant-human",
                role="human",
                name="You",
                state="idle",
            )
        )
        await self._emit(
            create_server_event(
                "coordinator_thinking",
                session_id=self.context.session_id,
                payload={"messageId": message_id},
            )
        )
        self._live_request_queue.send(LiveRequest.model_validate({"activity_end": {}}))

    async def _bump_turn(self) -> None:
        session = await self._session_service.get_session(
            app_name=root_agent.name,
            user_id=self.context.user_id,
            session_id=self.context.session_id,
        )
        if not session:
            return
        session.state["turn_id"] = int(session.state.get("turn_id", 0)) + 1

    async def _emit(self, event: ServerEvent) -> None:
        await self._output_queue.put(event)

    async def _forward_tool_events(self) -> None:
        if not self.context.tool_event_queue:
            return

        while not self._closed:
            tool_event = await self.context.tool_event_queue.get()
            payload = dict(tool_event.get("payload") or {})
            event_type = str(tool_event.get("type") or "")
            if event_type == "specialist_invoked":
                participant_id = (
                    "participant-software-engineer"
                    if payload.get("specialistRole") == "software_engineer"
                    else "participant-solutions-architect"
                )
                role = str(payload.get("specialistRole"))
                await self._emit(
                    participant_state_event(
                        self.context.session_id,
                        participant_id=participant_id,
                        role=role,
                        name=str(payload.get("specialistName") or role),
                        state="thinking",
                    )
                )
            elif event_type == "specialist_response":
                participant_id = (
                    "participant-software-engineer"
                    if payload.get("specialistRole") == "software_engineer"
                    else "participant-solutions-architect"
                )
                role = str(payload.get("specialistRole"))
                await self._emit(
                    participant_state_event(
                        self.context.session_id,
                        participant_id=participant_id,
                        role=role,
                        name=str(payload.get("specialistName") or role),
                        state="idle",
                    )
                )

            await self._emit(
                create_server_event(
                    event_type,
                    session_id=self.context.session_id,
                    payload=payload,
                )
            )

    async def _run_agent_loop(self) -> None:
        run_config = RunConfig(
            response_modalities=[types.Modality.AUDIO],
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=True
                )
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )

        try:
            with langfuse_span(
                "coordinator-live-session",
                as_type="agent",
                metadata={
                    "session_id": self.context.session_id,
                    "room_id": self.context.room_id,
                    "project_id": self.context.project_id,
                    "project_name": self.context.project_name,
                    "selected_specialist_roles": self.context.selected_specialist_roles,
                    "conversation_mode": self.context.conversation_mode,
                },
            ) as observation:
                async with Aclosing(
                    self._runner.run_live(
                        user_id=self.context.user_id,
                        session_id=self.context.session_id,
                        live_request_queue=self._live_request_queue,
                        run_config=run_config,
                    )
                ) as event_stream:
                    async for event in event_stream:
                        mapped = map_adk_event(
                            self.context.session_id,
                            event,
                            user_message_id=self._active_user_message_id,
                            coordinator_message_id=self._active_coordinator_message_id,
                        )
                        has_output = bool(
                            (event.output_transcription and event.output_transcription.text)
                            or (
                                event.content
                                and any(
                                    part.inline_data or part.text
                                    for part in (event.content.parts or [])
                                )
                            )
                        )

                        if has_output and not self._coordinator_speaking:
                            self._coordinator_speaking = True
                            await self._emit(
                                participant_state_event(
                                    self.context.session_id,
                                    participant_id="participant-conductor",
                                    role="conductor",
                                    name="Coordinator",
                                    state="speaking",
                                )
                            )

                        for mapped_event in mapped:
                            await self._emit(mapped_event)

                        if event.turn_complete and self._coordinator_speaking:
                            self._coordinator_speaking = False
                            await self._emit(
                                participant_state_event(
                                    self.context.session_id,
                                    participant_id="participant-conductor",
                                    role="conductor",
                                    name="Coordinator",
                                    state="idle",
                                )
                            )
                        if event.turn_complete:
                            if observation is not None:
                                observation.update(
                                    output={
                                        "last_user_message_id": self._active_user_message_id,
                                        "last_coordinator_message_id": self._active_coordinator_message_id,
                                        "turn_complete": True,
                                    }
                                )
                            self._active_user_message_id = None
                            self._active_coordinator_message_id = None
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self._emit(
                create_server_event(
                    "error",
                    session_id=self.context.session_id,
                    payload={
                        "code": "coordinator_runtime_error",
                        "message": str(exc),
                        "recoverable": False,
                    },
                )
            )
