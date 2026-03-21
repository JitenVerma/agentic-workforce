import { NextRequest, NextResponse } from "next/server";
import { listA2AAgents } from "@/lib/a2a/client";
import { getA2AAgentRegistry } from "@/lib/a2a/registry";
import { A2AAgentsResponse } from "@/lib/a2a/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const agents = await listA2AAgents();
    const payload: A2AAgentsResponse = { agents };

    if (request.nextUrl.searchParams.get("debug") === "1") {
      return NextResponse.json({
        ...payload,
        registry: getA2AAgentRegistry(),
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load A2A agents.",
      },
      { status: 500 },
    );
  }
}
