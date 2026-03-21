from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

from app.realtime_gateway.config import get_realtime_gateway_settings
from app.realtime_gateway.websocket_router import router


if load_dotenv is not None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")

settings = get_realtime_gateway_settings()

app = FastAPI(
    title=settings.gateway_title,
    description="Single websocket gateway for realtime human-to-coordinator voice sessions.",
)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": settings.gateway_title,
        "websocket": settings.websocket_path,
    }


app.include_router(router)
