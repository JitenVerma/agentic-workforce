import { NextRequest, NextResponse } from "next/server";
import { endRoomSession } from "@/lib/room/orchestrator";
import { getRoomStore } from "@/lib/room/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const room = getRoomStore().getRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    await endRoomSession(roomId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to end the room.",
      },
      { status: 500 },
    );
  }
}
