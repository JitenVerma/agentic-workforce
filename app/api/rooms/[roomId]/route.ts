import { NextRequest, NextResponse } from "next/server";
import { getRoomStore } from "@/lib/room/store";
import { RoomSessionResponse } from "@/lib/room/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const room = getRoomStore().getRoom(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const payload: RoomSessionResponse = { room };
  return NextResponse.json(payload);
}
