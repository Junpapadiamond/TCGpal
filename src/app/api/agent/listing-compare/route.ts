import { NextResponse } from "next/server";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { comparisonRequestSchema } from "@/lib/schemas";

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
