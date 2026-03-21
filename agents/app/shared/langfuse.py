from __future__ import annotations

import os
from contextlib import contextmanager, nullcontext
from functools import lru_cache
from typing import Any, Iterator

from langfuse import Langfuse


def _is_placeholder(value: str | None) -> bool:
    if not value:
        return True

    normalized = value.strip()
    if not normalized:
        return True

    return normalized.startswith("YOUR_")


def _get_langfuse_host() -> str | None:
    return os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST")


def is_langfuse_configured() -> bool:
    return not any(
        (
            _is_placeholder(os.getenv("LANGFUSE_PUBLIC_KEY")),
            _is_placeholder(os.getenv("LANGFUSE_SECRET_KEY")),
            _is_placeholder(_get_langfuse_host()),
        )
    )


@lru_cache(maxsize=1)
def get_langfuse_client() -> Langfuse | None:
    if not is_langfuse_configured():
        return None

    return Langfuse(
        public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
        secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
        host=_get_langfuse_host(),
        environment=os.getenv("LANGFUSE_ENVIRONMENT"),
    )


@contextmanager
def langfuse_span(
    name: str,
    *,
    as_type: str = "span",
    input: Any = None,
    metadata: Any = None,
) -> Iterator[Any]:
    client = get_langfuse_client()
    if client is None:
        with nullcontext(None) as observation:
            yield observation
        return

    with client.start_as_current_observation(
        name=name,
        as_type=as_type,
        input=input,
        metadata=metadata,
    ) as observation:
        try:
            yield observation
        except Exception as exc:
            observation.update(
                level="ERROR",
                status_message=str(exc),
                output={"error": str(exc)},
            )
            raise


def shutdown_langfuse() -> None:
    client = get_langfuse_client()
    if client is not None:
        client.shutdown()
