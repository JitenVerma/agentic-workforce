export type ProjectStatus = "Draft" | "Active" | "Review";

export type AgentRole = string;

export type Screen = "dashboard" | "workspace" | "call" | "summary";

export type ParticipantState =
  | "idle"
  | "listening"
  | "speaking"
  | "thinking"
  | "hand-raised"
  | "queued"
  | "priority";

export interface CallRecord {
  id: string;
  title: string;
  startedAt: string;
  duration: string;
  outcome: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  lastUpdated: string;
  status: ProjectStatus;
  tag?: string;
  notes: string[];
  requirementsDraft: string[];
  openQuestions: string[];
  recentCalls: CallRecord[];
}

export interface AgentProfile {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  perspective: string;
  accent: string;
  initials: string;
}

export interface LiveAgentProfile extends AgentProfile {
  baseUrl: string;
  liveUrl?: string;
  status: "online" | "offline";
  error?: string;
}

export interface CallAgentSession {
  contextId?: string;
  taskId?: string;
}

export interface TranscriptEntry {
  id: string;
  participantId: string;
  name: string;
  role: string;
  kind: "human" | "agent" | "system";
  message: string;
  timestamp: string;
}

export interface ActivityEntry {
  id: string;
  label: string;
  detail: string;
  tone: "info" | "queue" | "priority";
}

export interface DemoEvent {
  id: string;
  at: number;
  agentId: string;
  duration: number;
  raiseMessage: string;
  transcript: string;
}

export interface CallSummary {
  requirements: string[];
  risks: string[];
  architecture: string[];
  ux: string[];
  nextSteps: string[];
}

export interface CallSession {
  projectId: string;
  selectedAgentIds: string[];
  pendingAgentIds: string[];
  respondedAgentIds: string[];
  agentSessions: Record<string, CallAgentSession>;
  lastBroadcastHumanEntryId: string | null;
  elapsedSeconds: number;
  status: "connecting" | "live";
  muted: boolean;
  showTranscript: boolean;
  humanSpeaking: boolean;
  activeSpeakerId: string | null;
  activeSpeakerKind: "human" | "agent" | null;
  activeRemaining: number;
  currentSpeech: DemoEvent | null;
  queue: DemoEvent[];
  transcript: TranscriptEntry[];
  activity: ActivityEntry[];
}
