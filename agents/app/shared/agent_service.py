import os
import json
from typing import List

from fastapi import FastAPI, Query, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from fastapi.websockets import WebSocketDisconnect
from google.genai import types
from google.adk.agents import Agent
from google.adk.agents.live_request_queue import LiveRequest, LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.a2a.utils.agent_to_a2a import to_a2a
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.utils.context_utils import Aclosing

from app.shared.langfuse import shutdown_langfuse


def create_agent_service(
    root_agent: Agent,
    *,
    host_env: str = "A2A_HOST",
    port_env: str = "A2A_PORT",
    protocol_env: str = "A2A_PROTOCOL",
    public_path: str = "",
):
    public_host = os.getenv(host_env, os.getenv("A2A_HOST", "localhost"))
    public_port = int(os.getenv(port_env, os.getenv("A2A_PORT", "8000")))
    public_protocol = os.getenv(protocol_env, os.getenv("A2A_PROTOCOL", "http"))

    a2a_app = to_a2a(
        root_agent,
        host=public_host,
        port=public_port,
        protocol=public_protocol,
    )

    runner = Runner(
        app_name=root_agent.name,
        agent=root_agent,
        artifact_service=InMemoryArtifactService(),
        session_service=InMemorySessionService(),
        auto_create_session=True,
    )

    app = FastAPI()
    normalized_public_path = public_path.rstrip("/")

    @app.middleware("http")
    async def rewrite_agent_card_urls(request: Request, call_next):
        response = await call_next(request)

        if not request.url.path.endswith("/.well-known/agent-card.json") and not request.url.path.endswith(
            "/.well-known/agent.json"
        ):
            return response

        if response.status_code >= 400:
            return response

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            headers = dict(response.headers)
            headers.pop("content-length", None)
            return Response(
                content=body,
                status_code=response.status_code,
                headers=headers,
                media_type=response.media_type,
            )

        if isinstance(payload, dict):
            base_url = str(request.base_url).rstrip("/")
            public_service_url = (
                f"{base_url}{normalized_public_path}"
                if normalized_public_path
                else base_url
            )
            payload["url"] = public_service_url

        headers = dict(response.headers)
        headers.pop("content-length", None)
        return JSONResponse(
            payload,
            status_code=response.status_code,
            headers=headers,
        )

    @app.on_event("startup")
    async def startup_a2a_app():
        await a2a_app.router.startup()

    @app.on_event("shutdown")
    async def shutdown_a2a_app():
        await a2a_app.router.shutdown()
        shutdown_langfuse()

    @app.websocket("/run_live")
    async def run_agent_live(
        websocket: WebSocket,
        user_id: str = Query(default="voice-user"),
        session_id: str = Query(default="voice-session"),
        modalities: List[types.Modality] = Query(default=[types.Modality.AUDIO]),
        proactive_audio: bool | None = Query(default=None),
    ):
        await websocket.accept()
        live_request_queue = LiveRequestQueue()

        async def forward_events():
            run_config = RunConfig(
                response_modalities=[
                    modality if isinstance(modality, types.Modality) else types.Modality[modality]
                    for modality in modalities
                ],
                realtime_input_config=types.RealtimeInputConfig(
                    automatic_activity_detection=types.AutomaticActivityDetection(
                        disabled=True
                    )
                ),
                proactivity=(
                    types.ProactivityConfig(proactive_audio=proactive_audio)
                    if proactive_audio is not None
                    else None
                ),
            )

            async with Aclosing(
                runner.run_live(
                    user_id=user_id,
                    session_id=session_id,
                    live_request_queue=live_request_queue,
                    run_config=run_config,
                )
            ) as agen:
                async for event in agen:
                    await websocket.send_text(
                        event.model_dump_json(exclude_none=True, by_alias=True)
                    )

        async def process_messages():
            try:
                while True:
                    live_request_queue.send(
                        LiveRequest.model_validate_json(await websocket.receive_text())
                    )
            except WebSocketDisconnect:
                live_request_queue.close()

        import asyncio

        tasks = [
            asyncio.create_task(forward_events()),
            asyncio.create_task(process_messages()),
        ]
        done, pending = await asyncio.wait(
            tasks, return_when=asyncio.FIRST_EXCEPTION
        )

        try:
            for task in done:
                task.result()
        finally:
            for task in pending:
                task.cancel()

    app.mount("/", a2a_app)
    return app
