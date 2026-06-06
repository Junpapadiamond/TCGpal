import { NextResponse } from "next/server";
import { z } from "zod";
import { PriceChartingUnavailableError, searchPriceChartingProducts } from "@/lib/external/price-charting";

const searchParamsSchema = z.object({
  query: z.string().trim().min(2),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = searchParamsSchema.parse({
      query: url.searchParams.get("query"),
    });

    return NextResponse.json(await searchPriceChartingProducts(parsed));
  } catch (error) {
    const message = error instanceof Error ? error.message : "PriceCharting search failed.";
    const status = error instanceof PriceChartingUnavailableError ? 503 : 400;

    return NextResponse.json({ available: false, error: message }, { status });
  }
}
