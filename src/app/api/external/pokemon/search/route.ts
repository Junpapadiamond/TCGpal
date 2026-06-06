import { NextResponse } from "next/server";
import { z } from "zod";
import { searchPokemonCards } from "@/lib/external/pokemon-tcg";

const searchParamsSchema = z.object({
  query: z.string().trim().min(2),
  pageSize: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = searchParamsSchema.parse({
      query: url.searchParams.get("query"),
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return NextResponse.json(await searchPokemonCards(parsed));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pokemon TCG search failed." },
      { status: 400 },
    );
  }
}
