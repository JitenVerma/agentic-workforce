import { NextRequest } from "next/server";
import { getRoomStore } from "@/lib/room/store";
import { RoomEvent } from "@/lib/room/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(event: RoomEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const store = getRoomStore();
  const room = store.getRoom(roomId);

  if (!room) {
    return new Response("Room not found.", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      controller.enqueue(
        encoder.encode(
          encodeEvent({
            id: crypto.randomUUID(),
            type: "room.snapshot",
            roomSessionId: roomId,
            createdAt: new Date().toISOString(),
            payload: {
              room,
            },
          }),
        ),
      );

      const unsubscribe = store.subscribe(roomId, (event) => {
        if (!closed) {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        }
      });

      const keepAlive = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }
      }, 15000);

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      return;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
