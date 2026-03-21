from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket
from fastapi.websockets import WebSocketDisconnect

from app.realtime_gateway.config import get_realtime_gateway_settings
from app.realtime_gateway.coordinator_service import CoordinatorRealtimeSession
from app.realtime_gateway.schemas import (
    AudioChunkMessage,
    AudioEndMessage,
    AudioStartMessage,
    PingMessage,
    SessionStartMessage,
    SessionEndMessage,
    UserMessage,
    create_server_event,
    parse_client_message,
)
from app.realtime_gateway.session_manager import get_session_manager


router = APIRouter()


@router.websocket("/ws")
async def realtime_room_socket(websocket: WebSocket) -> None:
    settings = get_realtime_gateway_settings()
    session_manager = get_session_manager()

    await websocket.accept()

    active_session_id = "unbound"
    coordinator: CoordinatorRealtimeSession | None = None
    forward_task: asyncio.Task[None] | None = None

    async def forward_events() -> None:
        if coordinator is None:
            return

        async for event in coordinator.events():
            await websocket.send_json(event.model_dump(by_alias=True))

    try:
        await websocket.send_json(
            create_server_event(
                "connection_ack",
                session_id=active_session_id,
                payload={
                    "gateway": "fastapi",
                    "inputAudioMimeType": settings.input_audio_mime_type,
                    "outputAudioMimeType": settings.output_audio_mime_type,
                },
            ).model_dump(by_alias=True)
        )

        while True:
            client_message = parse_client_message(await websocket.receive_text())

            if isinstance(client_message, PingMessage):
                await websocket.send_json(
                    create_server_event(
                        "pong",
                        session_id=client_message.session_id,
                        payload=client_message.payload.model_dump(by_alias=True),
                    ).model_dump(by_alias=True)
                )
                continue

            if isinstance(client_message, SessionStartMessage):
                if coordinator is not None:
                    await websocket.send_json(
                        create_server_event(
                            "error",
                            session_id=client_message.session_id,
                            payload={
                                "code": "session_already_started",
                                "message": "This websocket session is already bound to a room.",
                                "recoverable": False,
                            },
                        ).model_dump(by_alias=True)
                    )
                    continue

                active_session_id = client_message.session_id
                payload = client_message.payload
                selected_roles = [
                    role
                    for role in payload.selected_agents
                    if role in {"software_engineer", "solutions_architect"}
                ]
                context = session_manager.create_session(
                    session_id=active_session_id,
                    room_id=payload.room_id,
                    user_id=payload.user_id or settings.default_user_id,
                    project_id=payload.project_id,
                    project_name=payload.project_name,
                    project_summary=payload.project_summary,
                    selected_specialist_roles=selected_roles,
                    conversation_mode=payload.conversation_mode,
                )
                coordinator = CoordinatorRealtimeSession(context, settings)
                await coordinator.start()
                forward_task = asyncio.create_task(forward_events())

                await websocket.send_json(
                    create_server_event(
                        "session_started",
                        session_id=active_session_id,
                        payload={
                            "roomId": payload.room_id,
                            "projectId": payload.project_id,
                            "projectName": payload.project_name,
                            "selectedAgents": selected_roles,
                            "participants": [
                                {
                                    "id": "participant-human",
                                    "role": "human",
                                    "name": "You",
                                    "state": "idle",
                                },
                                {
                                    "id": "participant-conductor",
                                    "role": "conductor",
                                    "name": "Coordinator",
                                    "state": "idle",
                                },
                                {
                                    "id": "participant-software-engineer",
                                    "role": "software_engineer",
                                    "name": "Software Engineer",
                                    "state": "idle",
                                },
                                {
                                    "id": "participant-solutions-architect",
                                    "role": "solutions_architect",
                                    "name": "Solutions Architect",
                                    "state": "idle",
                                },
                            ],
                        },
                    ).model_dump(by_alias=True)
                )
                continue

            if coordinator is None:
                await websocket.send_json(
                    create_server_event(
                        "error",
                        session_id=client_message.session_id,
                        payload={
                            "code": "session_not_started",
                            "message": "Send session_start before streaming audio or messages.",
                            "recoverable": True,
                        },
                    ).model_dump(by_alias=True)
                )
                continue

            if isinstance(client_message, UserMessage):
                await coordinator.send_user_text(
                    client_message.payload.message_id,
                    client_message.payload.text,
                )
            elif isinstance(client_message, AudioStartMessage):
                await coordinator.send_audio_start(client_message.payload.message_id)
            elif isinstance(client_message, AudioChunkMessage):
                await coordinator.send_audio_chunk(
                    client_message.payload.audio,
                    client_message.payload.mime_type,
                )
            elif isinstance(client_message, AudioEndMessage):
                await coordinator.send_audio_end(client_message.payload.message_id)
            elif isinstance(client_message, SessionEndMessage):
                break
    except WebSocketDisconnect:
        pass
    finally:
        if forward_task:
            forward_task.cancel()
            try:
                await forward_task
            except asyncio.CancelledError:
                pass

        if coordinator:
            await coordinator.close()

        session_manager.remove_session(active_session_id)
