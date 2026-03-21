"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
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
import { A2AAgentConsole } from "@/components/a2a-agent-console";
import { CallControls } from "@/components/call-controls";
import { LiveVoiceAgentPanel } from "@/components/live-voice-agent-panel";
import { Modal } from "@/components/modal";
import { ParticipantCard } from "@/components/participant-card";
import { ProjectCard } from "@/components/project-card";
import { TranscriptFeed } from "@/components/transcript-feed";
import {
  buildFollowUpPrompt,
  buildKickoffPrompt,
  estimateSpeakingDuration,
  toLiveAgentProfile,
} from "@/lib/a2a/presentation";
import {
  A2AAgentMessageResponse,
  A2AAgentsResponse,
  A2AResolvedAgent,
} from "@/lib/a2a/types";
import {
  buildCallSummary,
  HUMAN_PARTICIPANT,
  INITIAL_PROJECTS,
} from "@/lib/mock-data";
import {
  ActivityEntry,
  CallSession,
  CallSummary,
  DemoEvent,
  LiveAgentProfile,
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

function createQueuedAgentEvent(
  agent: LiveAgentProfile,
  payload: A2AAgentMessageResponse,
): DemoEvent {
  return {
    id: `event-${agent.id}-${crypto.randomUUID()}`,
    at: 0,
    agentId: agent.id,
    duration: estimateSpeakingDuration(payload.text),
    raiseMessage: `${agent.name} has a contribution ready.`,
    transcript: payload.text,
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
  const [availableA2AAgents, setAvailableA2AAgents] = useState<A2AResolvedAgent[]>([]);
  const [isLoadingA2AAgents, setIsLoadingA2AAgents] = useState(true);
  const [a2aAgentError, setA2AAgentError] = useState<string | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [call, setCall] = useState<CallSession | null>(null);
  const [summary, setSummary] = useState<CallSummary | null>(null);

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

  const liveAgents = useMemo(
    () => availableA2AAgents.map((agent, index) => toLiveAgentProfile(agent, index)),
    [availableA2AAgents],
  );

  const filteredAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) {
      return liveAgents;
    }

    return liveAgents.filter((agent) =>
      [agent.name, agent.role, agent.description, agent.perspective, agent.baseUrl]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [agentSearch, liveAgents]);

  const selectedAgents = useMemo(
    () => liveAgents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [liveAgents, selectedAgentIds],
  );

  const callAgents = useMemo(
    () =>
      call
        ? liveAgents.filter((agent) => call.selectedAgentIds.includes(agent.id))
        : [],
    [call, liveAgents],
  );

  const findAgentById = (agentId: string | null | undefined) =>
    liveAgents.find((agent) => agent.id === agentId);

  useEffect(() => {
    let active = true;

    async function loadA2AAgents() {
      setIsLoadingA2AAgents(true);
      setA2AAgentError(null);

      try {
        const response = await fetch("/api/a2a/agents", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Unable to load A2A agents for the call roster.");
        }

        const payload = (await response.json()) as A2AAgentsResponse;
        if (!active) {
          return;
        }

        startTransition(() => {
          setAvailableA2AAgents(payload.agents);
          setSelectedAgentIds((current) => {
            const currentIds = current.filter((id) =>
              payload.agents.some((agent) => agent.id === id && agent.status === "online"),
            );

            if (currentIds.length > 0) {
              return currentIds;
            }

            return payload.agents
              .filter((agent) => agent.status === "online")
              .slice(0, 4)
              .map((agent) => agent.id);
          });
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setA2AAgentError(
          error instanceof Error
            ? error.message
            : "Unable to load A2A agents for the call roster.",
        );
      } finally {
        if (active) {
          setIsLoadingA2AAgents(false);
        }
      }
    }

    void loadA2AAgents();

    return () => {
      active = false;
    };
  }, []);

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

        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [call, screen, selectedProject, liveAgents]);

  useEffect(() => {
    if (
      screen !== "call" ||
      !call ||
      call.status !== "live" ||
      call.humanSpeaking ||
      call.activeSpeakerId ||
      call.queue.length === 0
    ) {
      return;
    }

    const [nextSpeech, ...remainingQueue] = call.queue;
    const agent = findAgentById(nextSpeech.agentId);

    setCall((current) => {
      if (!current) {
        return current;
      }

      if (!agent) {
        return {
          ...current,
          queue: remainingQueue,
        };
      }

      return {
        ...current,
        queue: remainingQueue,
        activeSpeakerId: agent.id,
        activeSpeakerKind: "agent",
        activeRemaining: nextSpeech.duration,
        currentSpeech: nextSpeech,
        transcript: [
          createTranscript(
            current.elapsedSeconds,
            agent.id,
            agent.name,
            agent.role,
            "agent",
            nextSpeech.transcript,
          ),
          ...current.transcript,
        ],
        activity: [
          createActivity("Agent speaking", `${agent.name} now has the floor.`, "info"),
          ...current.activity,
        ],
      };
    });
  }, [call, screen, liveAgents]);

  useEffect(() => {
    if (
      screen !== "call" ||
      !call ||
      call.activeSpeakerKind !== "agent" ||
      !call.currentSpeech
    ) {
      return;
    }

    const speechId = call.currentSpeech.id;
    const timeout = window.setTimeout(() => {
      setCall((current) => {
        if (!current || current.currentSpeech?.id !== speechId) {
          return current;
        }

        return {
          ...current,
          activeSpeakerId: null,
          activeSpeakerKind: null,
          activeRemaining: 0,
          currentSpeech: null,
          humanSpeaking: false,
        };
      });
    }, Math.max(1500, call.currentSpeech.duration * 1000));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [screen, call?.activeSpeakerKind, call?.currentSpeech?.id]);

  useEffect(() => {
    if (screen !== "call" || !call || call.status !== "live" || !selectedProject) {
      return;
    }

    const agentsToPrompt = call.selectedAgentIds
      .map((agentId) => findAgentById(agentId))
      .filter(
        (agent): agent is LiveAgentProfile => {
          if (!agent) {
            return false;
          }

          return (
            agent.status === "online" &&
            !call.pendingAgentIds.includes(agent.id) &&
            !call.respondedAgentIds.includes(agent.id)
          );
        },
      );

    if (agentsToPrompt.length === 0) {
      return;
    }

    setCall((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        pendingAgentIds: Array.from(
          new Set([...current.pendingAgentIds, ...agentsToPrompt.map((agent) => agent.id)]),
        ),
        activity: [
          createActivity(
            "Agent prompts sent",
            `Sent kickoff context to ${agentsToPrompt.map((agent) => agent.name).join(", ")}.`,
            "info",
          ),
          ...current.activity,
        ],
      };
    });

    let cancelled = false;

    for (const agent of agentsToPrompt) {
      void (async () => {
        try {
          const response = await fetch(`/api/a2a/agents/${agent.id}/message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: buildKickoffPrompt(selectedProject, agent),
            }),
          });

          const payload = (await response.json()) as
            | A2AAgentMessageResponse
            | { error?: string };

          if (!response.ok) {
            const message =
              "error" in payload && payload.error
                ? payload.error
                : `Unable to get a response from ${agent.name}.`;
            throw new Error(message);
          }

          if (!("kind" in payload) || cancelled) {
            return;
          }

          setCall((current) => {
            if (!current) {
              return current;
            }

            const event = createQueuedAgentEvent(agent, payload);

            return {
              ...current,
              pendingAgentIds: current.pendingAgentIds.filter((id) => id !== agent.id),
              respondedAgentIds: Array.from(new Set([...current.respondedAgentIds, agent.id])),
              agentSessions: {
                ...current.agentSessions,
                [agent.id]: {
                  contextId: payload.contextId ?? current.agentSessions[agent.id]?.contextId,
                  taskId: payload.taskId ?? current.agentSessions[agent.id]?.taskId,
                },
              },
              queue: [...current.queue, event],
              activity: [
                createActivity("Hand raised", `${agent.name} is ready to speak.`, "queue"),
                ...current.activity,
              ],
            };
          });
        } catch (error) {
          if (cancelled) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : `Unable to get a response from ${agent.name}.`;

          setCall((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              pendingAgentIds: current.pendingAgentIds.filter((id) => id !== agent.id),
              activity: [
                createActivity("Agent unavailable", `${agent.name}: ${message}`, "info"),
                ...current.activity,
              ],
              transcript: [
                createTranscript(current.elapsedSeconds, "system", "System", "A2A Status", "system", `${agent.name} did not respond: ${message}`),
                ...current.transcript,
              ],
            };
          });
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [call, screen, selectedProject, liveAgents]);

  useEffect(() => {
    if (
      screen !== "call" ||
      !call ||
      call.status !== "live" ||
      !selectedProject ||
      call.humanSpeaking ||
      call.pendingAgentIds.length > 0 ||
      call.activeSpeakerKind !== null ||
      call.queue.length > 0
    ) {
      return;
    }

    const latestHumanEntry = call.transcript.find((entry) => entry.kind === "human");
    if (!latestHumanEntry || latestHumanEntry.id === call.lastBroadcastHumanEntryId) {
      return;
    }

    const agentsToPrompt = call.selectedAgentIds
      .map((agentId) => findAgentById(agentId))
      .filter((agent): agent is LiveAgentProfile => {
        if (!agent) {
          return false;
        }

        return agent.status === "online" && !call.pendingAgentIds.includes(agent.id);
      });

    if (agentsToPrompt.length === 0) {
      return;
    }

    const humanEntryId = latestHumanEntry.id;

    setCall((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        pendingAgentIds: Array.from(
          new Set([...current.pendingAgentIds, ...agentsToPrompt.map((agent) => agent.id)]),
        ),
        lastBroadcastHumanEntryId: humanEntryId,
        activity: [
          createActivity(
            "Live follow-up sent",
            `Shared the host's latest call update with ${agentsToPrompt
              .map((agent) => agent.name)
              .join(", ")}.`,
            "info",
          ),
          ...current.activity,
        ],
      };
    });

    let cancelled = false;

    for (const agent of agentsToPrompt) {
      const session = call.agentSessions[agent.id];

      void (async () => {
        try {
          const response = await fetch(`/api/a2a/agents/${agent.id}/message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: buildFollowUpPrompt(
                selectedProject,
                agent,
                latestHumanEntry.message,
                call.transcript,
              ),
              contextId: session?.contextId,
              taskId: session?.taskId,
            }),
          });

          const payload = (await response.json()) as
            | A2AAgentMessageResponse
            | { error?: string };

          if (!response.ok) {
            const message =
              "error" in payload && payload.error
                ? payload.error
                : `Unable to get a response from ${agent.name}.`;
            throw new Error(message);
          }

          if (!("kind" in payload) || cancelled) {
            return;
          }

          setCall((current) => {
            if (!current) {
              return current;
            }

            const event = createQueuedAgentEvent(agent, payload);

            return {
              ...current,
              pendingAgentIds: current.pendingAgentIds.filter((id) => id !== agent.id),
              respondedAgentIds: Array.from(new Set([...current.respondedAgentIds, agent.id])),
              agentSessions: {
                ...current.agentSessions,
                [agent.id]: {
                  contextId: payload.contextId ?? current.agentSessions[agent.id]?.contextId,
                  taskId: payload.taskId ?? current.agentSessions[agent.id]?.taskId,
                },
              },
              queue: [...current.queue, event],
              activity: [
                createActivity("Hand raised", `${agent.name} is ready to respond to the host.`, "queue"),
                ...current.activity,
              ],
            };
          });
        } catch (error) {
          if (cancelled) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : `Unable to get a response from ${agent.name}.`;

          setCall((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              pendingAgentIds: current.pendingAgentIds.filter((id) => id !== agent.id),
              activity: [
                createActivity("Agent unavailable", `${agent.name}: ${message}`, "info"),
                ...current.activity,
              ],
              transcript: [
                createTranscript(
                  current.elapsedSeconds,
                  "system",
                  "System",
                  "A2A Status",
                  "system",
                  `${agent.name} did not respond to the latest host update: ${message}`,
                ),
                ...current.transcript,
              ],
            };
          });
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [call, screen, selectedProject, liveAgents]);

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
    const agent = findAgentById(agentId);
    if (!agent || agent.status !== "online") {
      return;
    }

    setSelectedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  };

  const startCall = () => {
    if (!selectedProject || selectedAgentIds.length === 0) {
      return;
    }

    const roomStatusEntry = createTranscript(
      0,
      "system",
      "System",
      "Room Status",
      "system",
      "Kickoff room is preparing participants and syncing context.",
    );
    const openingHumanEntry = createTranscript(
      1,
      HUMAN_PARTICIPANT.id,
      HUMAN_PARTICIPANT.name,
      HUMAN_PARTICIPANT.role,
      "human",
      `I want this call to define the strongest version of ${selectedProject.name} and capture concrete next steps.`,
    );

    setCall({
      projectId: selectedProject.id,
      selectedAgentIds,
      pendingAgentIds: [],
      respondedAgentIds: [],
      agentSessions: {},
      lastBroadcastHumanEntryId: openingHumanEntry.id,
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
      transcript: [roomStatusEntry, openingHumanEntry],
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
    if (!call || call.muted) {
      return;
    }

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
            createActivity("Host released the floor", "Queued agent turns can resume now.", "priority"),
            ...current.activity,
          ],
        };
      }

      const interruptedAgent =
        current.activeSpeakerKind === "agent"
          ? findAgentById(current.activeSpeakerId)
          : null;

      return {
        ...current,
        humanSpeaking: true,
        activeSpeakerId: HUMAN_PARTICIPANT.id,
        activeSpeakerKind: "human",
        activeRemaining: 0,
        currentSpeech: null,
        activity: [
          createActivity(
            "Host has the floor",
            interruptedAgent
              ? `The host interrupted ${interruptedAgent.name} and is speaking directly over the live audio link.`
              : "The host is speaking directly over the live audio link, so async agent turns are paused.",
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
            Invite live A2A agents, coordinate the room, and open a direct speech-to-speech link with an ADK voice agent while the workspace captures planning outcomes.
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

          <article className="panel panel--wide">
            <A2AAgentConsole project={selectedProject} />
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
          <strong>Direct voice is live-first</strong>
          <span>
            Use the live voice panel to talk to one selected ADK agent over raw audio. The room queue on this screen stays available for async A2A contributions.
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
              {callAgents.map((agent) => {
                    const queuePosition = participantQueuePositions.get(agent.id);
                    const state =
                      call.activeSpeakerId === agent.id
                        ? "speaking"
                        : call.pendingAgentIds.includes(agent.id)
                          ? "thinking"
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
                    const agent = findAgentById(item.agentId);
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
            <LiveVoiceAgentPanel agents={callAgents} muted={call.muted} />
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
              This summary shows how the kickoff room can translate conversation into requirements, risks, architecture direction, and next actions.
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
          <span>Live ADK voice collaboration</span>
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
          title="Invite A2A agents"
          subtitle={`Choose the live A2A participants that should join the kickoff for ${selectedProject.name}.`}
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
                <span>Pick the live A2A participants you want in the room</span>
              </div>
            </div>

            <div className="agent-grid">
              {isLoadingA2AAgents ? (
                <div className="empty-state agent-grid__empty">
                  <Sparkles size={18} />
                  <p>Loading the live A2A roster.</p>
                </div>
              ) : a2aAgentError ? (
                <div className="empty-state agent-grid__empty">
                  <BriefcaseBusiness size={18} />
                  <p>{a2aAgentError}</p>
                </div>
              ) : filteredAgents.length > 0 ? (
                filteredAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    selected={selectedAgentIds.includes(agent.id)}
                    onToggle={toggleAgent}
                    disabled={agent.status !== "online"}
                    footerLabel={
                      agent.status === "online"
                        ? undefined
                        : agent.error ?? "Offline or unreachable"
                    }
                    statusLabel={agent.status === "online" ? "A2A live" : "Offline"}
                  />
                ))
              ) : (
                <div className="empty-state agent-grid__empty">
                  <Users size={18} />
                  <p>No A2A agents matched this search.</p>
                </div>
              )}
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
              <button
                className="primary-button"
                onClick={startCall}
                disabled={
                  selectedAgentIds.length === 0 ||
                  isLoadingA2AAgents ||
                  selectedAgents.length === 0
                }
              >
                Start Call
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
