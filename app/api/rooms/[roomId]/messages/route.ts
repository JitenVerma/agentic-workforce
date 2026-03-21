import { NextRequest, NextResponse } from "next/server";
import { processHumanRoomMessage } from "@/lib/room/orchestrator";
import { getRoomStore } from "@/lib/room/store";
import { RoomMessageRequest, RoomMessageResponse } from "@/lib/room/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const room = getRoomStore().getRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    const body = (await request.json()) as Partial<RoomMessageRequest>;
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: "A non-empty human message is required." },
        { status: 400 },
      );
    }

    void processHumanRoomMessage(roomId, body.text.trim()).catch((error) => {
      console.error("Room orchestration error", error);
    });

    const payload: RoomMessageResponse = {
      accepted: true,
      roomSessionId: roomId,
    };

    return NextResponse.json(payload, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to submit the room message.",
      },
      { status: 500 },
    );
  }
}
