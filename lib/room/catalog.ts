import { RoomParticipant, RoomParticipantRole } from "@/lib/room/types";

interface RoomParticipantSeed {
  id: string;
  role: RoomParticipantRole;
  name: string;
  title: string;
  type: "human" | "agent";
  initials: string;
  accent: string;
  description: string;
  a2aAgentId?: string;
  publicSpeaker: boolean;
}

export const ROOM_PARTICIPANT_SEEDS: RoomParticipantSeed[] = [
  {
    id: "participant-human",
    role: "human",
    name: "You",
    title: "Project Lead",
    type: "human",
    initials: "YO",
    accent: "var(--accent-cyan)",
    description: "The human owner of the room. Human input always enters through the room first.",
    publicSpeaker: true,
  },
  {
    id: "participant-conductor",
    role: "conductor",
    name: "Coordinator",
    title: "Voice Coordinator",
    type: "agent",
    initials: "CO",
    accent: "var(--accent-violet)",
    description: "Receives every human turn first, decides which specialists to involve, and controls the public floor.",
    a2aAgentId: "conductor-agent",
    publicSpeaker: true,
  },
  {
    id: "participant-software-engineer",
    role: "software_engineer",
    name: "Software Engineer",
    title: "Implementation Specialist",
    type: "agent",
    initials: "SE",
    accent: "var(--accent-blue)",
    description: "Focuses on APIs, services, delivery tradeoffs, and practical implementation details.",
    a2aAgentId: "software-engineer-agent",
    publicSpeaker: true,
  },
  {
    id: "participant-solutions-architect",
    role: "solutions_architect",
    name: "Solutions Architect",
    title: "Architecture Specialist",
    type: "agent",
    initials: "SA",
    accent: "var(--accent-amber)",
    description: "Focuses on system boundaries, scalability, tradeoffs, and architectural risk.",
    a2aAgentId: "solutions-architect-agent",
    publicSpeaker: true,
  },
];

export function createRoomParticipants() {
  return ROOM_PARTICIPANT_SEEDS.map<RoomParticipant>((participant) => ({
    ...participant,
    state: participant.role === "human" ? "idle" : "listening",
  }));
}

export function getParticipantSeedByRole(role: RoomParticipantRole) {
  return ROOM_PARTICIPANT_SEEDS.find((participant) => participant.role === role) ?? null;
}
