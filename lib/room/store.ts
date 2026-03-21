import { EventEmitter } from "events";
import { Project } from "@/lib/types";
import { createRoomParticipants } from "@/lib/room/catalog";
import {
  AgentTask,
  RoomEvent,
  RoomParticipant,
  RoomParticipantState,
  RoomSession,
  RoomStatus,
  RoomTranscriptMessage,
  RoomVisibility,
} from "@/lib/room/types";

type RoomListener = (event: RoomEvent) => void;
type RoomMutation = (room: RoomSession) => RoomSession;

function getTimestampLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function cloneRoom<T>(value: T): T {
  return structuredClone(value);
}

class RoomStore {
  private readonly rooms = new Map<string, RoomSession>();
  private readonly emitter = new EventEmitter();
  private readonly operationQueues = new Map<string, Promise<void>>();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  createRoom(project: Project) {
    const now = new Date();
    const room: RoomSession = {
      id: `room-${crypto.randomUUID()}`,
      projectId: project.id,
      status: "ready",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      project,
      participants: createRoomParticipants(),
      transcript: [],
      agentTasks: [],
      currentPublicSpeakerId: null,
    };

    this.rooms.set(room.id, room);
    this.emit({
      id: crypto.randomUUID(),
      type: "room.snapshot",
      roomSessionId: room.id,
      createdAt: now.toISOString(),
      payload: {
        room: cloneRoom(room),
      },
    });

    return cloneRoom(room);
  }

  listRooms() {
    return Array.from(this.rooms.values()).map((room) => cloneRoom(room));
  }

  getRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? cloneRoom(room) : null;
  }

  subscribe(roomId: string, listener: RoomListener) {
    const channel = this.getChannel(roomId);
    this.emitter.on(channel, listener);

    return () => {
      this.emitter.off(channel, listener);
    };
  }

  async enqueue(roomId: string, operation: () => Promise<void>) {
    const current = this.operationQueues.get(roomId) ?? Promise.resolve();
    const next = current.catch(() => undefined).then(operation);

    this.operationQueues.set(
      roomId,
      next.finally(() => {
        if (this.operationQueues.get(roomId) === next) {
          this.operationQueues.delete(roomId);
        }
      }),
    );

    await next;
  }

  updateRoom(roomId: string, mutation: RoomMutation) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room "${roomId}" was not found.`);
    }

    const updated = mutation(cloneRoom(room));
    updated.updatedAt = new Date().toISOString();
    this.rooms.set(roomId, updated);

    return cloneRoom(updated);
  }

  setStatus(roomId: string, status: RoomStatus) {
    const room = this.updateRoom(roomId, (current) => ({
      ...current,
      status,
    }));

    this.emit({
      id: crypto.randomUUID(),
      type: "room.status.updated",
      roomSessionId: roomId,
      createdAt: room.updatedAt,
      payload: {
        status,
        currentPublicSpeakerId: room.currentPublicSpeakerId,
      },
    });

    return room;
  }

  setCurrentPublicSpeaker(roomId: string, participantId: string | null) {
    const room = this.updateRoom(roomId, (current) => ({
      ...current,
      currentPublicSpeakerId: participantId,
    }));

    this.emit({
      id: crypto.randomUUID(),
      type: "room.status.updated",
      roomSessionId: roomId,
      createdAt: room.updatedAt,
      payload: {
        status: room.status,
        currentPublicSpeakerId: participantId,
      },
    });

    return room;
  }

  setParticipantState(roomId: string, participantId: string, state: RoomParticipantState) {
    let updatedParticipant: RoomParticipant | null = null;
    const room = this.updateRoom(roomId, (current) => ({
      ...current,
      participants: current.participants.map((participant) => {
        if (participant.id !== participantId) {
          return participant;
        }

        updatedParticipant = {
          ...participant,
          state,
        };

        return updatedParticipant;
      }),
    }));

    if (!updatedParticipant) {
      throw new Error(`Participant "${participantId}" was not found in room "${roomId}".`);
    }

    const participant = updatedParticipant as RoomParticipant;

    this.emit({
      id: crypto.randomUUID(),
      type: "participant.updated",
      roomSessionId: roomId,
      createdAt: room.updatedAt,
      payload: {
        participant: cloneRoom(participant),
      },
    });

    return room;
  }

  appendTranscript(
    roomId: string,
    input: {
      participantId: string;
      role: RoomTranscriptMessage["role"];
      content: string;
      visibility?: RoomVisibility;
    },
  ) {
    let nextMessage: RoomTranscriptMessage | null = null;
    const room = this.updateRoom(roomId, (current) => {
      const participant = current.participants.find((entry) => entry.id === input.participantId);

      if (!participant) {
        throw new Error(`Participant "${input.participantId}" is not part of room "${roomId}".`);
      }

      const createdAt = new Date();
      nextMessage = {
        id: `utterance-${crypto.randomUUID()}`,
        roomSessionId: roomId,
        participantId: participant.id,
        role: input.role,
        participantName: participant.name,
        participantTitle: participant.title,
        visibility: input.visibility ?? "public",
        content: input.content,
        createdAt: createdAt.toISOString(),
        timestampLabel: getTimestampLabel(createdAt),
      };

      return {
        ...current,
        transcript: [...current.transcript, nextMessage],
      };
    });

    if (!nextMessage) {
      throw new Error("Unable to append transcript message.");
    }

    const message = nextMessage as RoomTranscriptMessage;

    this.emit({
      id: crypto.randomUUID(),
      type: "transcript.appended",
      roomSessionId: roomId,
      createdAt: message.createdAt,
      payload: {
        message: cloneRoom(message),
      },
    });

    return room;
  }

  upsertTask(
    roomId: string,
    taskInput: Omit<AgentTask, "createdAt" | "updatedAt"> & {
      createdAt?: string;
      updatedAt?: string;
    },
  ) {
    let nextTask: AgentTask | null = null;
    const now = new Date().toISOString();
    const room = this.updateRoom(roomId, (current) => {
      const existingIndex = current.agentTasks.findIndex((task) => task.id === taskInput.id);
      const task: AgentTask = {
        ...taskInput,
        createdAt: taskInput.createdAt ?? now,
        updatedAt: taskInput.updatedAt ?? now,
      };

      nextTask = task;

      if (existingIndex === -1) {
        return {
          ...current,
          agentTasks: [...current.agentTasks, task],
        };
      }

      return {
        ...current,
        agentTasks: current.agentTasks.map((entry, index) => (index === existingIndex ? task : entry)),
      };
    });

    if (!nextTask) {
      throw new Error("Unable to upsert room task.");
    }

    const task = nextTask as AgentTask;

    this.emit({
      id: crypto.randomUUID(),
      type: "task.updated",
      roomSessionId: roomId,
      createdAt: task.updatedAt,
      payload: {
        task: cloneRoom(task),
      },
    });

    return room;
  }

  emitSnapshot(roomId: string) {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room "${roomId}" was not found.`);
    }

    this.emit({
      id: crypto.randomUUID(),
      type: "room.snapshot",
      roomSessionId: roomId,
      createdAt: room.updatedAt,
      payload: {
        room,
      },
    });
  }

  private emit(event: RoomEvent) {
    this.emitter.emit(this.getChannel(event.roomSessionId), event);
  }

  private getChannel(roomId: string) {
    return `room:${roomId}`;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __agenticWorkforceRoomStore__: RoomStore | undefined;
}

export function getRoomStore() {
  if (!globalThis.__agenticWorkforceRoomStore__) {
    globalThis.__agenticWorkforceRoomStore__ = new RoomStore();
  }

  return globalThis.__agenticWorkforceRoomStore__;
}
