import {
  cardImageRequestSchema,
  fetchOfficialOnePieceCardImage,
  parseOfficialOnePieceCardImageUrl,
} from "@/lib/external/card-image";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request) {
  const parsed = cardImageRequestSchema.safeParse({
    url: new URL(request.url).searchParams.get("url") ?? "",
  });
  if (!parsed.success) {
    return new Response("Unsupported card image URL.", { status: 400 });
  }

  const imageUrl = parseOfficialOnePieceCardImageUrl(parsed.data.url);
  if (!imageUrl) {
    return new Response("Unsupported card image URL.", { status: 400 });
  }

  try {
    const bytes = await fetchOfficialOnePieceCardImage(imageUrl);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Card image unavailable.", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
