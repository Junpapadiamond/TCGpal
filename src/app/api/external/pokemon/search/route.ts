import { NextResponse } from "next/server";
import { z } from "zod";
import { browsePokemonCards } from "@/lib/external/pokemon-tcg";

const searchParamsSchema = z.object({
  query: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(250).default(24),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = searchParamsSchema.parse({
      query: url.searchParams.get("query") ?? "",
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return NextResponse.json(await browsePokemonCards(parsed));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pokemon TCG search failed." },
      { status: 400 },
    );
  }
}
