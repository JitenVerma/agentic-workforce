export type ConversationMode = "voice" | "text";
export type RealtimeParticipantState = "idle" | "listening" | "thinking" | "speaking";
export type SpecialistRole = "software_engineer" | "solutions_architect";

export interface RealtimeParticipantPresence {
  id: string;
  role: string;
  name: string;
  state: RealtimeParticipantState;
}

export interface RealtimeEnvelope<TType extends string, TPayload> {
  type: TType;
  sessionId: string;
  timestamp: string;
  payload: TPayload;
}

export interface SessionStartPayload {
  roomId: string;
  projectId: string;
  projectName: string;
  projectSummary: string;
  userId?: string;
  selectedAgents: SpecialistRole[];
  conversationMode: ConversationMode;
}

export interface UserMessagePayload {
  messageId: string;
  text: string;
}

export interface AudioStartPayload {
  messageId: string;
  mimeType: string;
}

export interface AudioChunkPayload {
  messageId: string;
  chunkId: string;
  audio: string;
  mimeType: string;
}

export interface AudioEndPayload {
  messageId: string;
}

export interface SessionEndPayload {
  reason?: string;
}

export interface PingPayload {
  nonce?: string;
}

export type SessionStartMessage = RealtimeEnvelope<"session_start", SessionStartPayload>;
export type UserMessage = RealtimeEnvelope<"user_message", UserMessagePayload>;
export type PingMessage = RealtimeEnvelope<"ping", PingPayload>;
export type AudioStartMessage = RealtimeEnvelope<"audio_start", AudioStartPayload>;
export type AudioChunkMessage = RealtimeEnvelope<"audio_chunk", AudioChunkPayload>;
export type AudioEndMessage = RealtimeEnvelope<"audio_end", AudioEndPayload>;
export type SessionEndMessage = RealtimeEnvelope<"session_end", SessionEndPayload>;

export type ClientRealtimeMessage =
  | SessionStartMessage
  | UserMessage
  | PingMessage
  | AudioStartMessage
  | AudioChunkMessage
  | AudioEndMessage
  | SessionEndMessage;

export interface ConnectionAckPayload {
  gateway: string;
  inputAudioMimeType: string;
  outputAudioMimeType: string;
}

export interface SessionStartedPayload {
  roomId: string;
  projectId: string;
  projectName: string;
  selectedAgents: string[];
  participants: RealtimeParticipantPresence[];
}

export interface ParticipantStatePayload {
  participantId: string;
  role: string;
  name: string;
  state: RealtimeParticipantState;
  detail?: string;
}

export interface TranscriptPayload {
  messageId: string;
  participantId: string;
  participantRole: string;
  participantName: string;
  text: string;
  isFinal: boolean;
}

export interface AudioResponsePayload {
  messageId: string;
  participantId: string;
  participantRole: string;
  participantName: string;
  audio: string;
  mimeType: string;
}

export interface SpecialistInvokedPayload {
  specialistRole: string;
  specialistName: string;
  requestSummary: string;
}

export interface SpecialistResponsePayload {
  specialistRole: string;
  specialistName: string;
  summary: string;
  publicMessage?: string;
  confidence?: number;
}

export interface TurnCompletePayload {
  turnId: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}

export type ConnectionAckEvent = RealtimeEnvelope<"connection_ack", ConnectionAckPayload>;
export type SessionStartedEvent = RealtimeEnvelope<"session_started", SessionStartedPayload>;
export type ParticipantStateEvent = RealtimeEnvelope<"participant_state", ParticipantStatePayload>;
export type CoordinatorListeningEvent = RealtimeEnvelope<"coordinator_listening", { messageId: string }>;
export type CoordinatorThinkingEvent = RealtimeEnvelope<"coordinator_thinking", { messageId: string }>;
export type SpecialistInvokedEvent = RealtimeEnvelope<"specialist_invoked", SpecialistInvokedPayload>;
export type SpecialistResponseEvent = RealtimeEnvelope<"specialist_response", SpecialistResponsePayload>;
export type TranscriptDeltaEvent = RealtimeEnvelope<"transcript_delta", TranscriptPayload>;
export type TranscriptCompleteEvent = RealtimeEnvelope<"transcript_complete", TranscriptPayload>;
export type AudioResponseChunkEvent = RealtimeEnvelope<"audio_response_chunk", AudioResponsePayload>;
export type AudioResponseCompleteEvent = RealtimeEnvelope<"audio_response_complete", { messageId: string }>;
export type ResponseChunkEvent = RealtimeEnvelope<"response_chunk", TranscriptPayload>;
export type ResponseCompleteEvent = RealtimeEnvelope<"response_complete", TranscriptPayload>;
export type TurnCompleteEvent = RealtimeEnvelope<"turn_complete", TurnCompletePayload>;
export type ErrorEvent = RealtimeEnvelope<"error", ErrorPayload>;
export type PongEvent = RealtimeEnvelope<"pong", PingPayload>;

export type ServerRealtimeEvent =
  | ConnectionAckEvent
  | SessionStartedEvent
  | ParticipantStateEvent
  | CoordinatorListeningEvent
  | CoordinatorThinkingEvent
  | SpecialistInvokedEvent
  | SpecialistResponseEvent
  | TranscriptDeltaEvent
  | TranscriptCompleteEvent
  | AudioResponseChunkEvent
  | AudioResponseCompleteEvent
  | ResponseChunkEvent
  | ResponseCompleteEvent
  | TurnCompleteEvent
  | ErrorEvent
  | PongEvent;

export function createClientEnvelope<TType extends ClientRealtimeMessage["type"], TPayload>(
  type: TType,
  sessionId: string,
  payload: TPayload,
): RealtimeEnvelope<TType, TPayload> {
  return {
    type,
    sessionId,
    timestamp: new Date().toISOString(),
    payload,
  };
}
