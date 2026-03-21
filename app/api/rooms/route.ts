import { NextRequest, NextResponse } from "next/server";
import { getRoomStore } from "@/lib/room/store";
import { CreateRoomRequest, CreateRoomResponse } from "@/lib/room/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CreateRoomRequest>;

    if (!body.project || typeof body.project !== "object" || typeof body.project.id !== "string") {
      return NextResponse.json(
        { error: "A full project payload is required to create a room." },
        { status: 400 },
      );
    }

    const store = getRoomStore();
    const room = store.createRoom(body.project);
    store.setStatus(room.id, "live");

    const payload: CreateRoomResponse = {
      room: store.getRoom(room.id) ?? room,
    };

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create the room session.",
      },
      { status: 500 },
    );
  }
}
