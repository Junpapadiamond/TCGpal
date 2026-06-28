import { NextResponse } from "next/server";
import { mapOnePieceCardToIdentity, searchOnePieceCards } from "@/lib/external/one-piece-tcg";

// Optional server-side lookup against the OPTCG (One Piece) catalog. This is a
// read-only adapter route for verifying the integration; it does not drive
// recommendation ranking. Query with ?name=Luffy or ?cardId=OP01-001.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") ?? "").trim();
  const cardId = (searchParams.get("cardId") ?? "").trim();

  if (!name && !cardId) {
    return NextResponse.json(
      { error: "Provide a ?name= or ?cardId= query parameter." },
      { status: 400 },
    );
  }

  try {
    const result = await searchOnePieceCards({ query: name || cardId, cardNumber: cardId });
    return NextResponse.json({
      source: result.source,
      count: result.count,
      cards: result.cards,
      identities: result.cards.map((card) =>
        mapOnePieceCardToIdentity(card, {
          confidence: cardId ? "high" : "medium",
          matchReasons: cardId
            ? ["Matched the requested card id."]
            : ["Matched the requested card name."],
        }),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "The One Piece card lookup could not be completed.",
      },
      { status: 502 },
    );
  }
}
