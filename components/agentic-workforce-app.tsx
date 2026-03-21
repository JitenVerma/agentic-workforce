"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, LayoutTemplate, Plus, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { AgentCard } from "@/components/agent-card";
import { Modal } from "@/components/modal";
import { ProjectCard } from "@/components/project-card";
import { toLiveAgentProfile } from "@/lib/a2a/presentation";
import { A2AAgentsResponse, A2AResolvedAgent } from "@/lib/a2a/types";
import { ROOM_PARTICIPANT_SEEDS } from "@/lib/room/catalog";
import { INITIAL_PROJECTS } from "@/lib/mock-data";
import { Project } from "@/lib/types";

const defaultNewProject = {
  name: "",
  description: "",
  tag: "",
};

type Screen = "dashboard" | "workspace";

function roomAgentIds() {
  return new Set(
    ROOM_PARTICIPANT_SEEDS.flatMap((participant) =>
      participant.a2aAgentId ? [participant.a2aAgentId] : [],
    ),
  );
}

export function AgenticWorkforceApp() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState(INITIAL_PROJECTS[0]?.id ?? "");
  const [projectSearch, setProjectSearch] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProject, setNewProject] = useState(defaultNewProject);
  const [a2aAgents, setA2AAagents] = useState<A2AResolvedAgent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isStartingRoom, setIsStartingRoom] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) =>
      [project.name, project.description, project.tag ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [projectSearch, projects]);

  const roomAgentProfiles = useMemo(() => {
    const allowed = roomAgentIds();

    return a2aAgents
      .filter((agent) => allowed.has(agent.id))
      .map((agent, index) => toLiveAgentProfile(agent, index));
  }, [a2aAgents]);

  useEffect(() => {
    let active = true;

    async function loadAgents() {
      setIsLoadingAgents(true);
      setAgentError(null);

      try {
        const response = await fetch("/api/a2a/agents", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load the room agent roster.");
        }

        const payload = (await response.json()) as A2AAgentsResponse;
        if (!active) {
          return;
        }

        startTransition(() => {
          setA2AAagents(payload.agents);
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setAgentError(
          error instanceof Error ? error.message : "Unable to load the room agent roster.",
        );
      } finally {
        if (active) {
          setIsLoadingAgents(false);
        }
      }
    }

    void loadAgents();

    return () => {
      active = false;
    };
  }, []);

  const openProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setScreen("workspace");
  };

  const createProject = () => {
    if (!newProject.name.trim() || !newProject.description.trim()) {
      return;
    }

    const project: Project = {
      id: `project-${Date.now()}`,
      name: newProject.name.trim(),
      description: newProject.description.trim(),
      lastUpdated: "Just now",
      status: "Draft",
      tag: newProject.tag.trim() || "New Initiative",
      notes: [
        "This project was created from the collaborative room workspace.",
        "The Coordinator will coordinate specialist involvement once the room starts.",
      ],
      requirementsDraft: [
        "Capture the user goal, expected system shape, and first delivery milestone.",
      ],
      openQuestions: [
        "What should the Coordinator surface publicly versus keep internal?",
      ],
      recentCalls: [],
    };

    setProjects((current) => [project, ...current]);
    setSelectedProjectId(project.id);
    setScreen("workspace");
    setNewProject(defaultNewProject);
    setIsCreateModalOpen(false);
  };

  const startRoom = async () => {
    if (!selectedProject) {
      return;
    }

    setIsStartingRoom(true);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: selectedProject,
        }),
      });

      const payload = (await response.json()) as
        | { room: { id: string } }
        | { error: string };

      if (!response.ok || !("room" in payload)) {
        throw new Error("error" in payload ? payload.error : "Unable to create the room.");
      }

      router.push(`/rooms/${payload.room.id}`);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "Unable to create the room.");
    } finally {
      setIsStartingRoom(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark">
          <div className="brand-mark__logo">AW</div>
          <div>
            <p className="eyebrow">Agentic Workforce</p>
            <h2>Moderated Multi-Agent Rooms</h2>
          </div>
        </div>
        <div className="header-meta">
          <span>Human -&gt; Coordinator -&gt; Specialists</span>
          <span>Single realtime websocket</span>
          <span>ADK + A2A backed</span>
        </div>
      </header>

      {screen === "dashboard" ? (
        <div className="screen">
          <section className="hero-card">
            <div>
              <p className="eyebrow">Collaborative Room Architecture</p>
              <h1>Open a project and launch a moderated room with a Coordinator-led AI team.</h1>
              <p className="hero-copy">
                Every human turn enters through the room, the Coordinator decides how to involve the two specialists, and only approved messages reach the public transcript.
              </p>
            </div>
            <div className="hero-stats">
              <div className="stat-card">
                <Users size={18} />
                <strong>4 participants</strong>
                <span>Human, Coordinator, Software Engineer, Solutions Architect</span>
              </div>
              <div className="stat-card">
                <LayoutTemplate size={18} />
                <strong>Moderated flow</strong>
                <span>The Coordinator owns orchestration and public turn-taking</span>
              </div>
              <div className="stat-card">
                <ShieldCheck size={18} />
                <strong>Voice-first design</strong>
                <span>The room transport is centered around realtime audio and transcript events</span>
              </div>
            </div>
          </section>

          <section className="toolbar">
            <div className="search-shell">
              <Search size={16} />
              <input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Search projects, tags, or descriptions"
              />
            </div>
            <button className="primary-button" onClick={() => setIsCreateModalOpen(true)}>
              <Plus size={16} />
              Create New Project
            </button>
          </section>

          <section className="project-grid">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={openProject} />
            ))}
          </section>
        </div>
      ) : selectedProject ? (
        <div className="screen">
          <section className="workspace-header">
            <button className="back-link" onClick={() => setScreen("dashboard")}>
              <ArrowLeft size={16} />
              All projects
            </button>
            <div className="workspace-header__main">
              <div>
                <p className="eyebrow">Project Workspace</p>
                <h1>{selectedProject.name}</h1>
                <p className="hero-copy">{selectedProject.description}</p>
              </div>
              <div className="workspace-header__actions">
                <span className="status-pill">{selectedProject.status}</span>
                {selectedProject.tag ? <span className="tag-pill">{selectedProject.tag}</span> : null}
                <button className="primary-button" onClick={() => void startRoom()} disabled={isStartingRoom}>
                  <Sparkles size={16} />
                  {isStartingRoom ? "Starting Room" : "Start Room"}
                </button>
              </div>
            </div>
          </section>

        <section className="priority-banner">
          <strong>Moderated room policy</strong>
          <span>
              The human always speaks into the room first. The Coordinator decides if the Software Engineer, the Solutions Architect, or both should contribute.
          </span>
        </section>

          <section className="workspace-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Team Roster</p>
                  <h3>Fixed room participants</h3>
                </div>
              </div>
              <div className="agent-grid">
                {roomAgentProfiles.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    selected
                    disabled={agent.status !== "online"}
                    onToggle={() => undefined}
                    footerLabel={
                      agent.status === "online"
                        ? "Ready for room orchestration"
                        : agent.error ?? "Offline or unreachable"
                    }
                    statusLabel={agent.status === "online" ? "Online" : "Offline"}
                  />
                ))}
                {isLoadingAgents ? (
                  <div className="empty-state agent-grid__empty">
                    <Sparkles size={18} />
                    <p>Loading the fixed room agent roster.</p>
                  </div>
                ) : null}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Project Context</p>
                  <h3>What the room will work with</h3>
                </div>
              </div>
              <div className="bullet-stack">
                {selectedProject.notes.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Requirements Draft</p>
                  <h3>Current working assumptions</h3>
                </div>
              </div>
              <div className="bullet-stack">
                {selectedProject.requirementsDraft.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Open Questions</p>
                  <h3>Topics the room should resolve</h3>
                </div>
              </div>
              <div className="bullet-stack bullet-stack--warning">
                {selectedProject.openQuestions.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>
          </section>

          {agentError ? (
            <section className="panel">
              <div className="empty-state">
                <BriefcaseBusiness size={18} />
                <p>{agentError}</p>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <Modal
          title="Create a new project"
          subtitle="Give the Coordinator enough project context to make the first room useful."
          onClose={() => setIsCreateModalOpen(false)}
        >
          <div className="form-stack">
            <label>
              <span>Project name</span>
              <input
                value={newProject.name}
                onChange={(event) => setNewProject((current) => ({ ...current, name: event.target.value }))}
                placeholder="Realtime Collaboration Hub"
              />
            </label>
            <label>
              <span>Short description</span>
              <textarea
                value={newProject.description}
                onChange={(event) =>
                  setNewProject((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Describe the product outcome and why the room matters."
              />
            </label>
            <label>
              <span>Project tag</span>
              <input
                value={newProject.tag}
                onChange={(event) => setNewProject((current) => ({ ...current, tag: event.target.value }))}
                placeholder="Internal Platform"
              />
            </label>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </button>
              <button className="primary-button" onClick={createProject}>
                Create project
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
