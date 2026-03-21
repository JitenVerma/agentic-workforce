# Realtime Voice Room PRD

## Overview
Agentic Workforce will support a project-scoped collaborative room where a human speaks to a single voice-facing Coordinator Agent over one websocket connection. The Coordinator owns the public conversation and delegates specialist work to internal ADK/A2A specialist agents.

## Goals
- Provide one low-latency websocket connection from the frontend to a Python FastAPI realtime gateway.
- Make the Coordinator Agent the only frontend-facing conversational and voice-capable agent in v1.
- Support bidirectional chunked audio streaming plus transcript and room-status events.
- Keep specialist agents internal and reachable only through A2A.
- Preserve project context and make the system easy to extend with more specialists later.

## User Flow
1. User opens or creates a project in the Next.js app.
2. User starts a room for that project.
3. Frontend opens a websocket to the FastAPI realtime gateway.
4. Frontend sends `session_start` with project, user, selected specialists, and `conversationMode=voice`.
5. User speaks into the microphone.
6. Frontend sends `audio_start`, `audio_chunk`, and `audio_end`.
7. Gateway forwards audio to ADK live mode for the Coordinator.
8. Coordinator may call specialist agents over A2A.
9. Gateway streams back transcripts, coordinator state, specialist activity, and audio response chunks.
10. Frontend renders one unified conversation timeline and plays Coordinator audio.

## Voice Interaction Flow
1. Browser captures mono microphone audio and resamples to PCM16 at 24kHz.
2. Browser sends manual activity markers and audio chunks to the websocket gateway.
3. Gateway converts websocket audio messages into ADK `LiveRequest` messages.
4. ADK live mode returns audio chunks, transcript deltas, and turn completion events.
5. Gateway emits a normalized event stream to the browser.
6. Browser queues PCM playback for Coordinator audio and updates the room timeline in parallel.

## Functional Requirements
- Single websocket per active room session.
- FastAPI owns realtime transport and session lifecycle.
- Session start payload contains project id, optional user id, selected specialists, and conversation mode.
- Frontend can stream microphone audio and optional text messages.
- Backend emits typed room, transcript, coordinator, specialist, and error events.
- Coordinator receives all human input first.
- Specialists are invoked only by the Coordinator through A2A.
- Specialists return structured outputs suitable for synthesis and room events.
- Frontend renders participant states: `idle`, `listening`, `thinking`, `speaking`.
- Barge-in is supported by sending new user activity while the Coordinator is speaking; backend forwards interruptions to ADK live and resets playback state.

## Non-Functional Requirements
- Modular, typed, production-oriented code.
- Environment-based configuration for URLs, models, and service settings.
- Local development first, container-friendly later.
- Explicit session cleanup on disconnect.
- Structured error events to the browser.
- Clean separation between transport, session state, and orchestration.

## Architecture
Frontend Next.js
-> WebSocket session client
-> FastAPI realtime gateway
-> Coordinator live service
-> Coordinator specialist registry
-> Specialist A2A services

Supporting layers:
- Shared websocket contract in TypeScript and Python.
- Audio capture and playback abstractions in the frontend.
- Session manager and event mapper in the backend.
- Coordinator orchestration service that owns specialist delegation decisions.

## WebSocket Event Contract
Envelope:

```json
{
  "type": "session_start",
  "sessionId": "room_123",
  "timestamp": "2026-03-20T10:00:00.000Z",
  "payload": {}
}
```

Client -> Server:
- `session_start`
- `user_message`
- `ping`
- `audio_start`
- `audio_chunk`
- `audio_end`
- `session_end`

Server -> Client:
- `connection_ack`
- `session_started`
- `participant_state`
- `coordinator_listening`
- `coordinator_thinking`
- `specialist_invoked`
- `specialist_response`
- `transcript_delta`
- `transcript_complete`
- `audio_response_chunk`
- `audio_response_complete`
- `response_chunk`
- `response_complete`
- `turn_complete`
- `error`
- `pong`

## Audio Streaming Contract
- Input format: PCM16 little-endian, mono, 24kHz, base64-encoded in websocket payloads.
- Output format: PCM16 little-endian, mono, 24kHz, base64-encoded in websocket payloads.
- Chunking model: browser sends short frames generated from microphone processing; backend forwards each chunk directly to ADK live.
- Activity model: browser sends explicit `audio_start` and `audio_end`, matching ADK manual activity detection.
- Conversion boundary: browser performs float32 -> PCM16 conversion before transport; backend does not re-encode unless a future provider requires it.
- Playback strategy: frontend enqueues PCM chunks into an `AudioContext` playback queue.
- Interruption strategy: new human activity resets local playback cursor and backend emits new coordinator state events.
- Fallback: `user_message` supports text-only turns when audio is unavailable.

## A2A Interaction Model
- Coordinator is voice-facing and websocket-facing.
- Specialists are text/task-facing and A2A-only.
- Coordinator chooses which specialists to call based on selected agents and user intent.
- Specialist outputs follow a structured contract:
  - `summary`
  - `detailedResponse`
  - `publicMessage`
  - `shouldSpeakPublicly`
  - `confidence`
  - `followUps`
  - `needsAnotherAgent`
  - `anotherAgentRole`
- Public room output is always decided by the Coordinator.

## Target Folder Structure
```text
/app
  /rooms/[roomId]
  /api/rooms
/components
  room-session-page.tsx
/lib
  /realtime
    contracts.ts
    session-client.ts
    microphone-stream.ts
    pcm-player.ts
    view-models.ts
/agents/app
  /conductor_agent
    agent.py
    registry.py
    tools.py
  /software_engineer_agent
  /solutions_architect_agent
  /realtime_gateway
    main.py
    websocket_router.py
    coordinator_service.py
    session_manager.py
    event_mapper.py
    schemas.py
    config.py
  /shared
    realtime_events.py
```

## Implementation Plan
1. Add the PRD and shared contracts.
2. Add FastAPI realtime gateway modules for config, schemas, session management, event mapping, and coordinator service.
3. Add a specialist registry and A2A invocation helpers in Python.
4. Refactor the frontend room page to use one websocket session client.
5. Refactor microphone capture and PCM playback into reusable call utilities.
6. Update docs and local run instructions.

## Risks And Open Questions
- ADK live event shapes may evolve, so gateway event mapping should stay defensive.
- A2A specialist latency may need future parallelization and timeout controls.
- Session state is in-memory for v1 and will not survive process restarts.
- Authentication is scaffolded but not fully implemented in this iteration.
- Full duplex multi-speaker audio arbitration is intentionally deferred; v1 is one human plus one voice-facing Coordinator.
