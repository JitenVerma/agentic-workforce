"use client";

import {
  FormEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Bot, RefreshCcw, Send, Sparkles, Unplug } from "lucide-react";
import {
  A2AAgentMessageResponse,
  A2AAgentsResponse,
  A2AResolvedAgent,
} from "@/lib/a2a/types";
import { Project } from "@/lib/types";

interface A2AAgentConsoleProps {
  project: Project;
}

interface ThreadEntry {
  id: string;
  role: "user" | "agent" | "system";
  title: string;
  message: string;
  meta?: string;
}

interface ThreadState {
  contextId?: string;
  taskId?: string;
  entries: ThreadEntry[];
}

function createThreadEntry(
  role: ThreadEntry["role"],
  title: string,
  message: string,
  meta?: string,
): ThreadEntry {
  return {
    id: crypto.randomUUID(),
    role,
    title,
    message,
    meta,
  };
}

function buildProjectPrompt(project: Project, agentName: string) {
  return [
    `You are ${agentName}, advising on the project "${project.name}".`,
    `Project context: ${project.description}`,
    "Please help me clarify the architecture, main risks, and recommended next steps.",
  ].join("\n");
}

function buildResponseMeta(response: A2AAgentMessageResponse) {
  const details = [];

  if (response.kind === "task" && response.state) {
    details.push(`Task state: ${response.state}`);
  }

  if (response.taskId) {
    details.push(`Task: ${response.taskId}`);
  }

  if (response.contextId) {
    details.push(`Context: ${response.contextId}`);
  }

  return details.join(" | ");
}

