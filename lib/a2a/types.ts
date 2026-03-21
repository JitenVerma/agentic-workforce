export interface A2AAgentRegistration {
  id: string;
  name: string;
  baseUrl: string;
  cardPath?: string;
  liveUrl?: string;
  description?: string;
  serviceParameters?: Record<string, string>;
}

export interface A2AAgentSkillSummary {
  id: string;
  name: string;
  description?: string;
  tags: string[];
}

export interface A2AAgentCardSummary {
  name: string;
  description: string;
  url: string;
  version?: string;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  supportsStreaming: boolean;
  supportsPushNotifications: boolean;
  skills: A2AAgentSkillSummary[];
}

export interface A2AResolvedAgent {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  cardPath?: string;
  liveUrl?: string;
  status: "online" | "offline";
  error?: string;
  card?: A2AAgentCardSummary;
}

export interface A2ATextArtifact {
  artifactId: string;
  name?: string;
  description?: string;
  text: string;
}

export interface A2AAgentMessageRequest {
  text: string;
  contextId?: string;
  taskId?: string;
}

export interface A2AAgentMessageResponse {
  agentId: string;
  agentName: string;
  kind: "message" | "task";
  text: string;
  contextId?: string;
  taskId?: string;
  state?: string;
  artifacts: A2ATextArtifact[];
}

export interface A2AAgentsResponse {
  agents: A2AResolvedAgent[];
}
