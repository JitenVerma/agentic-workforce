from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any


class RealtimeEventBroker:
    """In-process event fan-out between ADK tools and websocket sessions."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)

    def subscribe(self, session_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[session_id].add(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        listeners = self._subscribers.get(session_id)
        if not listeners:
            return

        listeners.discard(queue)
        if not listeners:
            self._subscribers.pop(session_id, None)

    async def publish(self, session_id: str, event: dict[str, Any]) -> None:
        listeners = tuple(self._subscribers.get(session_id, ()))
        for queue in listeners:
            await queue.put(event)


_broker = RealtimeEventBroker()


def get_realtime_event_broker() -> RealtimeEventBroker:
    return _broker
