from __future__ import annotations

import base64

from google.adk.events import Event

from app.realtime_gateway.schemas import ServerEvent, create_server_event


def participant_state_event(
    session_id: str,
    *,
    participant_id: str,
    role: str,
    name: str,
    state: str,
    detail: str | None = None,
) -> ServerEvent:
    payload: dict[str, str] = {
        "participantId": participant_id,
        "role": role,
        "name": name,
        "state": state,
    }
    if detail:
        payload["detail"] = detail

    return create_server_event("participant_state", session_id=session_id, payload=payload)


def _text_payload(
    session_id: str,
    *,
    event_type: str,
    message_id: str,
    participant_id: str,
    participant_role: str,
    participant_name: str,
    text: str,
    is_final: bool,
) -> ServerEvent:
    return create_server_event(
        event_type,
        session_id=session_id,
        payload={
            "messageId": message_id,
            "participantId": participant_id,
            "participantRole": participant_role,
            "participantName": participant_name,
            "text": text,
            "isFinal": is_final,
        },
    )


def _audio_payload(
    session_id: str,
    *,
    message_id: str,
    participant_id: str,
    participant_role: str,
    participant_name: str,
    audio: str,
    mime_type: str | None,
) -> ServerEvent:
    return create_server_event(
        "audio_response_chunk",
        session_id=session_id,
        payload={
            "messageId": message_id,
            "participantId": participant_id,
            "participantRole": participant_role,
            "participantName": participant_name,
            "audio": audio,
            "mimeType": mime_type or "audio/pcm;rate=24000",
        },
    )


def _normalize_audio_data(audio: bytes | str) -> str:
    if isinstance(audio, bytes):
        return base64.b64encode(audio).decode("ascii")

    return audio


def map_adk_event(
    session_id: str,
    event: Event,
    *,
    user_message_id: str | None = None,
    coordinator_message_id: str | None = None,
) -> list[ServerEvent]:
    events: list[ServerEvent] = []
    message_id = event.id or event.invocation_id or f"evt-{int(event.timestamp)}"
    effective_user_message_id = user_message_id or f"{message_id}:user"
    effective_coordinator_message_id = coordinator_message_id or f"{message_id}:coordinator"

    if event.error_message:
        events.append(
            create_server_event(
                "error",
                session_id=session_id,
                payload={
                    "code": event.error_code or "adk_error",
                    "message": event.error_message,
                    "recoverable": True,
                },
            )
        )

    if event.input_transcription and event.input_transcription.text:
        is_final = bool(event.input_transcription.finished)
        events.append(
            _text_payload(
                session_id,
                event_type="transcript_complete" if is_final else "transcript_delta",
                message_id=effective_user_message_id,
                participant_id="participant-human",
                participant_role="human",
                participant_name="You",
                text=event.input_transcription.text,
                is_final=is_final,
            )
        )

    if event.output_transcription and event.output_transcription.text:
        is_final = bool(event.output_transcription.finished)
        event_type = "transcript_complete" if is_final else "transcript_delta"
        events.append(
            _text_payload(
                session_id,
                event_type=event_type,
                message_id=effective_coordinator_message_id,
                participant_id="participant-conductor",
                participant_role="conductor",
                participant_name="Coordinator",
                text=event.output_transcription.text,
                is_final=is_final,
            )
        )
        events.append(
            create_server_event(
                "response_complete" if is_final else "response_chunk",
                session_id=session_id,
                payload={
                    "messageId": effective_coordinator_message_id,
                    "participantId": "participant-conductor",
                    "participantRole": "conductor",
                    "participantName": "Coordinator",
                    "text": event.output_transcription.text,
                    "isFinal": is_final,
                },
            )
        )

    if event.content and event.content.parts:
        for index, part in enumerate(event.content.parts):
            if part.inline_data and part.inline_data.data:
                events.append(
                    _audio_payload(
                        session_id,
                        message_id=effective_coordinator_message_id,
                        participant_id="participant-conductor",
                        participant_role="conductor",
                        participant_name="Coordinator",
                        audio=_normalize_audio_data(part.inline_data.data),
                        mime_type=part.inline_data.mime_type,
                    )
                )
            elif part.text and not event.output_transcription:
                is_final = not bool(event.partial)
                events.append(
                    _text_payload(
                        session_id,
                        event_type="transcript_complete" if is_final else "transcript_delta",
                        message_id=effective_coordinator_message_id,
                        participant_id="participant-conductor",
                        participant_role="conductor",
                        participant_name="Coordinator",
                        text=part.text,
                        is_final=is_final,
                    )
                )

    if event.turn_complete:
        events.append(
            create_server_event(
                "audio_response_complete",
                session_id=session_id,
                payload={"messageId": effective_coordinator_message_id},
            )
        )
        events.append(
            create_server_event(
                "turn_complete",
                session_id=session_id,
                payload={"turnId": effective_coordinator_message_id},
            )
        )

    return events
