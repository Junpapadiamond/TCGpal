import { NextResponse } from "next/server";
import { getAgentCapabilities } from "@/lib/agent-capabilities";

export function GET() {
  return NextResponse.json(getAgentCapabilities(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
