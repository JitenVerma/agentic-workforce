import { Project } from "@/lib/types";

export type RoomStatus = "ready" | "live" | "ended";

export type RoomParticipantRole =
  | "human"
  | "conductor"
  | "software_engineer"
  | "solutions_architect";

export type RoomParticipantState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking";

export type RoomVisibility = "public" | "internal";

export type AgentTaskStatus = "queued" | "running" | "completed" | "failed";

export interface RoomParticipant {
  id: string;
  role: RoomParticipantRole;
  name: string;
  title: string;
  type: "human" | "agent";
  state: RoomParticipantState;
  initials: string;
  accent: string;
  description: string;
  a2aAgentId?: string;
  publicSpeaker: boolean;
}

export interface RoomTranscriptMessage {
  id: string;
  roomSessionId: string;
  participantId: string;
  role: RoomParticipantRole;
  participantName: string;
  participantTitle: string;
  visibility: RoomVisibility;
  content: string;
  createdAt: string;
  timestampLabel: string;
}

export interface AgentTask {
  id: string;
  roomSessionId: string;
  agentRole: Exclude<RoomParticipantRole, "human">;
  status: AgentTaskStatus;
  visibility: RoomVisibility;
  prompt: string;
  summary: string;
  rawResponse?: string;
  error?: string;
  structuredResponse?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSession {
  id: string;
  projectId: string;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  project: Project;
  participants: RoomParticipant[];
  transcript: RoomTranscriptMessage[];
  agentTasks: AgentTask[];
  currentPublicSpeakerId: string | null;
}

export type RoomEventType =
  | "room.snapshot"
  | "room.status.updated"
  | "participant.updated"
  | "transcript.appended"
  | "task.updated";

export interface RoomSnapshotEvent {
  id: string;
  type: "room.snapshot";
  roomSessionId: string;
  createdAt: string;
  payload: {
    room: RoomSession;
  };
}

export interface RoomStatusUpdatedEvent {
  id: string;
  type: "room.status.updated";
  roomSessionId: string;
  createdAt: string;
  payload: {
    status: RoomStatus;
    currentPublicSpeakerId: string | null;
  };
}

export interface RoomParticipantUpdatedEvent {
  id: string;
  type: "participant.updated";
  roomSessionId: string;
  createdAt: string;
  payload: {
    participant: RoomParticipant;
  };
}

export interface RoomTranscriptAppendedEvent {
  id: string;
  type: "transcript.appended";
  roomSessionId: string;
  createdAt: string;
  payload: {
    message: RoomTranscriptMessage;
  };
}

export interface RoomTaskUpdatedEvent {
  id: string;
  type: "task.updated";
  roomSessionId: string;
  createdAt: string;
  payload: {
    task: AgentTask;
  };
}

export type RoomEvent =
  | RoomSnapshotEvent
  | RoomStatusUpdatedEvent
  | RoomParticipantUpdatedEvent
  | RoomTranscriptAppendedEvent
  | RoomTaskUpdatedEvent;

export interface CreateRoomRequest {
  project: Project;
}

export interface CreateRoomResponse {
  room: RoomSession;
}

export interface RoomMessageRequest {
  text: string;
}

export interface RoomMessageResponse {
  accepted: true;
  roomSessionId: string;
}

export interface RoomSessionResponse {
  room: RoomSession;
}
