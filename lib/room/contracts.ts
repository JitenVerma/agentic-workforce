import { RoomParticipantRole } from "@/lib/room/types";

export interface SpecialistAgentResponse {
  summary: string;
  detailedResponse: string;
  shouldSpeakPublicly: boolean;
  publicMessage: string;
  priority: "low" | "medium" | "high";
  confidence: number;
  followUps: string[];
  suggestedArtifacts: string[];
  addressedTo: "conductor";
  needsAnotherAgent: boolean;
  anotherAgentRole: Extract<
    RoomParticipantRole,
    "software_engineer" | "solutions_architect"
  > | null;
}

export interface ConductorRoutingDecision {
  classification:
    | "direct_answer"
    | "software_engineer"
    | "solutions_architect"
    | "sequence_both"
    | "parallel_both";
  responseMode: "conductor_only" | "specialists_then_conductor" | "ordered_specialists";
  shouldConsultSoftwareEngineer: boolean;
  shouldConsultSolutionsArchitect: boolean;
  shouldAnswerDirectly: boolean;
  directResponse: string;
  conductorAcknowledgement: string;
  softwareEngineerBrief: string;
  solutionsArchitectBrief: string;
  reasoning: string;
}

export interface PublicTranscriptMessagePlan {
  speaker: Exclude<RoomParticipantRole, "human">;
  message: string;
}

export interface ConductorPublicationDecision {
  publicMessages: PublicTranscriptMessagePlan[];
  conductorWrapUp: string;
  summary: string;
  nextActions: string[];
}

function extractJsonObject(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("The agent did not return a JSON object.");
  }

  return candidate.slice(start, end + 1);
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseJsonContract<T>(text: string) {
  return JSON.parse(extractJsonObject(text)) as T;
}

export function normalizeSpecialistResponse(raw: unknown): SpecialistAgentResponse {
  const value = raw as Partial<SpecialistAgentResponse> | null | undefined;

  return {
    summary: typeof value?.summary === "string" ? value.summary : "No summary provided.",
    detailedResponse:
      typeof value?.detailedResponse === "string"
        ? value.detailedResponse
        : typeof value?.summary === "string"
          ? value.summary
          : "No detailed response provided.",
    shouldSpeakPublicly: Boolean(value?.shouldSpeakPublicly),
    publicMessage:
      typeof value?.publicMessage === "string" ? value.publicMessage : "",
    priority:
      value?.priority === "high" || value?.priority === "low" ? value.priority : "medium",
    confidence: Math.max(0, Math.min(1, toFiniteNumber(value?.confidence, 0.6))),
    followUps: toStringArray(value?.followUps),
    suggestedArtifacts: toStringArray(value?.suggestedArtifacts),
    addressedTo: "conductor",
    needsAnotherAgent: Boolean(value?.needsAnotherAgent),
    anotherAgentRole:
      value?.anotherAgentRole === "software_engineer" ||
      value?.anotherAgentRole === "solutions_architect"
        ? value.anotherAgentRole
        : null,
  };
}

export function normalizeRoutingDecision(raw: unknown): ConductorRoutingDecision {
  const value = raw as Partial<ConductorRoutingDecision> | null | undefined;

  const classification =
    value?.classification === "software_engineer" ||
    value?.classification === "solutions_architect" ||
    value?.classification === "sequence_both" ||
    value?.classification === "parallel_both"
      ? value.classification
      : "direct_answer";

  return {
    classification,
    responseMode:
      value?.responseMode === "ordered_specialists" ||
      value?.responseMode === "specialists_then_conductor"
        ? value.responseMode
        : "conductor_only",
    shouldConsultSoftwareEngineer: Boolean(value?.shouldConsultSoftwareEngineer),
    shouldConsultSolutionsArchitect: Boolean(value?.shouldConsultSolutionsArchitect),
    shouldAnswerDirectly: Boolean(value?.shouldAnswerDirectly),
    directResponse:
      typeof value?.directResponse === "string" ? value.directResponse : "",
    conductorAcknowledgement:
      typeof value?.conductorAcknowledgement === "string"
        ? value.conductorAcknowledgement
        : "I’m coordinating the room now.",
    softwareEngineerBrief:
      typeof value?.softwareEngineerBrief === "string"
        ? value.softwareEngineerBrief
        : "",
    solutionsArchitectBrief:
      typeof value?.solutionsArchitectBrief === "string"
        ? value.solutionsArchitectBrief
        : "",
    reasoning: typeof value?.reasoning === "string" ? value.reasoning : "",
  };
}

export function normalizePublicationDecision(raw: unknown): ConductorPublicationDecision {
  const value = raw as Partial<ConductorPublicationDecision> | null | undefined;
  const publicMessages = Array.isArray(value?.publicMessages)
    ? value.publicMessages.flatMap((message) => {
        if (
          !message ||
          typeof message !== "object" ||
          !("speaker" in message) ||
          !("message" in message)
        ) {
          return [];
        }

        const candidate = message as Partial<PublicTranscriptMessagePlan>;
        if (
          (candidate.speaker !== "conductor" &&
            candidate.speaker !== "software_engineer" &&
            candidate.speaker !== "solutions_architect") ||
          typeof candidate.message !== "string" ||
          candidate.message.trim().length === 0
        ) {
          return [];
        }

        return [
          {
            speaker: candidate.speaker,
            message: candidate.message.trim(),
          },
        ];
      })
    : [];

  return {
    publicMessages,
    conductorWrapUp:
      typeof value?.conductorWrapUp === "string" ? value.conductorWrapUp : "",
    summary: typeof value?.summary === "string" ? value.summary : "",
    nextActions: toStringArray(value?.nextActions),
  };
}
