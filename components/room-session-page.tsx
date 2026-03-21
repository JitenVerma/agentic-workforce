"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleDot,
  Mic,
  MicOff,
  Radio,
  Send,
  Users,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ParticipantCard } from "@/components/participant-card";
import { TranscriptFeed } from "@/components/transcript-feed";
import { MicrophoneStream } from "@/lib/realtime/microphone-stream";
import { PcmPlayer } from "@/lib/realtime/pcm-player";
import {
  RealtimeParticipantState,
  ServerRealtimeEvent,
  SessionStartPayload,
  SpecialistRole,
} from "@/lib/realtime/contracts";
import { RealtimeRoomClient, RealtimeConnectionState } from "@/lib/realtime/session-client";
import {
  RealtimeActivityEntry,
  RealtimeTranscriptEntry,
} from "@/lib/realtime/view-models";
import { RoomParticipant, RoomSession } from "@/lib/room/types";
import { ActivityEntry } from "@/lib/types";

interface RoomSessionPageProps {
  roomId: string;
}

function buildProjectSummary(room: RoomSession) {
  return [
    room.project.description,
    ...room.project.notes,
    ...room.project.requirementsDraft,
    ...room.project.openQuestions,
  ]
    .filter(Boolean)
    .join("\n");
}

function displayNameForParticipant(participant: RoomParticipant) {
  return participant.role === "conductor" ? "Coordinator" : participant.name;
}

function displayTitleForParticipant(participant: RoomParticipant) {
  return participant.role === "conductor" ? "Voice Coordinator" : participant.title;
}

function transcriptKindForRole(role: string) {
  if (role === "human") {
    return "human" as const;
  }

  if (role === "conductor") {
    return "system" as const;
  }

  return "agent" as const;
}

function roleLabel(role: string) {
  if (role === "conductor") {
    return "Coordinator";
  }

  return role.replace(/_/g, " ");
}

function upsertTranscript(
  current: RealtimeTranscriptEntry[],
  nextEntry: RealtimeTranscriptEntry,
) {
  const existingIndex = current.findIndex((entry) => entry.id === nextEntry.id);
  if (existingIndex === -1) {
    return [...current, nextEntry];
  }

  return current.map((entry, index) => (index === existingIndex ? nextEntry : entry));
}

function pushActivity(
  current: RealtimeActivityEntry[],
  nextEntry: RealtimeActivityEntry,
) {
  return [nextEntry, ...current].slice(0, 18);
}

function buildActivityEntry(
  id: string,
  label: string,
  detail: string,
  tone: ActivityEntry["tone"],
  createdAt: string,
  source: RealtimeActivityEntry["source"],
): RealtimeActivityEntry {
  return {
    id,
    label,
    detail,
    tone,
    createdAt,
    source,
  };
}

function participantAccent(participant: RoomParticipant) {
  return participant.accent;
}

