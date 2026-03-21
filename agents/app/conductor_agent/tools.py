from __future__ import annotations

import json
import re
from typing import Any

import httpx
from a2a.client import A2AClient
from a2a.types import SendMessageRequest
from google.adk.tools import ToolContext

from app.conductor_agent.registry import SpecialistRegistration, get_specialist_registry
from app.shared.langfuse import langfuse_span
from app.shared.realtime_events import get_realtime_event_broker


def _safe_getattr(value: Any, *names: str) -> Any:
    for name in names:
        if hasattr(value, name):
            return getattr(value, name)
    return None


def _parts_to_text(parts: list[Any] | None) -> str:
    if not parts:
        return ""

    chunks: list[str] = []
    for part in parts:
        kind = _safe_getattr(part, "kind")
        if kind == "text":
            text = _safe_getattr(part, "text")
            if text:
                chunks.append(text)
            continue

        if kind == "data":
            data = _safe_getattr(part, "data")
            if data:
                chunks.append(json.dumps(data))
            continue

        if kind == "file":
            file_value = _safe_getattr(part, "file")
            if file_value:
                name = _safe_getattr(file_value, "name") or _safe_getattr(file_value, "uri")
                if name:
                    chunks.append(str(name))

    return "\n\n".join(chunk for chunk in chunks if chunk)


def _extract_text_result(result: Any) -> str:
    kind = _safe_getattr(result, "kind")
    if kind == "message":
        return _parts_to_text(_safe_getattr(result, "parts"))

    status = _safe_getattr(result, "status")
    status_message = _safe_getattr(status, "message")
    text = _parts_to_text(_safe_getattr(status_message, "parts"))
    if text:
        return text

    artifacts = _safe_getattr(result, "artifacts") or []
    artifact_text = "\n\n".join(_parts_to_text(_safe_getattr(artifact, "parts")) for artifact in artifacts)
    if artifact_text:
        return artifact_text

    history = _safe_getattr(result, "history") or []
    for message in reversed(history):
        if _safe_getattr(message, "role") == "agent":
            text = _parts_to_text(_safe_getattr(message, "parts"))
            if text:
                return text

    task_id = _safe_getattr(result, "id")
    task_state = _safe_getattr(status, "state")
    return f"Task {task_id} returned state {task_state}."


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise ValueError("The specialist did not return a JSON object.")

    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("The specialist did not return a JSON object.")

    return parsed


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "1"}:
            return True
        if normalized in {"false", "no", "0"}:
            return False

    return default


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default

    return max(0.0, min(1.0, number))


