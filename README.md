# Agentic Workforce

Agentic Workforce is a Next.js collaborative room application where a human works with a moderated AI team.

This iteration implements a fixed room architecture with:
- 1 Human participant
- 1 Coordinator agent
- 1 Software Engineer agent
- 1 Solutions Architect agent

The communication flow is explicit:

`Human -> browser room UI -> FastAPI websocket gateway -> Coordinator -> specialists over A2A -> Coordinator response`

## Prerequisites

- Node.js 20+
- Python 3.12+
- `uv` installed and available on your PATH
- Access to the Google model credentials required by your ADK agents in [agents/app/.env](./agents/app/.env)

## Local setup

Install the web app dependencies from the repo root:

```bash
npm install
```

Install the Python agent dependencies from [agents](./agents):

```bash
cd agents
uv sync
cd ..
```

## Run everything

Open 3 terminals.

Terminal 1, start the internal A2A specialist service:

```bash
cd agents
uv run python -m uvicorn app.multi_agent_a2a_app:app --host 0.0.0.0 --port 8000
```

Expected routes:
- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/conductor`
- `http://127.0.0.1:8000/software-engineer`
- `http://127.0.0.1:8000/solutions-architect`

Terminal 2, start the FastAPI realtime gateway:

```bash
cd agents
uv run python -m uvicorn app.realtime_gateway.main:app --host 0.0.0.0 --port 9001
```

Expected routes:
- `http://127.0.0.1:9001/`
- `ws://127.0.0.1:9001/ws`

Terminal 3, start the Next.js app from the repo root:

```bash
npm run dev
```

Then open:

```text
http://localhost:3001
```

## Environment variables

The main optional overrides are:

```env
# Frontend -> realtime gateway
NEXT_PUBLIC_REALTIME_GATEWAY_WS_URL=ws://127.0.0.1:9001/ws

# Coordinator -> specialist A2A base URL
A2A_SPECIALIST_BASE_URL=http://127.0.0.1:8000
```

The ADK agents also read credentials and model configuration from:

```text
agents/app/.env
```

## Typical local flow

1. Start the A2A service on port `8000`.
2. Start the realtime gateway on port `9001`.
3. Start the Next app on port `3001`.
4. Open a project.
5. Start a room.
6. Click `Connect voice`.
7. Speak to the Coordinator.

## What the app now does

- Open or create a project
- Start a moderated voice room for that project
- Join a dedicated room view with participant state updates
- Open one websocket from the browser to the FastAPI gateway
- Stream microphone audio to the Coordinator in realtime
- Receive coordinator audio and transcript events back on the same connection
- Let the Coordinator consult the Software Engineer and Solutions Architect over A2A
- Keep specialist collaboration internal by default while still surfacing specialist activity events

## Troubleshooting

- If the room UI loads but voice does not connect, make sure the realtime gateway is running on port `9001`.
- If the Coordinator responds without specialist help, make sure the A2A service is running on port `8000`.
- If the agents fail to start, check the credentials and model settings in [agents/app/.env](./agents/app/.env).
- If the browser cannot capture audio, confirm microphone permission is granted for `http://localhost:3001`.
- If `http://127.0.0.1:9000/` returns a ClickHouse or Docker response, another local service is already using that port. Use `9001` for the realtime gateway.