export function RoomSessionPage({ roomId }: RoomSessionPageProps) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [participantStates, setParticipantStates] = useState<Record<string, RealtimeParticipantState>>({});
  const [transcript, setTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const [activity, setActivity] = useState<RealtimeActivityEntry[]>([]);
  const [composerText, setComposerText] = useState("");
  const [transportState, setTransportState] = useState<RealtimeConnectionState>("idle");
  const [voiceState, setVoiceState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEndingRoom, setIsEndingRoom] = useState(false);
  const [muted, setMuted] = useState(false);

  const roomRef = useRef<RoomSession | null>(null);
  const clientRef = useRef<RealtimeRoomClient | null>(null);
  const microphoneRef = useRef<MicrophoneStream | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    let active = true;

    async function loadRoom() {
      try {
        const response = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
        const payload = (await response.json()) as { room?: RoomSession; error?: string };

        if (!response.ok || !payload.room) {
          throw new Error(payload.error ?? "Room not found.");
        }

        if (!active) {
          return;
        }

        setRoom(payload.room);
        setParticipantStates(
          Object.fromEntries(
            payload.room.participants.map((participant) => [
              participant.id,
              participant.state,
            ]),
          ),
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setSubmitError(error instanceof Error ? error.message : "Unable to load the room.");
        setTransportState("error");
      }
    }

    void loadRoom();

    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const selectedAgents = room.participants
      .filter(
        (participant) =>
          participant.role === "software_engineer" ||
          participant.role === "solutions_architect",
      )
      .map((participant) => participant.role as SpecialistRole);

    const handleRealtimeEvent = (event: ServerRealtimeEvent) => {
      if (event.type === "connection_ack") {
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `connection-${event.timestamp}`,
              "Realtime gateway connected",
              `${event.payload.gateway} acknowledged the room websocket.`,
              "info",
              event.timestamp,
              "connection",
            ),
          ),
        );
        return;
      }

      if (event.type === "session_started") {
        setParticipantStates((current) => ({
          ...current,
          ...Object.fromEntries(
            event.payload.participants.map((participant) => [participant.id, participant.state]),
          ),
        }));
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `session-${event.timestamp}`,
              "Voice room started",
              `Coordinator room is live for ${event.payload.projectName}.`,
              "info",
              event.timestamp,
              "system",
            ),
          ),
        );
        return;
      }

      if (event.type === "participant_state") {
        setParticipantStates((current) => ({
          ...current,
          [event.payload.participantId]: event.payload.state,
        }));
        return;
      }

      if (event.type === "coordinator_listening") {
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `listen-${event.payload.messageId}`,
              "Coordinator listening",
              "The coordinator is actively receiving your current voice turn.",
              "queue",
              event.timestamp,
              "system",
            ),
          ),
        );
        return;
      }

      if (event.type === "coordinator_thinking") {
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `think-${event.payload.messageId}`,
              "Coordinator thinking",
              "The coordinator is synthesizing the next response.",
              "queue",
              event.timestamp,
              "system",
            ),
          ),
        );
        return;
      }

      if (event.type === "specialist_invoked") {
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `invoke-${event.timestamp}-${event.payload.specialistRole}`,
              `${event.payload.specialistName} consulted`,
              event.payload.requestSummary,
              "queue",
              event.timestamp,
              "specialist",
            ),
          ),
        );
        return;
      }

      if (event.type === "specialist_response") {
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `response-${event.timestamp}-${event.payload.specialistRole}`,
              `${event.payload.specialistName} responded`,
              event.payload.summary || event.payload.publicMessage || "Specialist response received.",
              "info",
              event.timestamp,
              "specialist",
            ),
          ),
        );
        return;
      }

      if (event.type === "transcript_delta" || event.type === "transcript_complete") {
        setTranscript((current) =>
          upsertTranscript(current, {
            id: event.payload.messageId,
            participantId: event.payload.participantId,
            name: event.payload.participantName,
            role: roleLabel(event.payload.participantRole),
            kind: transcriptKindForRole(event.payload.participantRole),
            message: event.payload.text,
            timestamp: new Date(event.timestamp).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            }),
            createdAt: event.timestamp,
            final: event.payload.isFinal,
          }),
        );
        return;
      }

      if (event.type === "audio_response_chunk") {
        if (!playerRef.current) {
          playerRef.current = new PcmPlayer();
          void playerRef.current.ensureReady().then(() => {
            playerRef.current?.playBase64Pcm(event.payload.audio, event.payload.mimeType);
          });
        } else {
          playerRef.current.playBase64Pcm(event.payload.audio, event.payload.mimeType);
        }
        return;
      }

      if (event.type === "turn_complete") {
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `turn-${event.payload.turnId}`,
              "Turn complete",
              "The coordinator completed the current response turn.",
              "info",
              event.timestamp,
              "system",
            ),
          ),
        );
        return;
      }

      if (event.type === "error") {
        setSubmitError(event.payload.message);
        setActivity((current) =>
          pushActivity(
            current,
            buildActivityEntry(
              `error-${event.timestamp}`,
              "Realtime error",
              event.payload.message,
              "priority",
              event.timestamp,
              "error",
            ),
          ),
        );
      }
    };

    const client = new RealtimeRoomClient({
      sessionId: room.id,
      onEvent: handleRealtimeEvent,
      onStateChange: (state) => {
        setTransportState(state);
        if (state === "error") {
          setSubmitError("The realtime gateway disconnected.");
        }
      },
    });

    clientRef.current = client;

    const sessionStartPayload: SessionStartPayload = {
      roomId: room.id,
      projectId: room.project.id,
      projectName: room.project.name,
      projectSummary: buildProjectSummary(room),
      selectedAgents,
      conversationMode: "voice",
    };

    void client.connect(sessionStartPayload).catch((error) => {
      setSubmitError(error instanceof Error ? error.message : "Unable to connect the realtime gateway.");
      setTransportState("error");
    });

    return () => {
      client.disconnect({ reason: "room_unmount" });
      clientRef.current = null;
    };
  }, [room]);

  useEffect(() => {
    return () => {
      void microphoneRef.current?.stop();
      void playerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    microphoneRef.current?.setMuted(muted);
  }, [muted]);

  const renderedParticipants = useMemo(() => {
    if (!room) {
      return [];
    }

    return room.participants.map((participant) => ({
      ...participant,
      name: displayNameForParticipant(participant),
      title: displayTitleForParticipant(participant),
      state: participantStates[participant.id] ?? participant.state,
    }));
  }, [participantStates, room]);

  const transcriptItems = useMemo(
    () =>
      transcript
        .slice()
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .slice()
        .reverse(),
    [transcript],
  );

  const activityItems = useMemo<ActivityEntry[]>(
    () => activity.map(({ id, label, detail, tone }) => ({ id, label, detail, tone })),
    [activity],
  );

  const currentSpeakerLabel = useMemo(() => {
    const speakingParticipant = renderedParticipants.find(
      (participant) => participant.state === "speaking",
    );
    return speakingParticipant ? `${speakingParticipant.name} speaking` : "No active speaker";
  }, [renderedParticipants]);

  const connectVoice = async () => {
    if (voiceState === "connected" || voiceState === "connecting") {
      return;
    }

    if (!clientRef.current) {
      setSubmitError("The realtime gateway is not connected yet.");
      return;
    }

    setVoiceState("connecting");
    setSubmitError(null);

    try {
      playerRef.current ??= new PcmPlayer();
      await playerRef.current.ensureReady();

      const microphone = new MicrophoneStream({
        onSpeechStart: (messageId, mimeType) => {
          playerRef.current?.interrupt();
          clientRef.current?.sendAudioStart({ messageId, mimeType });
        },
        onAudioChunk: (messageId, chunkId, audio, mimeType) => {
          clientRef.current?.sendAudioChunk({ messageId, chunkId, audio, mimeType });
        },
        onSpeechEnd: (messageId) => {
          clientRef.current?.sendAudioEnd({ messageId });
        },
      });

      microphoneRef.current = microphone;
      await microphone.start();
      microphone.setMuted(muted);
      setVoiceState("connected");
    } catch (error) {
      setVoiceState("error");
      setSubmitError(
        error instanceof Error ? error.message : "Unable to connect the microphone.",
      );
    }
  };

  const disconnectVoice = async () => {
    await microphoneRef.current?.stop();
    microphoneRef.current = null;
    setVoiceState("idle");
  };

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    const text = composerText.trim();

    if (!text || !clientRef.current) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      clientRef.current.sendUserMessage({
        messageId: crypto.randomUUID(),
        text,
      });
      setComposerText("");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to send the room message.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const endRoom = async () => {
    if (!room) {
      router.push("/");
      return;
    }

    setIsEndingRoom(true);

    try {
      await disconnectVoice();
      clientRef.current?.disconnect({ reason: "room_ended" });

      const response = await fetch(`/api/rooms/${room.id}/end`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to end the room.");
      }

      router.push("/");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to end the room.");
    } finally {
      setIsEndingRoom(false);
    }
  };

  if (!room) {
    return (
      <main className="app-shell">
        <section className="panel">
          <div className="empty-state">
            <Radio size={18} />
            <p>Loading the collaborative room.</p>
          </div>
        </section>
      </main>
    );
  }

  const humanParticipant = renderedParticipants.find((participant) => participant.role === "human");
  const coordinatorParticipant = renderedParticipants.find(
    (participant) => participant.role === "conductor",
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark">
          <div className="brand-mark__logo">AW</div>
          <div>
            <p className="eyebrow">Realtime Voice Room</p>
            <h2>{room.project.name}</h2>
          </div>
        </div>
        <div className="header-meta">
          <span>{transportState}</span>
          <span>{voiceState === "connected" ? "Voice connected" : "Voice idle"}</span>
          <span>{currentSpeakerLabel}</span>
        </div>
      </header>

      <section className="call-topbar">
        <div>
          <p className="eyebrow">Coordinator-Led Session</p>
          <h1>{room.project.name}</h1>
          <p className="hero-copy room-hero-copy">
            You speak to one voice-facing Coordinator over a single websocket connection. The Coordinator delegates to specialists internally through A2A and returns one coherent room response.
          </p>
        </div>
        <div className="call-topbar__stats">
          <span className="top-stat">
            <CircleDot size={14} />
            {room.status === "ended" ? "Ended" : "Live"}
          </span>
          <span className={`top-stat ${transportState === "connected" ? "top-stat--active" : ""}`}>
            <Radio size={14} />
            {transportState}
          </span>
          <span className={`top-stat ${voiceState === "connected" ? "top-stat--active" : ""}`}>
            <Volume2 size={14} />
            {voiceState}
          </span>
          <button
            className="control-chip control-chip--danger"
            onClick={() => void endRoom()}
            disabled={isEndingRoom}
          >
            {isEndingRoom ? "Ending" : "End room"}
          </button>
          <Link href="/" className="ghost-button">
            <ArrowLeft size={16} />
            Workspace
          </Link>
        </div>
      </section>

      <section className="priority-banner">
        <strong>Realtime architecture</strong>
        <span>
          Browser microphone and text input flow through one FastAPI websocket gateway. The Coordinator is the only voice-facing agent, and specialist A2A work stays behind the scenes.
        </span>
      </section>

      <section className="call-layout">
        <div className="participants-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Participants</p>
                <h3>Room presence and state</h3>
              </div>
              <span className="top-stat">
                <Users size={14} />
                {renderedParticipants.length} in room
              </span>
            </div>
            <div className="participants-grid">
              {renderedParticipants.map((participant) => (
                <ParticipantCard
                  key={participant.id}
                  name={participant.name}
                  role={participant.title}
                  initials={participant.initials}
                  accent={participantAccent(participant)}
                  state={participant.state}
                  human={participant.role === "human"}
                  muted={participant.role === "human" ? muted : false}
                />
              ))}
            </div>
          </section>

          <section className="panel voice-session-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Voice Session</p>
                <h3>Single websocket audio path</h3>
              </div>
            </div>

            <div className="voice-session-panel__controls">
              <button
                className="primary-button"
                onClick={() => void connectVoice()}
                disabled={transportState !== "connected" || voiceState === "connected" || voiceState === "connecting"}
              >
                <Mic size={16} />
                {voiceState === "connecting" ? "Connecting" : "Connect voice"}
              </button>
              <button
                className="ghost-button"
                onClick={() => void disconnectVoice()}
                disabled={voiceState !== "connected"}
              >
                <MicOff size={16} />
                Disconnect
              </button>
              <button
                className="ghost-button"
                onClick={() => setMuted((current) => !current)}
                disabled={voiceState !== "connected"}
              >
                {muted ? <Mic size={16} /> : <MicOff size={16} />}
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>

            <div className="voice-session-panel__stats">
              <span className={`top-stat ${participantStates["participant-human"] === "speaking" ? "top-stat--active" : ""}`}>
                {muted ? <MicOff size={14} /> : <Mic size={14} />}
                {humanParticipant?.state === "speaking"
                  ? "You are speaking"
                  : muted
                    ? "Mic muted"
                    : "Waiting for your voice"}
              </span>
              <span className={`top-stat ${participantStates["participant-conductor"] === "speaking" ? "top-stat--active" : ""}`}>
                <Volume2 size={14} />
                {coordinatorParticipant?.state === "speaking"
                  ? "Coordinator responding"
                  : "Coordinator idle"}
              </span>
            </div>

            <p className="call-note voice-session-panel__note">
              Audio is captured in the browser as PCM16 and streamed to the Python gateway, which forwards it into ADK live mode for the Coordinator. Specialist agents stay internal and do not speak directly to the browser.
            </p>
          </section>

          <section className="panel room-composer">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Text Fallback</p>
                <h3>Send a typed room turn</h3>
              </div>
            </div>
            <form className="form-stack" onSubmit={submitMessage}>
              <label>
                <span>Your typed turn still enters through the Coordinator first.</span>
                <textarea
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  placeholder="Ask about architecture, implementation tradeoffs, or the next delivery step."
                  disabled={isSubmitting || transportState !== "connected"}
                />
              </label>
              <div className="room-composer__actions">
                <p className="muted">
                  Specialist delegation events appear in the activity stream while the public transcript remains coherent.
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSubmitting || transportState !== "connected"}
                >
                  <Send size={16} />
                  {isSubmitting ? "Sending" : "Send to room"}
                </button>
              </div>
            </form>
            {submitError ? (
              <div className="empty-state">
                <Radio size={18} />
                <p>{submitError}</p>
              </div>
            ) : null}
          </section>
        </div>

        <div className="panels-column">
          <TranscriptFeed transcript={transcriptItems} activity={activityItems} />
        </div>
      </section>
    </main>
  );
}
