"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleDot,
  LayoutTemplate,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { AgentCard } from "@/components/agent-card";
import { CallControls } from "@/components/call-controls";
import { Modal } from "@/components/modal";
import { ParticipantCard } from "@/components/participant-card";
import { ProjectCard } from "@/components/project-card";
import { TranscriptFeed } from "@/components/transcript-feed";
import {
  AGENTS,
  buildCallSummary,
  buildDemoEvents,
  HUMAN_PARTICIPANT,
  HUMAN_PROMPTS,
  INITIAL_PROJECTS,
} from "@/lib/mock-data";
import {
  ActivityEntry,
  CallSession,
  CallSummary,
  DemoEvent,
  Project,
  Screen,
  TranscriptEntry,
} from "@/lib/types";

const defaultNewProject = {
  name: "",
  description: "",
  tag: "",
};

function formatElapsed(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  return `${mins}:${secs}`;
}

function stampTime(seconds: number) {
  return formatElapsed(seconds);
}

function createActivity(label: string, detail: string, tone: ActivityEntry["tone"]): ActivityEntry {
  return {
    id: `${label}-${detail}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    detail,
    tone,
  };
}

function createTranscript(
  seconds: number,
  participantId: string,
  name: string,
  role: string,
  kind: TranscriptEntry["kind"],
  message: string,
): TranscriptEntry {
  return {
    id: `${participantId}-${seconds}-${Math.random().toString(36).slice(2, 8)}`,
    participantId,
    name,
    role,
    kind,
    message,
    timestamp: stampTime(seconds),
  };
}

export function PrototypeApp() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(INITIAL_PROJECTS[0]?.id ?? "");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProject, setNewProject] = useState(defaultNewProject);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([
    "product-owner",
    "solutions-architect",
    "ui-ux-designer",
    "software-engineer",
  ]);
  const [call, setCall] = useState<CallSession | null>(null);
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const demoEventsRef = useRef<DemoEvent[]>([]);
  const humanPromptIndexRef = useRef(0);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  );

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) => {
      return [project.name, project.description, project.tag ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [projectSearch, projects]);

  const filteredAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) {
      return AGENTS;
    }

    return AGENTS.filter((agent) =>
      [agent.name, agent.role, agent.description, agent.perspective].join(" ").toLowerCase().includes(query),
    );
  }, [agentSearch]);

  const selectedAgents = useMemo(
    () => AGENTS.filter((agent) => selectedAgentIds.includes(agent.id)),
    [selectedAgentIds],
  );

  useEffect(() => {
    if (screen !== "call" || !call || !selectedProject) {
      return;
    }

    const interval = window.setInterval(() => {
      setCall((current) => {
        if (!current) {
          return current;
        }

        let next: CallSession = {
          ...current,
          elapsedSeconds: current.elapsedSeconds + 1,
        };

        if (next.status === "connecting" && next.elapsedSeconds >= 2) {
          next = {
            ...next,
            status: "live",
            activity: [createActivity("Call live", "All participants are now connected.", "info"), ...next.activity],
          };
        }

        const dueEvents = demoEventsRef.current.filter((event) => event.at <= next.elapsedSeconds);
        if (dueEvents.length > 0) {
          const existingIds = new Set([next.activeSpeakerId, ...next.queue.map((item) => item.agentId)]);

          for (const event of dueEvents) {
            if (existingIds.has(event.agentId)) {
              continue;
            }

            next = {
              ...next,
              queue: [...next.queue, event],
              activity: [createActivity("Hand raised", event.raiseMessage, "queue"), ...next.activity],
            };
            existingIds.add(event.agentId);
          }

          demoEventsRef.current = demoEventsRef.current.filter((event) => event.at > next.elapsedSeconds);
        }

        if (next.humanSpeaking) {
          return next;
        }

        if (next.activeSpeakerKind === "agent" && next.activeRemaining > 1) {
          return {
            ...next,
            activeRemaining: next.activeRemaining - 1,
          };
        }

        if (next.activeSpeakerKind === "agent" && next.activeRemaining <= 1) {
          next = {
            ...next,
            activeSpeakerId: null,
            activeSpeakerKind: null,
            activeRemaining: 0,
            currentSpeech: null,
          };
        }

        if (!next.activeSpeakerId && next.queue.length > 0) {
          const [nextSpeech, ...remainingQueue] = next.queue;
          const agent = AGENTS.find((item) => item.id === nextSpeech.agentId);

          if (!agent) {
            return { ...next, queue: remainingQueue };
          }

          return {
            ...next,
            queue: remainingQueue,
            activeSpeakerId: agent.id,
            activeSpeakerKind: "agent",
            activeRemaining: nextSpeech.duration,
            currentSpeech: nextSpeech,
            transcript: [
              createTranscript(next.elapsedSeconds, agent.id, agent.name, agent.role, "agent", nextSpeech.transcript),
              ...next.transcript,
            ],
            activity: [
              createActivity("Agent speaking", `${agent.name} now has the floor.`, "info"),
              ...next.activity,
            ],
          };
        }

        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [call, screen, selectedProject]);

  const openProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setScreen("workspace");
    setSummary(null);
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
        "New project created from the kickoff room prototype.",
        "Use the first call to define the scope, risks, and initial delivery shape.",
      ],
      requirementsDraft: [
        "Capture the initial product outcome and success criteria.",
      ],
      openQuestions: [
        "Which specialists should be in the first planning call?",
      ],
      recentCalls: [],
    };

    setProjects((current) => [project, ...current]);
    setSelectedProjectId(project.id);
    setNewProject(defaultNewProject);
    setIsCreateModalOpen(false);
    setScreen("workspace");
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  };

  const startCall = () => {
    if (!selectedProject || selectedAgentIds.length === 0) {
      return;
    }

    demoEventsRef.current = buildDemoEvents(selectedAgentIds, selectedProject);
    humanPromptIndexRef.current = 0;
    setCall({
      projectId: selectedProject.id,
      selectedAgentIds,
      elapsedSeconds: 0,
      status: "connecting",
      muted: false,
      showTranscript: true,
      humanSpeaking: false,
      activeSpeakerId: null,
      activeSpeakerKind: null,
      activeRemaining: 0,
      currentSpeech: null,
      queue: [],
      transcript: [
        createTranscript(0, "system", "System", "Room Status", "system", "Kickoff room is preparing participants and syncing context."),
        createTranscript(
          1,
          HUMAN_PARTICIPANT.id,
          HUMAN_PARTICIPANT.name,
          HUMAN_PARTICIPANT.role,
          "human",
          `I want this call to define the strongest version of ${selectedProject.name} and capture concrete next steps.`,
        ),
      ],
      activity: [
        createActivity("Room created", "Voice kickoff room initialized with selected participants.", "info"),
        createActivity("Human priority", "The host can speak at any time, regardless of the queue.", "priority"),
      ],
    });
    setIsAgentModalOpen(false);
    setScreen("call");
  };

  const toggleMute = () => {
    setCall((current) => {
      if (!current) {
        return current;
      }

      const muted = !current.muted;
      const updated = {
        ...current,
        muted,
        humanSpeaking: muted ? false : current.humanSpeaking,
        activeSpeakerId: muted && current.activeSpeakerKind === "human" ? null : current.activeSpeakerId,
        activeSpeakerKind: muted && current.activeSpeakerKind === "human" ? null : current.activeSpeakerKind,
      };

      return {
        ...updated,
        activity: [
          createActivity("Host audio", muted ? "Host muted their mic." : "Host unmuted and can interrupt again.", "info"),
          ...updated.activity,
        ],
      };
    });
  };

  const toggleHumanSpeaking = () => {
    setCall((current) => {
      if (!current || current.muted) {
        return current;
      }

      if (current.humanSpeaking) {
        return {
          ...current,
          humanSpeaking: false,
          activeSpeakerId: null,
          activeSpeakerKind: null,
          activity: [
            createActivity("Human finished", "The host yielded the floor back to the room.", "priority"),
            ...current.activity,
          ],
        };
      }

      const interruptedAgent =
        current.activeSpeakerKind === "agent"
          ? AGENTS.find((agent) => agent.id === current.activeSpeakerId)
          : null;
      const prompt = HUMAN_PROMPTS[humanPromptIndexRef.current % HUMAN_PROMPTS.length];
      humanPromptIndexRef.current += 1;

      return {
        ...current,
        humanSpeaking: true,
        activeSpeakerId: HUMAN_PARTICIPANT.id,
        activeSpeakerKind: "human",
        activeRemaining: 0,
        currentSpeech: null,
        transcript: [
          createTranscript(current.elapsedSeconds, HUMAN_PARTICIPANT.id, HUMAN_PARTICIPANT.name, HUMAN_PARTICIPANT.role, "human", prompt),
          ...current.transcript,
        ],
        activity: [
          createActivity(
            "Human priority",
            interruptedAgent
              ? `The host interrupted ${interruptedAgent.name} and took the floor immediately.`
              : "The host started speaking and took priority over the queue.",
            "priority",
          ),
          ...current.activity,
        ],
      };
    });
  };

  const toggleTranscript = () => {
    setCall((current) => (current ? { ...current, showTranscript: !current.showTranscript } : current));
  };

  const endCall = () => {
    if (!selectedProject || !call) {
      return;
    }

    const duration = formatElapsed(call.elapsedSeconds || 1);
    const summaryData = buildCallSummary(call.selectedAgentIds, selectedProject);
    setSummary(summaryData);
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== selectedProject.id) {
          return project;
        }

        return {
          ...project,
          lastUpdated: "Just now",
          status: "Active",
          recentCalls: [
            {
              id: `call-${Date.now()}`,
              title: "Multi-agent kickoff",
              startedAt: "Just now",
              duration,
              outcome: "Generated requirements, risks, and next steps",
            },
            ...project.recentCalls,
          ],
          requirementsDraft: Array.from(new Set([...summaryData.requirements, ...project.requirementsDraft])).slice(0, 5),
          openQuestions: Array.from(
            new Set([
              ...project.openQuestions,
              "Which summary insights should become backlog items automatically?",
            ]),
          ).slice(0, 5),
        };
      }),
    );
    setCall(null);
    setScreen("summary");
  };

  const participantQueuePositions = useMemo(() => {
    if (!call) {
      return new Map<string, number>();
    }

    return new Map(call.queue.map((item, index) => [item.agentId, index + 1]));
  }, [call]);

  const renderDashboard = () => (
    <div className="screen">
      <section className="hero-card">
        <div>
          <p className="eyebrow">AI Project Kickoff Room</p>
          <h1>Assemble specialist agents and run a structured voice planning session.</h1>
          <p className="hero-copy">
            This prototype simulates how a human host could invite role-based AI collaborators, manage turn-taking,
            and leave the call with a crisp project brief.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <Users size={18} />
            <strong>7 specialists</strong>
            <span>Curated perspectives ready to join</span>
          </div>
          <div className="stat-card">
            <LayoutTemplate size={18} />
            <strong>4-stage flow</strong>
            <span>Dashboard, workspace, live room, summary</span>
          </div>
          <div className="stat-card">
            <ShieldCheck size={18} />
            <strong>Human-first control</strong>
            <span>Host override always wins over agent queueing</span>
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
  );

  const renderWorkspace = () => {
    if (!selectedProject) {
      return null;
    }

    return (
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
              <button className="primary-button" onClick={() => setIsAgentModalOpen(true)}>
                <Sparkles size={16} />
                Start New Call
              </button>
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Recent Calls</p>
                <h3>Past planning sessions</h3>
              </div>
            </div>
            <div className="list-stack">
              {selectedProject.recentCalls.length > 0 ? (
                selectedProject.recentCalls.map((callRecord) => (
                  <div key={callRecord.id} className="list-card">
                    <strong>{callRecord.title}</strong>
                    <span>{callRecord.startedAt}</span>
                    <p>{callRecord.outcome}</p>
                    <small>{callRecord.duration}</small>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <BriefcaseBusiness size={18} />
                  <p>No calls yet. Start the first kickoff room to generate a summary.</p>
                </div>
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Notes</p>
                <h3>Team context</h3>
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
                <h3>Emerging product shape</h3>
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
                <h3>Topics to resolve</h3>
              </div>
            </div>
            <div className="bullet-stack bullet-stack--warning">
              {selectedProject.openQuestions.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>
        </section>
      </div>
    );
  };

  const renderCall = () => {
    if (!selectedProject || !call) {
      return null;
    }

    return (
      <div className="screen screen--call">
        <section className="call-topbar">
          <div>
            <p className="eyebrow">Live Kickoff Call</p>
            <h1>{selectedProject.name}</h1>
          </div>
          <div className="call-topbar__stats">
            <span className="top-stat">
              <CircleDot size={14} />
              {call.status === "live" ? "Connected" : "Connecting"}
            </span>
            <span className="top-stat">{formatElapsed(call.elapsedSeconds)}</span>
            <button className="control-chip control-chip--danger" onClick={endCall}>
              End call
            </button>
          </div>
        </section>

        <section className="priority-banner">
          <strong>Human host priority</strong>
          <span>
            You can speak immediately at any point. Agent hand raises remain queued and resume afterward.
          </span>
        </section>

        <section className="call-layout">
          <div className="participants-column">
            <div className="participants-grid">
              <ParticipantCard
                name={HUMAN_PARTICIPANT.name}
                role={HUMAN_PARTICIPANT.role}
                initials={HUMAN_PARTICIPANT.initials}
                accent={HUMAN_PARTICIPANT.accent}
                human
                muted={call.muted}
                state={
                  call.humanSpeaking
                    ? "priority"
                    : call.muted
                      ? "idle"
                      : call.activeSpeakerId === HUMAN_PARTICIPANT.id
                        ? "priority"
                        : "listening"
                }
              />
              {selectedAgents.map((agent) => {
                const queuePosition = participantQueuePositions.get(agent.id);
                const state =
                  call.activeSpeakerId === agent.id
                    ? "speaking"
                    : typeof queuePosition === "number"
                      ? "queued"
                      : call.elapsedSeconds >= 2
                        ? "listening"
                        : "idle";

                return (
                  <ParticipantCard
                    key={agent.id}
                    name={agent.name}
                    role={agent.role}
                    initials={agent.initials}
                    accent={agent.accent}
                    state={state}
                    queuePosition={queuePosition}
                  />
                );
              })}
            </div>

            <section className="panel queue-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Hand-Raise Queue</p>
                  <h3>Visible turn order</h3>
                </div>
              </div>
              <div className="queue-list">
                {call.queue.length > 0 ? (
                  call.queue.map((item, index) => {
                    const agent = AGENTS.find((entry) => entry.id === item.agentId);
                    if (!agent) {
                      return null;
                    }

                    return (
                      <div key={item.id} className="queue-row">
                        <span className="queue-badge">{index + 1}</span>
                        <div>
                          <strong>{agent.name}</strong>
                          <p>{agent.role}</p>
                        </div>
                        <span className="muted">{item.raiseMessage}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <Sparkles size={18} />
                    <p>No one is waiting right now. Agents will raise hands as the discussion evolves.</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="panels-column">
            <TranscriptFeed transcript={call.transcript} activity={call.activity} hidden={!call.showTranscript} />
          </div>
        </section>

        <CallControls
          muted={call.muted}
          speaking={call.humanSpeaking}
          transcriptVisible={call.showTranscript}
          onToggleMute={toggleMute}
          onToggleSpeaking={toggleHumanSpeaking}
          onToggleTranscript={toggleTranscript}
          onEndCall={endCall}
        />
      </div>
    );
  };

  const renderSummary = () => {
    if (!selectedProject || !summary) {
      return null;
    }

    return (
      <div className="screen">
        <section className="hero-card summary-hero">
          <div>
            <p className="eyebrow">Call Summary</p>
            <h1>{selectedProject.name} now has a structured planning brief.</h1>
            <p className="hero-copy">
              This mocked synthesis shows how a kickoff room can translate conversation into requirements, risks,
              architecture direction, and next actions.
            </p>
          </div>
          <div className="summary-participants">
            <strong>Participants</strong>
            <div className="summary-chips">
              <span className="tag-pill">You / Project Lead</span>
              {selectedAgents.map((agent) => (
                <span key={agent.id} className="tag-pill">
                  {agent.name} / {agent.role}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Requirements</p>
                <h3>What the call clarified</h3>
              </div>
            </div>
            <div className="bullet-stack">
              {summary.requirements.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Risks Raised</p>
                <h3>Concerns to resolve</h3>
              </div>
            </div>
            <div className="bullet-stack bullet-stack--warning">
              {summary.risks.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Architecture Ideas</p>
                <h3>Suggested system framing</h3>
              </div>
            </div>
            <div className="bullet-stack">
              {summary.architecture.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">UX Considerations</p>
                <h3>Interaction notes</h3>
              </div>
            </div>
            <div className="bullet-stack">
              {summary.ux.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>

          <article className="panel panel--wide">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Suggested Next Steps</p>
                <h3>What happens after the call</h3>
              </div>
            </div>
            <div className="bullet-stack">
              {summary.nextSteps.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <div className="summary-actions">
              <button className="ghost-button" onClick={() => setScreen("workspace")}>
                Return to project
              </button>
              <button className="primary-button" onClick={() => setIsAgentModalOpen(true)}>
                Start another call
              </button>
            </div>
          </article>
        </section>
      </div>
    );
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark">
          <div className="brand-mark__logo">AW</div>
          <div>
            <p className="eyebrow">Investor Demo Prototype</p>
            <h2>Agentic Workforce</h2>
          </div>
        </div>
        <div className="header-meta">
          <span>Mocked voice collaboration</span>
          <span>Structured kickoff workflow</span>
          <span>Human-in-control</span>
        </div>
      </header>

      {screen === "dashboard" && renderDashboard()}
      {screen === "workspace" && renderWorkspace()}
      {screen === "call" && renderCall()}
      {screen === "summary" && renderSummary()}

      {isCreateModalOpen ? (
        <Modal
          title="Create a new project"
          subtitle="Start with enough context to make the first kickoff room feel intentional."
          onClose={() => setIsCreateModalOpen(false)}
        >
          <div className="form-stack">
            <label>
              <span>Project name</span>
              <input
                value={newProject.name}
                onChange={(event) => setNewProject((current) => ({ ...current, name: event.target.value }))}
                placeholder="Voice Requirements Studio"
              />
            </label>
            <label>
              <span>Short description</span>
              <textarea
                value={newProject.description}
                onChange={(event) =>
                  setNewProject((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Define what this initiative is meant to accomplish and why the kickoff matters."
              />
            </label>
            <label>
              <span>Project type or tag</span>
              <input
                value={newProject.tag}
                onChange={(event) => setNewProject((current) => ({ ...current, tag: event.target.value }))}
                placeholder="Internal AI"
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

      {isAgentModalOpen && selectedProject ? (
        <Modal
          title="Invite specialist agents"
          subtitle={`Choose the AI roles that should join the kickoff for ${selectedProject.name}.`}
          onClose={() => setIsAgentModalOpen(false)}
          width="large"
        >
          <div className="agent-modal">
            <div className="agent-modal__toolbar">
              <div className="search-shell">
                <Search size={16} />
                <input
                  value={agentSearch}
                  onChange={(event) => setAgentSearch(event.target.value)}
                  placeholder="Search agents or perspectives"
                />
              </div>
              <div className="selection-summary">
                <strong>{selectedAgentIds.length} selected</strong>
                <span>Pick the voices you want in the room</span>
              </div>
            </div>

            <div className="agent-grid">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgentIds.includes(agent.id)}
                  onToggle={toggleAgent}
                />
              ))}
            </div>

            <div className="selected-strip">
              <div>
                <p className="eyebrow">Selected Agents</p>
                <div className="summary-chips">
                  {selectedAgents.map((agent) => (
                    <span key={agent.id} className="tag-pill">
                      {agent.name} / {agent.role}
                    </span>
                  ))}
                </div>
              </div>
              <button className="primary-button" onClick={startCall} disabled={selectedAgentIds.length === 0}>
                Start Call
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
