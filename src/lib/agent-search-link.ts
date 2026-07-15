import { z } from "zod";
import type { TcgGame } from "@/lib/schemas";

const agentSearchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  game: z.enum(["pokemon", "onePiece"]),
  confirmedCardId: z.string().trim().min(1).max(160).optional(),
  autoSubmit: z.boolean(),
});

export type AgentSearchHandoff = z.infer<typeof agentSearchSchema>;

const journeySearchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  game: z.enum(["pokemon", "onePiece"]),
  step: z.enum(["search", "confirmation", "result"]),
  confirmedCardId: z.string().trim().min(1).max(160).optional(),
});

export function parseJourneySearchParams(params: URLSearchParams) {
  const parsed = journeySearchSchema.safeParse({
    query: params.get("query") ?? "",
    game: params.get("game") ?? "",
    step: params.get("step") ?? "",
    confirmedCardId: params.get("card") || undefined,
  });
  return parsed.success ? parsed.data : null;
}

export function parseAgentSearchParams(params: URLSearchParams): AgentSearchHandoff | null {
  if (params.get("agent") !== "1") return null;

  const parsed = agentSearchSchema.safeParse({
    query: params.get("q") ?? "",
    game: params.get("game") ?? "",
    confirmedCardId: params.get("card") || undefined,
    autoSubmit: params.get("auto") !== "0",
  });
  return parsed.success ? parsed.data : null;
}

export function buildAgentSearchUrl(
  origin: string,
  input: { query: string; game: TcgGame; confirmedCardId?: string; autoSubmit?: boolean },
) {
  const url = new URL("/", origin);
  url.searchParams.set("agent", "1");
  url.searchParams.set("game", input.game);
  url.searchParams.set("q", input.query.trim());
  if (input.confirmedCardId) url.searchParams.set("card", input.confirmedCardId.trim());
  if (input.autoSubmit === false) url.searchParams.set("auto", "0");
  return url.toString();
}
