from fastapi import FastAPI

from app.conductor_agent.a2a_app import app as conductor_app
from app.software_engineer_agent.a2a_app import app as software_engineer_app
from app.solutions_architect_agent.a2a_app import app as solutions_architect_app


app = FastAPI(
    title="Agentic Workforce Multi-Agent A2A Service",
    description="Serves the Conductor, Software Engineer, and Solutions Architect agents behind one local endpoint.",
)


@app.on_event("startup")
async def startup_mounted_agent_apps():
    await conductor_app.router.startup()
    await software_engineer_app.router.startup()
    await solutions_architect_app.router.startup()


@app.on_event("shutdown")
async def shutdown_mounted_agent_apps():
    await conductor_app.router.shutdown()
    await software_engineer_app.router.shutdown()
    await solutions_architect_app.router.shutdown()


@app.get("/")
async def root():
    return {
        "agents": [
            {
                "id": "conductor-agent",
                "path": "/conductor",
                "card": "/conductor/.well-known/agent-card.json",
            },
            {
                "id": "software-engineer-agent",
                "path": "/software-engineer",
                "card": "/software-engineer/.well-known/agent-card.json",
            },
            {
                "id": "solutions-architect-agent",
                "path": "/solutions-architect",
                "card": "/solutions-architect/.well-known/agent-card.json",
            },
        ]
    }


app.mount("/conductor", conductor_app)
app.mount("/software-engineer", software_engineer_app)
app.mount("/solutions-architect", solutions_architect_app)
