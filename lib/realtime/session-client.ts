import {
  AudioChunkPayload,
  AudioEndPayload,
  AudioStartPayload,
  ClientRealtimeMessage,
  createClientEnvelope,
  ServerRealtimeEvent,
  SessionEndPayload,
  SessionStartPayload,
  UserMessagePayload,
} from "@/lib/realtime/contracts";

export type RealtimeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "closed";

interface RealtimeRoomClientOptions {
  sessionId: string;
  gatewayUrl?: string;
  onEvent: (event: ServerRealtimeEvent) => void;
  onStateChange?: (state: RealtimeConnectionState) => void;
}

const DEFAULT_GATEWAY_URL =
  process.env.NEXT_PUBLIC_REALTIME_GATEWAY_WS_URL ?? "ws://127.0.0.1:9001/ws";

export class RealtimeRoomClient {
  private readonly sessionId: string;
  private readonly gatewayUrl: string;
  private readonly onEvent: (event: ServerRealtimeEvent) => void;
  private readonly onStateChange?: (state: RealtimeConnectionState) => void;
  private socket: WebSocket | null = null;

  constructor(options: RealtimeRoomClientOptions) {
    this.sessionId = options.sessionId;
    this.gatewayUrl = options.gatewayUrl ?? DEFAULT_GATEWAY_URL;
    this.onEvent = options.onEvent;
    this.onStateChange = options.onStateChange;
  }

  async connect(sessionStartPayload: SessionStartPayload) {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    this.onStateChange?.("connecting");

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.gatewayUrl);
      this.socket = socket;

      socket.onopen = () => {
        this.onStateChange?.("connected");
        this.sendEnvelope(createClientEnvelope("session_start", this.sessionId, sessionStartPayload));
        resolve();
      };

      socket.onmessage = (event) => {
        this.onEvent(JSON.parse(event.data) as ServerRealtimeEvent);
      };

      socket.onerror = () => {
        this.onStateChange?.("error");
        reject(new Error("The realtime gateway connection failed."));
      };

      socket.onclose = () => {
        this.onStateChange?.("closed");
      };
    });
  }

  sendUserMessage(payload: UserMessagePayload) {
    this.sendEnvelope(createClientEnvelope("user_message", this.sessionId, payload));
  }

  sendAudioStart(payload: AudioStartPayload) {
    this.sendEnvelope(createClientEnvelope("audio_start", this.sessionId, payload));
  }

  sendAudioChunk(payload: AudioChunkPayload) {
    this.sendEnvelope(createClientEnvelope("audio_chunk", this.sessionId, payload));
  }

  sendAudioEnd(payload: AudioEndPayload) {
    this.sendEnvelope(createClientEnvelope("audio_end", this.sessionId, payload));
  }

  disconnect(payload: SessionEndPayload = { reason: "client_disconnect" }) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendEnvelope(createClientEnvelope("session_end", this.sessionId, payload));
      this.socket.close();
    }

    this.socket = null;
    this.onStateChange?.("closed");
  }

  private sendEnvelope(message: ClientRealtimeMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("The realtime websocket is not connected.");
    }

    this.socket.send(JSON.stringify(message));
  }
}
