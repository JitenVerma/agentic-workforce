import { NextRequest, NextResponse } from "next/server";
import { sendTextToA2AAgent } from "@/lib/a2a/client";
import { A2AAgentMessageRequest } from "@/lib/a2a/types";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await params;
    const body = (await request.json()) as Partial<A2AAgentMessageRequest>;

    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: "A non-empty text prompt is required." },
        { status: 400 },
      );
    }

    const response = await sendTextToA2AAgent(agentId, {
      text: body.text.trim(),
      contextId: body.contextId,
      taskId: body.taskId,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send a message to the A2A agent.",
      },
      { status: 500 },
    );
  }
}
