import { NextResponse } from "next/server";
import { runMarketCheck } from "@/lib/ai/market-check";
import { marketCheckRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = marketCheckRequestSchema.parse(body);
    return NextResponse.json(await runMarketCheck(parsed));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Market check failed.",
      },
      {
        status: 400,
      },
    );
  }
}