def _coerce_follow_ups(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    if isinstance(value, str) and value.strip():
        return [value.strip()]

    return []


def _normalize_specialist_payload(
    registration: SpecialistRegistration,
    raw_text: str,
    parsed: dict[str, Any] | None,
) -> dict[str, Any]:
    if parsed is None:
        summary = raw_text.strip() or f"{registration.public_label} returned an empty response."
        return {
            "summary": summary[:280],
            "detailedResponse": summary,
            "publicMessage": summary[:280],
            "shouldSpeakPublicly": False,
            "confidence": 0.35,
            "followUps": [],
            "needsAnotherAgent": False,
            "anotherAgentRole": None,
            "formattingError": "specialist_non_json_response",
            "rawResponse": summary,
        }

    summary = str(parsed.get("summary") or "").strip()
    detailed_response = str(parsed.get("detailedResponse") or "").strip()
    public_message = str(parsed.get("publicMessage") or "").strip()

    if not summary:
        summary = public_message or detailed_response[:280] or f"{registration.public_label} provided specialist guidance."

    if not detailed_response:
        detailed_response = public_message or summary

    if not public_message:
        public_message = summary

    return {
        "summary": summary,
        "detailedResponse": detailed_response,
        "publicMessage": public_message,
        "shouldSpeakPublicly": _coerce_bool(parsed.get("shouldSpeakPublicly"), False),
        "confidence": _coerce_float(parsed.get("confidence"), 0.5),
        "followUps": _coerce_follow_ups(parsed.get("followUps")),
        "needsAnotherAgent": _coerce_bool(parsed.get("needsAnotherAgent"), False),
        "anotherAgentRole": parsed.get("anotherAgentRole"),
        "formattingError": parsed.get("formattingError"),
        "rawResponse": raw_text.strip(),
    }


def _build_specialist_prompt(
    registration: SpecialistRegistration,
    question: str,
    project_name: str,
    project_summary: str,
) -> str:
    return f"""
You are participating as the {registration.public_label} specialist inside a moderated realtime project room.

Project name:
{project_name}

Project context:
{project_summary}

Human request for the Coordinator to resolve:
{question}

Return exactly one JSON object with this shape and no markdown:
{{
  "summary": "short specialist summary",
  "detailedResponse": "detailed specialist guidance",
  "publicMessage": "one concise message the Coordinator could quote or paraphrase publicly",
  "shouldSpeakPublicly": false,
  "confidence": 0.0,
  "followUps": ["optional follow up"],
  "needsAnotherAgent": false,
  "anotherAgentRole": null
}}

Important:
- Return JSON only.
- Do not wrap the JSON in markdown fences.
- If you need clarification, put the question inside "followUps" and still return the JSON object.
- Start your reply with {{ and end it with }}.
""".strip()


async def _publish_tool_event(
    tool_context: ToolContext,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    session_id = str(tool_context.state.get("realtime_session_id", "")).strip()
    if not session_id:
        return

    await get_realtime_event_broker().publish(
        session_id,
        {
            "type": event_type,
            "payload": payload,
        },
    )


async def _call_specialist(
    registration: SpecialistRegistration,
    question: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    selected_roles = {
        str(role)
        for role in (tool_context.state.get("selected_specialist_roles") or [])
    }
    if registration.role not in selected_roles:
        return {
            "summary": f"{registration.public_label} is not active in this session.",
            "detailedResponse": "",
            "publicMessage": "",
            "shouldSpeakPublicly": False,
            "confidence": 0.0,
            "followUps": [],
            "needsAnotherAgent": False,
            "anotherAgentRole": None,
            "error": "specialist_not_selected",
        }

    project_name = str(tool_context.state.get("project_name", "Untitled Project"))
    project_summary = str(tool_context.state.get("project_summary", ""))
    specialist_sessions = dict(tool_context.state.get("specialist_sessions") or {})
    existing_session = specialist_sessions.get(registration.role, {})

    await _publish_tool_event(
        tool_context,
        "specialist_invoked",
        {
            "specialistRole": registration.role,
            "specialistName": registration.public_label,
            "requestSummary": question,
        },
    )

    with langfuse_span(
        f"consult-{registration.role}",
        as_type="tool",
        input={
            "question": question,
            "project_name": project_name,
            "project_summary": project_summary,
        },
        metadata={
            "specialist_role": registration.role,
            "specialist_name": registration.public_label,
            "a2a_url": registration.a2a_url,
            "turn_id": tool_context.state.get("turn_id"),
        },
    ) as observation:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
            a2a_client = A2AClient(client, url=registration.a2a_url)
            response = await a2a_client.send_message(
                SendMessageRequest.model_validate(
                    {
                        "id": existing_session.get("request_id") or f"req_{registration.role}",
                        "params": {
                            "message": {
                                "messageId": f"msg_{registration.role}_{tool_context.state.get('turn_id', '0')}",
                                "role": "user",
                                "contextId": existing_session.get("context_id"),
                                "taskId": existing_session.get("task_id"),
                                "parts": [
                                    {
                                        "kind": "text",
                                        "text": _build_specialist_prompt(
                                            registration,
                                            question=question,
                                            project_name=project_name,
                                            project_summary=project_summary,
                                        ),
                                    }
                                ],
                            }
                        },
                    }
                )
            )

        root = response.root
        error = _safe_getattr(root, "error")
        if error is not None:
            message = _safe_getattr(error, "message") or "Unknown A2A error."
            if observation is not None:
                observation.update(
                    level="ERROR",
                    status_message=str(message),
                    output={"error": str(message)},
                )
            raise RuntimeError(str(message))

        result = _safe_getattr(root, "result")
        raw_text = _extract_text_result(result)
        try:
            parsed = _extract_json_object(raw_text)
        except ValueError:
            parsed = None

        normalized = _normalize_specialist_payload(registration, raw_text, parsed)
        if observation is not None:
            observation.update(
                output={
                    "summary": normalized.get("summary"),
                    "publicMessage": normalized.get("publicMessage"),
                    "confidence": normalized.get("confidence"),
                    "formattingError": normalized.get("formattingError"),
                }
            )

    specialist_sessions[registration.role] = {
        "context_id": _safe_getattr(result, "context_id", "contextId"),
        "task_id": _safe_getattr(result, "task_id", "taskId", "id"),
        "request_id": f"req_{registration.role}",
    }
    tool_context.state["specialist_sessions"] = specialist_sessions

    await _publish_tool_event(
        tool_context,
        "specialist_response",
        {
            "specialistRole": registration.role,
            "specialistName": registration.public_label,
            "summary": str(normalized.get("summary") or ""),
            "publicMessage": str(normalized.get("publicMessage") or ""),
            "confidence": normalized.get("confidence"),
            "formattingError": normalized.get("formattingError"),
        },
    )

    return normalized


async def consult_software_engineer(question: str, tool_context: ToolContext) -> dict[str, Any]:
    """Consult the Software Engineer specialist through A2A."""

    return await _call_specialist(get_specialist_registry()["software_engineer"], question, tool_context)


async def consult_solutions_architect(question: str, tool_context: ToolContext) -> dict[str, Any]:
    """Consult the Solutions Architect specialist through A2A."""

    return await _call_specialist(get_specialist_registry()["solutions_architect"], question, tool_context)
