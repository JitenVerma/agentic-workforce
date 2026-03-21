from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal


SpecialistRole = Literal["software_engineer", "solutions_architect"]


@dataclass(frozen=True)
class SpecialistRegistration:
    role: SpecialistRole
    agent_id: str
    name: str
    a2a_url: str
    public_label: str
    expertise: str


def get_specialist_registry() -> dict[SpecialistRole, SpecialistRegistration]:
    base_url = os.getenv("A2A_SPECIALIST_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

    return {
        "software_engineer": SpecialistRegistration(
            role="software_engineer",
            agent_id="software-engineer-agent",
            name="software_engineer_agent",
            a2a_url=f"{base_url}/software-engineer/",
            public_label="Software Engineer",
            expertise="implementation planning, APIs, state management, and delivery tradeoffs",
        ),
        "solutions_architect": SpecialistRegistration(
            role="solutions_architect",
            agent_id="solutions-architect-agent",
            name="solutions_architect_agent",
            a2a_url=f"{base_url}/solutions-architect/",
            public_label="Solutions Architect",
            expertise="system design, scalability, deployment, architecture risk, and platform boundaries",
        ),
    }
