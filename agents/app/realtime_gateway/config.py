from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class RealtimeGatewaySettings:
    gateway_title: str
    websocket_path: str
    input_audio_mime_type: str
    output_audio_mime_type: str
    default_user_id: str


def get_realtime_gateway_settings() -> RealtimeGatewaySettings:
    return RealtimeGatewaySettings(
        gateway_title=os.getenv(
            "REALTIME_GATEWAY_TITLE",
            "Agentic Workforce Realtime Gateway",
        ),
        websocket_path=os.getenv("REALTIME_GATEWAY_WS_PATH", "/ws"),
        input_audio_mime_type=os.getenv(
            "REALTIME_INPUT_AUDIO_MIME_TYPE",
            "audio/pcm;rate=24000",
        ),
        output_audio_mime_type=os.getenv(
            "REALTIME_OUTPUT_AUDIO_MIME_TYPE",
            "audio/pcm;rate=24000",
        ),
        default_user_id=os.getenv("REALTIME_DEFAULT_USER_ID", "agentic-workforce-user"),
    )
