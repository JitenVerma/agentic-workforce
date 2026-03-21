# Agents

This package contains the Google ADK agents used by the Agentic Workforce room architecture.

## Implemented agents

- `app/conductor_agent`
- `app/software_engineer_agent`
- `app/solutions_architect_agent`
- `app/realtime_gateway`

Each agent exposes:
- an A2A app for internal agent-to-agent communication

The realtime gateway exposes:
- a single FastAPI websocket endpoint at `/ws`
- one voice-facing Coordinator session per room
- internal specialist delegation through A2A

## Run the local multi-agent service

From this `agents/` directory:

```bash
uv sync
uv run python -m uvicorn app.multi_agent_a2a_app:app --host 0.0.0.0 --port 8000
```

Mounted routes:

- `/conductor`
- `/software-engineer`
- `/solutions-architect`

## Run the realtime gateway

From this `agents/` directory:

```bash
uv run python -m uvicorn app.realtime_gateway.main:app --host 0.0.0.0 --port 9000
```

Gateway routes:

- `/`
- `/ws`

## Full local run order

From the repo root, the full stack is:

1. `cd agents && uv sync`
2. `cd agents && uv run python -m uvicorn app.multi_agent_a2a_app:app --host 0.0.0.0 --port 8000`
3. `cd agents && uv run python -m uvicorn app.realtime_gateway.main:app --host 0.0.0.0 --port 9000`
4. `npm install`
5. `npm run dev`

The web app then connects to:

- specialist A2A services on port `8000`
- the realtime gateway on port `9000`
- the browser UI on port `3000`
