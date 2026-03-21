"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Phone, Radio, Volume2 } from "lucide-react";
import { LiveAgentProfile } from "@/lib/types";

interface LiveVoiceAgentPanelProps {
  agents: LiveAgentProfile[];
  muted: boolean;
}

type VoiceStatus = "idle" | "connecting" | "connected" | "error";

const PCM_SAMPLE_RATE = 24_000;
const USER_SPEECH_THRESHOLD = 0.018;
const USER_SILENCE_GRACE_MS = 700;
const MIN_ACTIVE_FRAMES = 2;

function toBase64(bytes: Uint8Array) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function pcmFloatTo16Bit(input: Float32Array) {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return new Uint8Array(output.buffer);
}

function extractSampleRate(mimeType: string | undefined) {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : PCM_SAMPLE_RATE;
}

function buildLiveUrl(agent: LiveAgentProfile) {
  const rawUrl = agent.liveUrl ?? `${agent.baseUrl}/run_live`;
  const url = new URL(rawUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url;
}

function computeRms(input: Float32Array) {
  if (input.length === 0) {
    return 0;
  }

  let sumSquares = 0;

  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / input.length);
}

export function LiveVoiceAgentPanel({ agents, muted }: LiveVoiceAgentPanelProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [agentResponding, setAgentResponding] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const playbackCursorRef = useRef(0);
  const disconnectingRef = useRef(false);
  const socketErroredRef = useRef(false);
  const userTurnOpenRef = useRef(false);
  const lastVoiceDetectedAtRef = useRef(0);
  const activeFrameCountRef = useRef(0);
  const remoteSpeakingTimeoutRef = useRef<number | null>(null);

  const onlineAgents = useMemo(
    () =>
      agents.filter((agent) => {
        if (agent.status !== "online") {
          return false;
        }

        try {
          buildLiveUrl(agent);
          return true;
        } catch {
          return false;
        }
      }),
    [agents],
  );

  const selectedAgent = useMemo(
    () => onlineAgents.find((agent) => agent.id === selectedAgentId) ?? onlineAgents[0] ?? null,
    [onlineAgents, selectedAgentId],
  );

  useEffect(() => {
    if (!selectedAgent) {
      setSelectedAgentId("");
      return;
    }

    setSelectedAgentId((current) => (current && onlineAgents.some((agent) => agent.id === current) ? current : selectedAgent.id));
  }, [onlineAgents, selectedAgent]);

  const closeUserTurn = () => {
    const socket = websocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !userTurnOpenRef.current) {
      return;
    }

    socket.send(JSON.stringify({ activity_end: {} }));
    userTurnOpenRef.current = false;
    activeFrameCountRef.current = 0;
    setUserSpeaking(false);
  };

  const cleanupResources = async () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    monitorGainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    processorRef.current = null;
    sourceRef.current = null;
    monitorGainRef.current = null;
    streamRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (remoteSpeakingTimeoutRef.current !== null) {
      window.clearTimeout(remoteSpeakingTimeoutRef.current);
      remoteSpeakingTimeoutRef.current = null;
    }

    playbackCursorRef.current = 0;
    userTurnOpenRef.current = false;
    activeFrameCountRef.current = 0;
    setUserSpeaking(false);
    setAgentResponding(false);
    setSessionId(null);
  };

  const disconnect = async () => {
    if (disconnectingRef.current) {
      return;
    }

    disconnectingRef.current = true;

    const socket = websocketRef.current;

    if (socket && socket.readyState === WebSocket.OPEN && userTurnOpenRef.current) {
      socket.send(JSON.stringify({ activity_end: {} }));
      userTurnOpenRef.current = false;
    }

    websocketRef.current = null;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ close: true }));
    }

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      if (socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }
    }

    await cleanupResources();
    setStatus(socketErroredRef.current ? "error" : "idle");
    disconnectingRef.current = false;
  };

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, []);

  useEffect(() => {
    if (!muted) {
      return;
    }

    closeUserTurn();
  }, [muted]);

  const playPcmAudio = (data: string, mimeType?: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      return;
    }

    const bytes = fromBase64(data);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const samples = new Float32Array(sampleCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 0x8000;
    }

    const sampleRate = extractSampleRate(mimeType);
    const audioBuffer = audioContext.createBuffer(1, sampleCount, sampleRate);
    audioBuffer.copyToChannel(samples, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(audioContext.currentTime, playbackCursorRef.current);
    source.start(startAt);
    playbackCursorRef.current = startAt + audioBuffer.duration;
    setAgentResponding(true);

    if (remoteSpeakingTimeoutRef.current !== null) {
      window.clearTimeout(remoteSpeakingTimeoutRef.current);
    }

    remoteSpeakingTimeoutRef.current = window.setTimeout(() => {
      setAgentResponding(false);
      remoteSpeakingTimeoutRef.current = null;
    }, Math.max(250, audioBuffer.duration * 1000 + 150));
  };

  const connect = async () => {
    if (!selectedAgent) {
      setNotice("Choose an online live-capable agent first.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setNotice("This browser cannot open a microphone stream.");
      return;
    }

    await disconnect();
    setStatus("connecting");
    setNotice(null);
    socketErroredRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      await audioContext.resume();

      const socketUrl = buildLiveUrl(selectedAgent);
      const nextSessionId = crypto.randomUUID();
      socketUrl.searchParams.set("user_id", "nextjs-call-user");
      socketUrl.searchParams.set("session_id", nextSessionId);
      socketUrl.searchParams.append("modalities", "AUDIO");

      const socket = new WebSocket(socketUrl);

      websocketRef.current = socket;
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      playbackCursorRef.current = audioContext.currentTime;
      lastVoiceDetectedAtRef.current = performance.now();
      setSessionId(nextSessionId);

      socket.onopen = () => {
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        const monitorGain = audioContext.createGain();

        monitorGain.gain.value = 0;
        sourceRef.current = source;
        processorRef.current = processor;
        monitorGainRef.current = monitorGain;

        processor.onaudioprocess = (event) => {
          if (muted || socket.readyState !== WebSocket.OPEN) {
            closeUserTurn();
            return;
          }

          const input = event.inputBuffer.getChannelData(0);
          const rms = computeRms(input);
          const now = performance.now();
          const pcmChunk = pcmFloatTo16Bit(input);

          if (rms >= USER_SPEECH_THRESHOLD) {
            activeFrameCountRef.current += 1;
            lastVoiceDetectedAtRef.current = now;

            if (!userTurnOpenRef.current && activeFrameCountRef.current >= MIN_ACTIVE_FRAMES) {
              socket.send(JSON.stringify({ activity_start: {} }));
              userTurnOpenRef.current = true;
              setUserSpeaking(true);
            }
          }

          if (userTurnOpenRef.current) {
            socket.send(
              JSON.stringify({
                blob: {
                  mimeType: `audio/pcm;rate=${PCM_SAMPLE_RATE}`,
                  data: toBase64(pcmChunk),
                },
              }),
            );
          }

          if (
            userTurnOpenRef.current &&
            now - lastVoiceDetectedAtRef.current >= USER_SILENCE_GRACE_MS
          ) {
            closeUserTurn();
          }
        };

        source.connect(processor);
        processor.connect(monitorGain);
        monitorGain.connect(audioContext.destination);
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          content?: {
            parts?: Array<{
              inlineData?: {
                data?: string;
                mimeType?: string;
              };
            }>;
          };
          interrupted?: boolean;
        };

        if (payload.interrupted) {
          playbackCursorRef.current = audioContext.currentTime;
          setAgentResponding(false);
        }

        for (const part of payload.content?.parts ?? []) {
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) {
            playPcmAudio(part.inlineData.data, part.inlineData.mimeType);
          }
        }
      };

      socket.onerror = () => {
        socketErroredRef.current = true;
        setStatus("error");
        setNotice("The live voice connection failed.");
      };

      socket.onclose = () => {
        void disconnect();
      };
    } catch (error) {
      socketErroredRef.current = true;
      await disconnect();
      setNotice(
        error instanceof Error ? error.message : "Unable to start the live voice session.",
      );
    }
  };

  return (
    <section className="panel live-voice-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Direct Voice</p>
          <h3>Speech-to-speech agent link</h3>
        </div>
        <span className={`a2a-status-pill a2a-status-pill--${status === "connected" ? "online" : "offline"}`}>
          {status}
        </span>
      </div>

      <div className="live-voice-panel__controls">
        <label className="live-voice-panel__picker">
          <span>Active live agent</span>
          <select
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            disabled={onlineAgents.length === 0 || status === "connecting" || status === "connected"}
          >
            {onlineAgents.length > 0 ? (
              onlineAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))
            ) : (
              <option value="">No live-capable agents</option>
            )}
          </select>
        </label>

        <div className="live-voice-panel__actions">
          <button
            className="primary-button"
            onClick={() => void connect()}
            disabled={!selectedAgent || status === "connected" || status === "connecting"}
          >
            <Phone size={16} />
            {status === "connecting" ? "Connecting" : "Connect voice"}
          </button>
          <button className="ghost-button" onClick={() => void disconnect()} disabled={status !== "connected"}>
            <MicOff size={16} />
            Disconnect
          </button>
        </div>
      </div>

      <div className="live-voice-panel__status">
        <span className="top-stat">
          <Radio size={14} />
          {selectedAgent ? `${selectedAgent.name} ready for live audio` : "No live endpoint available"}
        </span>
        <span className={`top-stat ${userSpeaking ? "top-stat--active" : ""}`}>
          {muted ? <MicOff size={14} /> : <Mic size={14} />}
          {muted ? "Mic muted" : userSpeaking ? "You are speaking" : "Waiting for your voice"}
        </span>
        <span className={`top-stat ${agentResponding ? "top-stat--active" : ""}`}>
          <Volume2 size={14} />
          {agentResponding ? "Agent is responding" : "Agent response idle"}
        </span>
        {sessionId ? <span className="top-stat">Session {sessionId.slice(0, 8)}</span> : null}
      </div>

      <p className="call-note">
        Microphone audio is streamed directly to ADK live mode, and the returned audio is played back directly. No browser speech-to-text or text-to-speech is used here.
      </p>
      {notice ? <p className="a2a-agent-item__error">{notice}</p> : null}
    </section>
  );
}
