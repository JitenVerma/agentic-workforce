from pathlib import Path

from dotenv import load_dotenv

from app.shared import create_agent_service

from .agent import root_agent


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = create_agent_service(root_agent, public_path="/conductor")
