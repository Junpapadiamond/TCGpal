import { NextResponse } from "next/server";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { comparisonRequestSchema } from "@/lib/schemas";

// Give the multi-provider comparison enough headroom for cold provider paths and
// optional expanded discovery, so upstream slowness can degrade into a JSON
// result instead of Vercel's plain-text timeout body.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = comparisonRequestSchema.parse(body);
    return NextResponse.json(await runListingComparison(parsed));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The listing comparison could not be completed.",
      },
      { status: 400 },
    );
  }
}
