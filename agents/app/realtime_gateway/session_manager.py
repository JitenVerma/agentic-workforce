from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from app.shared.realtime_events import get_realtime_event_broker


@dataclass
class RealtimeSessionContext:
    session_id: str
    room_id: str
    user_id: str
    project_id: str
    project_name: str
    project_summary: str
    selected_specialist_roles: list[str]
    conversation_mode: str
    participant_states: dict[str, str] = field(
        default_factory=lambda: {
            "participant-human": "idle",
            "participant-conductor": "idle",
            "participant-software-engineer": "idle",
            "participant-solutions-architect": "idle",
        }
    )
    tool_event_queue: asyncio.Queue[dict[str, Any]] | None = None


class RealtimeSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, RealtimeSessionContext] = {}

    def create_session(
        self,
        *,
        session_id: str,
        room_id: str,
        user_id: str,
        project_id: str,
        project_name: str,
        project_summary: str,
        selected_specialist_roles: list[str],
        conversation_mode: str,
    ) -> RealtimeSessionContext:
        existing = self._sessions.get(session_id)
        if existing:
            return existing

        context = RealtimeSessionContext(
            session_id=session_id,
            room_id=room_id,
            user_id=user_id,
            project_id=project_id,
            project_name=project_name,
            project_summary=project_summary,
            selected_specialist_roles=selected_specialist_roles,
            conversation_mode=conversation_mode,
        )
        context.tool_event_queue = get_realtime_event_broker().subscribe(session_id)
        self._sessions[session_id] = context
        return context

    def get_session(self, session_id: str) -> RealtimeSessionContext | None:
        return self._sessions.get(session_id)

    def remove_session(self, session_id: str) -> None:
        context = self._sessions.pop(session_id, None)
        if not context or not context.tool_event_queue:
            return

        get_realtime_event_broker().unsubscribe(session_id, context.tool_event_queue)


_manager = RealtimeSessionManager()


def get_session_manager() -> RealtimeSessionManager:
    return _manager
