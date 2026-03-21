from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class EnvelopeModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    session_id: str = Field(alias="sessionId")
    timestamp: str = Field(default_factory=now_iso)


class SessionStartPayload(BaseModel):
    room_id: str = Field(alias="roomId")
    project_id: str = Field(alias="projectId")
    project_name: str = Field(alias="projectName")
    project_summary: str = Field(alias="projectSummary")
    user_id: str | None = Field(default=None, alias="userId")
    selected_agents: list[str] = Field(alias="selectedAgents")
    conversation_mode: Literal["voice", "text"] = Field(alias="conversationMode")


class UserMessagePayload(BaseModel):
    message_id: str = Field(alias="messageId")
    text: str


class AudioStartPayload(BaseModel):
    message_id: str = Field(alias="messageId")
    mime_type: str = Field(alias="mimeType")


class AudioChunkPayload(BaseModel):
    message_id: str = Field(alias="messageId")
    chunk_id: str = Field(alias="chunkId")
    audio: str
    mime_type: str = Field(alias="mimeType")


class AudioEndPayload(BaseModel):
    message_id: str = Field(alias="messageId")


class SessionEndPayload(BaseModel):
    reason: str | None = None


class PingPayload(BaseModel):
    nonce: str | None = None


class SessionStartMessage(EnvelopeModel):
    type: Literal["session_start"]
    payload: SessionStartPayload


class UserMessage(EnvelopeModel):
    type: Literal["user_message"]
    payload: UserMessagePayload


class PingMessage(EnvelopeModel):
    type: Literal["ping"]
    payload: PingPayload


class AudioStartMessage(EnvelopeModel):
    type: Literal["audio_start"]
    payload: AudioStartPayload


class AudioChunkMessage(EnvelopeModel):
    type: Literal["audio_chunk"]
    payload: AudioChunkPayload


class AudioEndMessage(EnvelopeModel):
    type: Literal["audio_end"]
    payload: AudioEndPayload


class SessionEndMessage(EnvelopeModel):
    type: Literal["session_end"]
    payload: SessionEndPayload


ClientMessage = Annotated[
    SessionStartMessage
    | UserMessage
    | PingMessage
    | AudioStartMessage
    | AudioChunkMessage
    | AudioEndMessage
    | SessionEndMessage,
    Field(discriminator="type"),
]

client_message_adapter = TypeAdapter(ClientMessage)


class ServerEvent(EnvelopeModel):
    payload: dict[str, Any]


def parse_client_message(raw: str) -> ClientMessage:
    return client_message_adapter.validate_python(json.loads(raw))


def create_server_event(
    event_type: str,
    *,
    session_id: str,
    payload: dict[str, Any],
) -> ServerEvent:
    return ServerEvent(type=event_type, sessionId=session_id, payload=payload)
