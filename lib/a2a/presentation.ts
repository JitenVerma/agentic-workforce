import { A2AResolvedAgent } from "@/lib/a2a/types";
import { LiveAgentProfile, Project, TranscriptEntry } from "@/lib/types";

const AGENT_ACCENTS = [
  "var(--accent-blue)",
  "var(--accent-amber)",
  "var(--accent-pink)",
  "var(--accent-green)",
  "var(--accent-violet)",
  "var(--accent-teal)",
  "var(--accent-red)",
];

function buildInitials(name: string) {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function buildRole(agent: A2AResolvedAgent) {
  return agent.card?.skills[0]?.name ?? "A2A Agent";
}

function buildPerspective(agent: A2AResolvedAgent) {
  const skills = agent.card?.skills ?? [];

  if (skills.length > 0) {
    return `Registered skills: ${skills
      .slice(0, 3)
      .map((skill) => skill.name)
      .join(" | ")}`;
  }

  return "Remote A2A participant available for live project calls.";
}

export function toLiveAgentProfile(
  agent: A2AResolvedAgent,
  index: number,
): LiveAgentProfile {
  return {
    id: agent.id,
    name: agent.card?.name ?? agent.name,
    role: buildRole(agent),
    description:
      agent.card?.description ??
      agent.description ??
      "Remote A2A agent available for structured planning calls.",
    perspective: buildPerspective(agent),
    accent: AGENT_ACCENTS[index % AGENT_ACCENTS.length],
    initials: buildInitials(agent.card?.name ?? agent.name) || "AG",
    baseUrl: agent.baseUrl,
    liveUrl: agent.liveUrl,
    status: agent.status,
    error: agent.error,
  };
}

export function buildKickoffPrompt(project: Project, agent: LiveAgentProfile) {
  return [
    `You are joining a live project kickoff call as ${agent.name}.`,
    `Project: ${project.name}`,
    `Description: ${project.description}`,
    project.notes.length > 0 ? `Notes: ${project.notes.join(" ")}` : "",
    project.openQuestions.length > 0
      ? `Open questions: ${project.openQuestions.join(" ")}`
      : "",
    "Please contribute a concise planning perspective for the call.",
    "Cover architecture, risks, or delivery tradeoffs that matter most.",
    "Keep the response compact enough to be spoken in a call setting.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFollowUpPrompt(
  project: Project,
  agent: LiveAgentProfile,
  latestHumanMessage: string,
  transcript: TranscriptEntry[],
) {
  const recentTranscript = transcript
    .slice(0, 6)
    .reverse()
    .map((entry) => `${entry.name} (${entry.role}): ${entry.message}`)
    .join("\n");

  return [
    `You are ${agent.name}, participating in an ongoing kickoff call for "${project.name}".`,
    `The host just said: ${latestHumanMessage}`,
    recentTranscript ? `Recent transcript:\n${recentTranscript}` : "",
    "Reply with your next concise contribution to the call.",
    "Keep it short enough to be spoken naturally.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function estimateSpeakingDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  return Math.max(6, Math.min(18, Math.ceil(words / 22)));
}
