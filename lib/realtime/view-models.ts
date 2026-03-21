import { ActivityEntry, TranscriptEntry } from "@/lib/types";

export interface RealtimeTranscriptEntry extends TranscriptEntry {
  createdAt: string;
  final: boolean;
}

export interface RealtimeActivityEntry extends ActivityEntry {
  createdAt: string;
  source: "system" | "specialist" | "connection" | "error";
}