export function A2AAgentConsole({ project }: A2AAgentConsoleProps) {
  const [agents, setAgents] = useState<A2AResolvedAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [draft, setDraft] = useState("");
  const [threads, setThreads] = useState<Record<string, ThreadState>>({});
  const [isSending, setIsSending] = useState(false);

  const deferredAgentSearch = useDeferredValue(agentSearch);

  async function loadAgents() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/a2a/agents", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load A2A agents.");
      }

      const payload = (await response.json()) as A2AAgentsResponse;

      startTransition(() => {
        setAgents(payload.agents);
        setSelectedAgentId((current) => {
          if (current && payload.agents.some((agent) => agent.id === current)) {
            return current;
          }

          return (
            payload.agents.find((agent) => agent.status === "online")?.id ??
            payload.agents[0]?.id ??
            ""
          );
        });
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load A2A agents.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAgents();
  }, []);

  const filteredAgents = useMemo(() => {
    const query = deferredAgentSearch.trim().toLowerCase();

    if (!query) {
      return agents;
    }

    return agents.filter((agent) =>
      [
        agent.name,
        agent.description ?? "",
        agent.card?.description ?? "",
        ...(agent.card?.skills.map((skill) => skill.name) ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [agents, deferredAgentSearch]);

  const selectedAgent = useMemo(
    () =>
      filteredAgents.find((agent) => agent.id === selectedAgentId) ??
      agents.find((agent) => agent.id === selectedAgentId) ??
      filteredAgents[0] ??
      agents[0],
    [agents, filteredAgents, selectedAgentId],
  );

  const activeThread = selectedAgent
    ? threads[selectedAgent.id] ?? { entries: [] }
    : { entries: [] };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAgent || selectedAgent.status !== "online" || !draft.trim()) {
      return;
    }

    const prompt = draft.trim();
    const userEntry = createThreadEntry("user", "You", prompt);
    const agentId = selectedAgent.id;
    const currentThread = threads[agentId] ?? { entries: [] };

    setDraft("");
    setIsSending(true);

    startTransition(() => {
      setThreads((current) => {
        const thread = current[agentId] ?? { entries: [] };

        return {
          ...current,
          [agentId]: {
            ...thread,
            entries: [...thread.entries, userEntry],
          },
        };
      });
    });

    try {
      const response = await fetch(`/api/a2a/agents/${agentId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          contextId: currentThread.contextId,
          taskId: currentThread.taskId,
        }),
      });

      const payload = (await response.json()) as
        | A2AAgentMessageResponse
        | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "The A2A agent request failed.";
        throw new Error(message);
      }

      if (!("kind" in payload)) {
        throw new Error("The A2A agent returned an unexpected response.");
      }

      const agentEntry = createThreadEntry(
        "agent",
        selectedAgent.name,
        payload.text,
        buildResponseMeta(payload),
      );

      startTransition(() => {
        setThreads((current) => {
          const thread = current[agentId] ?? { entries: [] };

          return {
            ...current,
            [agentId]: {
              contextId: payload.contextId ?? thread.contextId,
              taskId: payload.taskId ?? thread.taskId,
              entries: [...thread.entries, agentEntry],
            },
          };
        });
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The A2A agent request failed.";

      startTransition(() => {
        setThreads((current) => {
          const thread = current[agentId] ?? { entries: [] };

          return {
            ...current,
            [agentId]: {
              ...thread,
              entries: [
                ...thread.entries,
                createThreadEntry("system", "Connection issue", message),
              ],
            },
          };
        });
      });
    } finally {
      setIsSending(false);
    }
  }

  function loadProjectPrompt() {
    if (!selectedAgent) {
      return;
    }

    setDraft(buildProjectPrompt(project, selectedAgent.name));
  }

  function resetThread() {
    if (!selectedAgent) {
      return;
    }

    startTransition(() => {
      setThreads((current) => ({
        ...current,
        [selectedAgent.id]: {
          entries: [],
        },
      }));
    });
  }

  return (
    <div className="a2a-console">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Live A2A Integration</p>
          <h3>Discover and message remote agents</h3>
        </div>
        <button className="ghost-button" onClick={() => void loadAgents()}>
          <RefreshCcw size={16} />
          Refresh Registry
        </button>
      </div>

      <div className="a2a-console__layout">
        <div className="a2a-console__sidebar">
          <div className="search-shell">
            <Sparkles size={16} />
            <input
              value={agentSearch}
              onChange={(event) => setAgentSearch(event.target.value)}
              placeholder="Search registered A2A agents"
            />
          </div>

          <div className="a2a-agent-list">
            {isLoading ? (
              <div className="empty-state">
                <Sparkles size={18} />
                <p>Loading the A2A registry and fetching live agent cards.</p>
              </div>
            ) : loadError ? (
              <div className="empty-state">
                <Unplug size={18} />
                <p>{loadError}</p>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="empty-state">
                <Bot size={18} />
                <p>No registered A2A agents matched this search.</p>
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  className={`a2a-agent-item${selectedAgent?.id === agent.id ? " a2a-agent-item--selected" : ""}`}
                  onClick={() => setSelectedAgentId(agent.id)}
                  type="button"
                >
                  <div className="a2a-agent-item__header">
                    <div>
                      <strong>{agent.card?.name ?? agent.name}</strong>
                      <p>{agent.description ?? agent.card?.description ?? "No description available."}</p>
                    </div>
                    <span
                      className={`a2a-status-pill a2a-status-pill--${agent.status}`}
                    >
                      {agent.status}
                    </span>
                  </div>

                  <div className="a2a-agent-item__meta">
                    <span>{agent.baseUrl}</span>
                    <span>
                      {agent.card?.skills.length ?? 0} skill
                      {(agent.card?.skills.length ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>

                  {agent.status === "offline" && agent.error ? (
                    <p className="a2a-agent-item__error">{agent.error}</p>
                  ) : null}

                  {agent.card?.skills.length ? (
                    <div className="summary-chips">
                      {agent.card.skills.slice(0, 3).map((skill) => (
                        <span key={skill.id} className="tag-pill">
                          {skill.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="a2a-console__main">
          {selectedAgent ? (
            <>
              <div className="a2a-console__agent">
                <div>
                  <p className="eyebrow">Selected Agent</p>
                  <h3>{selectedAgent.card?.name ?? selectedAgent.name}</h3>
                  <p className="hero-copy a2a-console__copy">
                    {selectedAgent.card?.description ??
                      selectedAgent.description ??
                      "No description available."}
                  </p>
                </div>
                <div className="a2a-console__agent-meta">
                  <span className="tag-pill">{selectedAgent.baseUrl}</span>
                  {activeThread.contextId ? (
                    <span className="tag-pill">Context active</span>
                  ) : null}
                  {activeThread.taskId ? (
                    <span className="tag-pill">Task attached</span>
                  ) : null}
                </div>
              </div>

              <div className="a2a-thread">
                {activeThread.entries.length > 0 ? (
                  activeThread.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`a2a-thread-entry a2a-thread-entry--${entry.role}`}
                    >
                      <div className="a2a-thread-entry__header">
                        <strong>{entry.title}</strong>
                        {entry.meta ? <span>{entry.meta}</span> : null}
                      </div>
                      <p>{entry.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Bot size={18} />
                    <p>
                      Start a conversation with this agent. The console will
                      keep the returned A2A context and task identifiers for the
                      next turn.
                    </p>
                  </div>
                )}
              </div>

              <form className="a2a-composer" onSubmit={handleSubmit}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Ask ${selectedAgent.name} to help with ${project.name}.`}
                />
                <div className="a2a-composer__actions">
                  <button
                    className="ghost-button"
                    onClick={loadProjectPrompt}
                    type="button"
                  >
                    Use Project Brief
                  </button>
                  <button
                    className="ghost-button"
                    onClick={resetThread}
                    type="button"
                  >
                    Reset Thread
                  </button>
                  <button
                    className="primary-button"
                    disabled={isSending || selectedAgent.status !== "online"}
                    type="submit"
                  >
                    <Send size={16} />
                    {isSending ? "Sending..." : "Send to Agent"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="empty-state">
              <Bot size={18} />
              <p>Register an A2A agent to begin testing live conversations.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
