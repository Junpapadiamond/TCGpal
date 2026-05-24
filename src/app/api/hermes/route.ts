import { NextResponse } from "next/server";
import { routeHermes } from "@/lib/ai/hermes";
import { hermesRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = hermesRequestSchema.parse(body);
    const response = await routeHermes(parsed);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Hermes error";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 400,
      },
    );
  }
}
