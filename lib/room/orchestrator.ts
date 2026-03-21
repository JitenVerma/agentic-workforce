import { sendTextToA2AAgent } from "@/lib/a2a/client";
import {
  ConductorPublicationDecision,
  ConductorRoutingDecision,
  PublicTranscriptMessagePlan,
  SpecialistAgentResponse,
  normalizePublicationDecision,
  normalizeRoutingDecision,
  normalizeSpecialistResponse,
  parseJsonContract,
} from "@/lib/room/contracts";
import { getParticipantSeedByRole } from "@/lib/room/catalog";
import { getRoomStore } from "@/lib/room/store";
import { AgentTask, RoomParticipant, RoomParticipantRole, RoomSession } from "@/lib/room/types";

const HUMAN_ROLE = "human";
const CONDUCTOR_ROLE = "conductor";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recentPublicTranscript(room: RoomSession, maxEntries = 8) {
  return room.transcript
    .filter((entry) => entry.visibility === "public")
    .slice(-maxEntries)
    .map(
      (entry) =>
        `${entry.participantName} (${entry.participantTitle}): ${entry.content}`,
    )
    .join("\n");
}

function roomContextBlock(room: RoomSession) {
  return [
    `Project: ${room.project.name}`,
    `Description: ${room.project.description}`,
    room.project.notes.length > 0 ? `Notes: ${room.project.notes.join(" ")}` : "",
    room.project.openQuestions.length > 0
      ? `Open questions: ${room.project.openQuestions.join(" ")}` : "",
    room.project.requirementsDraft.length > 0
      ? `Requirements draft: ${room.project.requirementsDraft.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRoutingPrompt(room: RoomSession, humanMessage: string) {
  return `
You are the Conductor agent for a moderated collaborative room.

Your responsibilities:
- receive every human message first
- decide whether to answer directly or consult specialists
- control public turn-taking
- keep the room coherent and efficient

You are planning only, not publishing the final room transcript yet.

Room context:
${roomContextBlock(room)}

Recent public transcript:
${recentPublicTranscript(room) || "No prior public transcript."}

Latest human message:
${humanMessage}

Return a strict JSON object with this shape and no markdown:
{
  "classification": "direct_answer" | "software_engineer" | "solutions_architect" | "sequence_both" | "parallel_both",
  "responseMode": "conductor_only" | "specialists_then_conductor" | "ordered_specialists",
  "shouldConsultSoftwareEngineer": boolean,
  "shouldConsultSolutionsArchitect": boolean,
  "shouldAnswerDirectly": boolean,
  "directResponse": string,
  "conductorAcknowledgement": string,
  "softwareEngineerBrief": string,
  "solutionsArchitectBrief": string,
  "reasoning": string
}
`.trim();
}

function buildSpecialistPrompt(
  room: RoomSession,
  humanMessage: string,
  routingDecision: ConductorRoutingDecision,
  specialistRole: Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">,
) {
  const brief =
    specialistRole === "software_engineer"
      ? routingDecision.softwareEngineerBrief
      : routingDecision.solutionsArchitectBrief;

  return `
You are responding to the Conductor inside a moderated collaborative room.

Specialist role: ${specialistRole}
Room context:
${roomContextBlock(room)}

Recent public transcript:
${recentPublicTranscript(room) || "No prior public transcript."}

Latest human message:
${humanMessage}

Conductor brief for you:
${brief || "Provide the most useful specialist perspective for the room."}

Return a strict JSON object with this shape and no markdown:
{
  "summary": string,
  "detailedResponse": string,
  "shouldSpeakPublicly": boolean,
  "publicMessage": string,
  "priority": "low" | "medium" | "high",
  "confidence": number,
  "followUps": string[],
  "suggestedArtifacts": string[],
  "addressedTo": "conductor",
  "needsAnotherAgent": boolean,
  "anotherAgentRole": "software_engineer" | "solutions_architect" | null
}
`.trim();
}

function buildPublicationPrompt(
  room: RoomSession,
  humanMessage: string,
  routingDecision: ConductorRoutingDecision,
  specialistResponses: Partial<
    Record<Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">, SpecialistAgentResponse>
  >,
) {
  return `
You are the Conductor agent deciding what becomes public in a moderated collaborative room.

Rules:
- only one public speaker at a time
- specialists only speak publicly if you approve it
- internal specialist reasoning should not be copied wholesale into the room transcript
- keep the room coherent and concise

Room context:
${roomContextBlock(room)}

Recent public transcript:
${recentPublicTranscript(room) || "No prior public transcript."}

Latest human message:
${humanMessage}

Your earlier routing decision:
${JSON.stringify(routingDecision, null, 2)}

Specialist responses:
${JSON.stringify(specialistResponses, null, 2)}

Return a strict JSON object with this shape and no markdown:
{
  "publicMessages": [
    {
      "speaker": "conductor" | "software_engineer" | "solutions_architect",
      "message": string
    }
  ],
  "conductorWrapUp": string,
  "summary": string,
  "nextActions": string[]
}
`.trim();
}

function fallbackRoutingDecision(humanMessage: string): ConductorRoutingDecision {
  const text = humanMessage.toLowerCase();

  if (text.includes("architect")) {
    return {
      classification: "solutions_architect",
      responseMode: "specialists_then_conductor",
      shouldConsultSoftwareEngineer: false,
      shouldConsultSolutionsArchitect: true,
      shouldAnswerDirectly: false,
      directResponse: "",
      conductorAcknowledgement: "I’m pulling in the Solutions Architect for the room.",
      softwareEngineerBrief: "",
      solutionsArchitectBrief: "Focus on architecture shape, system boundaries, and design tradeoffs.",
      reasoning: "The user explicitly asked for architecture guidance.",
    };
  }

  if (text.includes("engineer") || text.includes("implementation") || text.includes("v1")) {
    return {
      classification: "software_engineer",
      responseMode: "specialists_then_conductor",
      shouldConsultSoftwareEngineer: true,
      shouldConsultSolutionsArchitect: false,
      shouldAnswerDirectly: false,
      directResponse: "",
      conductorAcknowledgement: "I’m bringing in the Software Engineer to ground this in delivery reality.",
      softwareEngineerBrief: "Focus on APIs, services, feasibility, sequencing, and fastest viable delivery path.",
      solutionsArchitectBrief: "",
      reasoning: "The user is asking for implementation-focused guidance.",
    };
  }

  return {
    classification: "parallel_both",
    responseMode: "specialists_then_conductor",
    shouldConsultSoftwareEngineer: true,
    shouldConsultSolutionsArchitect: true,
    shouldAnswerDirectly: false,
    directResponse: "",
    conductorAcknowledgement: "I’m consulting both specialists so we can balance system design and delivery tradeoffs.",
    softwareEngineerBrief: "Focus on the fastest practical implementation path, service boundaries, and V1 tradeoffs.",
    solutionsArchitectBrief: "Focus on system architecture, scale boundaries, and design risks.",
    reasoning: "The request appears broad enough to benefit from both specialists.",
  };
}

function fallbackSpecialistResponse(
  specialistRole: Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">,
  rawResponse: string,
): SpecialistAgentResponse {
  return {
    summary: rawResponse.slice(0, 320) || `${specialistRole} returned an empty response.`,
    detailedResponse: rawResponse || `${specialistRole} returned an empty response.`,
    shouldSpeakPublicly: true,
    publicMessage: rawResponse || `${specialistRole} is ready to contribute.`,
    priority: "medium",
    confidence: 0.6,
    followUps: [],
    suggestedArtifacts: [],
    addressedTo: "conductor",
    needsAnotherAgent: false,
    anotherAgentRole: null,
  };
}

function fallbackPublicationDecision(
  routingDecision: ConductorRoutingDecision,
  specialistResponses: Partial<
    Record<Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">, SpecialistAgentResponse>
  >,
): ConductorPublicationDecision {
  const publicMessages: PublicTranscriptMessagePlan[] = [];

  if (routingDecision.shouldAnswerDirectly && routingDecision.directResponse) {
    publicMessages.push({
      speaker: "conductor",
      message: routingDecision.directResponse,
    });
  }

  for (const role of ["solutions_architect", "software_engineer"] as const) {
    const response = specialistResponses[role];
    if (!response) {
      continue;
    }

    if (response.shouldSpeakPublicly && response.publicMessage.trim().length > 0) {
      publicMessages.push({
        speaker: role,
        message: response.publicMessage.trim(),
      });
    }
  }

  if (publicMessages.length === 0) {
    publicMessages.push({
      speaker: "conductor",
      message:
        routingDecision.directResponse ||
        "I’ve gathered the internal specialist input and I’m ready to guide the next step.",
    });
  }

  return {
    publicMessages,
    conductorWrapUp: "",
    summary: "",
    nextActions: [],
  };
}

function findParticipantByRole(room: RoomSession, role: RoomParticipantRole) {
  const participant = room.participants.find((entry) => entry.role === role);
  if (!participant) {
    throw new Error(`Participant with role "${role}" was not found in room "${room.id}".`);
  }

  return participant;
}

function participantRoleToAgentId(role: Exclude<RoomParticipantRole, "human">) {
  const participant = getParticipantSeedByRole(role);

  if (!participant?.a2aAgentId) {
    throw new Error(`No A2A agent id is configured for role "${role}".`);
  }

  return participant.a2aAgentId;
}

async function setEveryoneToListening(roomId: string, exceptRole: RoomParticipantRole | null = null) {
  const store = getRoomStore();
  const room = store.getRoom(roomId);
  if (!room) {
    throw new Error(`Room "${roomId}" was not found.`);
  }

  for (const participant of room.participants) {
    const nextState =
      participant.role === exceptRole
        ? participant.state
        : participant.role === HUMAN_ROLE
          ? "idle"
          : "listening";
    store.setParticipantState(roomId, participant.id, nextState);
  }
}

async function publishPublicMessage(
  roomId: string,
  role: Exclude<RoomParticipantRole, "human">,
  message: string,
) {
  const store = getRoomStore();
  const room = store.getRoom(roomId);
  if (!room) {
    throw new Error(`Room "${roomId}" was not found.`);
  }

  const participant = findParticipantByRole(room, role);
  store.setCurrentPublicSpeaker(roomId, participant.id);
  store.setParticipantState(roomId, participant.id, "speaking");
  store.appendTranscript(roomId, {
    participantId: participant.id,
    role,
    content: message,
    visibility: "public",
  });
  await sleep(120);
  store.setParticipantState(roomId, participant.id, "listening");
  store.setCurrentPublicSpeaker(roomId, null);
}

async function createOrUpdateTask(
  task: Omit<AgentTask, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  },
) {
  getRoomStore().upsertTask(task.roomSessionId, task);
}

async function invokeConductorRouting(room: RoomSession, humanMessage: string) {
  const taskId = `task-conductor-route-${crypto.randomUUID()}`;
  const prompt = buildRoutingPrompt(room, humanMessage);

  await createOrUpdateTask({
    id: taskId,
    roomSessionId: room.id,
    agentRole: CONDUCTOR_ROLE,
    status: "running",
    visibility: "internal",
    prompt,
    summary: "Conductor is classifying the human turn and planning the room flow.",
  });

  try {
    const result = await sendTextToA2AAgent(participantRoleToAgentId(CONDUCTOR_ROLE), {
      text: prompt,
    });
    const decision = normalizeRoutingDecision(
      parseJsonContract<ConductorRoutingDecision>(result.text),
    );

    await createOrUpdateTask({
      id: taskId,
      roomSessionId: room.id,
      agentRole: CONDUCTOR_ROLE,
      status: "completed",
      visibility: "internal",
      prompt,
      summary: decision.reasoning || "Conductor routing decision completed.",
      rawResponse: result.text,
      structuredResponse: decision as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return decision;
  } catch (error) {
    const fallback = fallbackRoutingDecision(humanMessage);

    await createOrUpdateTask({
      id: taskId,
      roomSessionId: room.id,
      agentRole: CONDUCTOR_ROLE,
      status: "failed",
      visibility: "internal",
      prompt,
      summary: "Conductor routing failed; fallback routing heuristic was used.",
      error: error instanceof Error ? error.message : "Unknown conductor routing error.",
      structuredResponse: fallback as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return fallback;
  }
}

async function invokeSpecialist(
  room: RoomSession,
  humanMessage: string,
  routingDecision: ConductorRoutingDecision,
  specialistRole: Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">,
) {
  const store = getRoomStore();
  const participant = findParticipantByRole(room, specialistRole);
  const taskId = `task-${specialistRole}-${crypto.randomUUID()}`;
  const prompt = buildSpecialistPrompt(room, humanMessage, routingDecision, specialistRole);

  store.setParticipantState(room.id, participant.id, "thinking");
  await createOrUpdateTask({
    id: taskId,
    roomSessionId: room.id,
    agentRole: specialistRole,
    status: "running",
    visibility: "internal",
    prompt,
    summary: `${participant.name} is preparing a structured specialist response.`,
  });

  try {
    const result = await sendTextToA2AAgent(participantRoleToAgentId(specialistRole), {
      text: prompt,
    });
    const response = normalizeSpecialistResponse(
      parseJsonContract<SpecialistAgentResponse>(result.text),
    );

    await createOrUpdateTask({
      id: taskId,
      roomSessionId: room.id,
      agentRole: specialistRole,
      status: "completed",
      visibility: "internal",
      prompt,
      summary: response.summary,
      rawResponse: result.text,
      structuredResponse: response as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    store.setParticipantState(room.id, participant.id, "listening");
    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `${participant.name} failed to return a response.`;
    const fallback = fallbackSpecialistResponse(
      specialistRole,
      `${participant.name} could not be reached over A2A. ${message}`,
    );

    await createOrUpdateTask({
      id: taskId,
      roomSessionId: room.id,
      agentRole: specialistRole,
      status: "failed",
      visibility: "internal",
      prompt,
      summary: fallback.summary,
      rawResponse: fallback.detailedResponse,
      error: message,
      structuredResponse: fallback as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    store.setParticipantState(room.id, participant.id, "listening");
    return fallback;
  }
}

async function invokeConductorPublication(
  room: RoomSession,
  humanMessage: string,
  routingDecision: ConductorRoutingDecision,
  specialistResponses: Partial<
    Record<Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">, SpecialistAgentResponse>
  >,
) {
  const taskId = `task-conductor-publish-${crypto.randomUUID()}`;
  const prompt = buildPublicationPrompt(
    room,
    humanMessage,
    routingDecision,
    specialistResponses,
  );

  await createOrUpdateTask({
    id: taskId,
    roomSessionId: room.id,
    agentRole: CONDUCTOR_ROLE,
    status: "running",
    visibility: "internal",
    prompt,
    summary: "Conductor is deciding what becomes public in the room transcript.",
  });

  try {
    const result = await sendTextToA2AAgent(participantRoleToAgentId(CONDUCTOR_ROLE), {
      text: prompt,
    });
    const decision = normalizePublicationDecision(
      parseJsonContract<ConductorPublicationDecision>(result.text),
    );

    await createOrUpdateTask({
      id: taskId,
      roomSessionId: room.id,
      agentRole: CONDUCTOR_ROLE,
      status: "completed",
      visibility: "internal",
      prompt,
      summary: decision.summary || "Conductor publication plan completed.",
      rawResponse: result.text,
      structuredResponse: decision as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return decision;
  } catch (error) {
    const fallback = fallbackPublicationDecision(routingDecision, specialistResponses);

    await createOrUpdateTask({
      id: taskId,
      roomSessionId: room.id,
      agentRole: CONDUCTOR_ROLE,
      status: "failed",
      visibility: "internal",
      prompt,
      summary: "Conductor publication planning failed; fallback publication logic was used.",
      error: error instanceof Error ? error.message : "Unknown publication error.",
      structuredResponse: fallback as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return fallback;
  }
}

async function consultSpecialists(
  room: RoomSession,
  humanMessage: string,
  routingDecision: ConductorRoutingDecision,
) {
  const roles: Array<Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">> = [];

  if (routingDecision.shouldConsultSolutionsArchitect) {
    roles.push("solutions_architect");
  }

  if (routingDecision.shouldConsultSoftwareEngineer) {
    roles.push("software_engineer");
  }

  if (roles.length === 0) {
    return {};
  }

  if (routingDecision.classification === "parallel_both" && roles.length > 1) {
    const results = await Promise.all(
      roles.map(async (role) => [role, await invokeSpecialist(room, humanMessage, routingDecision, role)] as const),
    );

    return Object.fromEntries(results) as Partial<
      Record<Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">, SpecialistAgentResponse>
    >;
  }

  const results: Partial<
    Record<Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">, SpecialistAgentResponse>
  > = {};

  for (const role of roles) {
    results[role] = await invokeSpecialist(room, humanMessage, routingDecision, role);
  }

  return results;
}

export async function processHumanRoomMessage(roomId: string, humanMessage: string) {
  const store = getRoomStore();

  await store.enqueue(roomId, async () => {
    const room = store.getRoom(roomId);
    if (!room) {
      throw new Error(`Room "${roomId}" was not found.`);
    }

    if (room.status === "ended") {
      throw new Error(`Room "${roomId}" has already ended.`);
    }

    const humanParticipant = findParticipantByRole(room, HUMAN_ROLE);
    const conductorParticipant = findParticipantByRole(room, CONDUCTOR_ROLE);

    store.setStatus(room.id, "live");
    store.setCurrentPublicSpeaker(room.id, humanParticipant.id);
    store.setParticipantState(room.id, humanParticipant.id, "speaking");
    store.appendTranscript(room.id, {
      participantId: humanParticipant.id,
      role: HUMAN_ROLE,
      content: humanMessage,
      visibility: "public",
    });
    await sleep(100);
    store.setParticipantState(room.id, humanParticipant.id, "idle");
    store.setCurrentPublicSpeaker(room.id, null);
    store.setParticipantState(room.id, conductorParticipant.id, "thinking");

    const routingDecision = await invokeConductorRouting(room, humanMessage);
    store.setParticipantState(room.id, conductorParticipant.id, "listening");

    if (
      !routingDecision.shouldAnswerDirectly &&
      routingDecision.conductorAcknowledgement.trim().length > 0
    ) {
      await publishPublicMessage(
        room.id,
        CONDUCTOR_ROLE,
        routingDecision.conductorAcknowledgement.trim(),
      );
    }

    let specialistResponses: Partial<
      Record<Extract<RoomParticipantRole, "software_engineer" | "solutions_architect">, SpecialistAgentResponse>
    > = {};

    if (
      routingDecision.shouldConsultSoftwareEngineer ||
      routingDecision.shouldConsultSolutionsArchitect
    ) {
      store.setParticipantState(room.id, conductorParticipant.id, "thinking");
      specialistResponses = await consultSpecialists(room, humanMessage, routingDecision);
      store.setParticipantState(room.id, conductorParticipant.id, "listening");
    }

    let publicationDecision: ConductorPublicationDecision;
    if (
      routingDecision.shouldAnswerDirectly &&
      routingDecision.directResponse.trim().length > 0 &&
      !routingDecision.shouldConsultSoftwareEngineer &&
      !routingDecision.shouldConsultSolutionsArchitect
    ) {
      publicationDecision = {
        publicMessages: [
          {
            speaker: CONDUCTOR_ROLE,
            message: routingDecision.directResponse.trim(),
          },
        ],
        conductorWrapUp: "",
        summary: routingDecision.reasoning,
        nextActions: [],
      };
    } else {
      store.setParticipantState(room.id, conductorParticipant.id, "thinking");
      publicationDecision = await invokeConductorPublication(
        store.getRoom(room.id) ?? room,
        humanMessage,
        routingDecision,
        specialistResponses,
      );
      store.setParticipantState(room.id, conductorParticipant.id, "listening");
    }

    for (const messagePlan of publicationDecision.publicMessages) {
      if (messagePlan.message.trim().length === 0) {
        continue;
      }

      await publishPublicMessage(room.id, messagePlan.speaker, messagePlan.message.trim());
    }

    if (
      publicationDecision.conductorWrapUp.trim().length > 0 &&
      !publicationDecision.publicMessages.some(
        (message) =>
          message.speaker === CONDUCTOR_ROLE &&
          message.message.trim() === publicationDecision.conductorWrapUp.trim(),
      )
    ) {
      await publishPublicMessage(
        room.id,
        CONDUCTOR_ROLE,
        publicationDecision.conductorWrapUp.trim(),
      );
    }

    await setEveryoneToListening(room.id);
    store.emitSnapshot(room.id);
  });
}

export async function endRoomSession(roomId: string) {
  const store = getRoomStore();
  const room = store.getRoom(roomId);

  if (!room) {
    throw new Error(`Room "${roomId}" was not found.`);
  }

  store.setStatus(roomId, "ended");
  store.setCurrentPublicSpeaker(roomId, null);
  await setEveryoneToListening(roomId);
  store.emitSnapshot(roomId);
}
