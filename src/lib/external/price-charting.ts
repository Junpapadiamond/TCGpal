import { z } from "zod";

const priceChartingProductSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    "product-name": z.string().optional(),
    "console-name": z.string().optional(),
    "loose-price": z.union([z.string(), z.number()]).optional(),
    "cib-price": z.union([z.string(), z.number()]).optional(),
    "new-price": z.union([z.string(), z.number()]).optional(),
    "graded-price": z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const priceChartingSearchResponseSchema = z
  .object({
    status: z.string().optional(),
    products: z.array(priceChartingProductSchema).default([]),
  })
  .passthrough();

export type PriceChartingProduct = {
  id: string;
  productName: string;
  consoleName: string | null;
  loosePrice: number | null;
  completeInBoxPrice: number | null;
  newPrice: number | null;
  gradedPrice: number | null;
};

export type PriceChartingSearchResult = {
  source: "pricecharting";
  query: string;
  products: PriceChartingProduct[];
  available: boolean;
};

type SearchPriceChartingOptions = {
  query: string;
  token?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

const PRICE_CHARTING_API_BASE_URL = "https://www.pricecharting.com/api";

export async function searchPriceChartingProducts({
  query,
  token = process.env.PRICECHARTING_API_TOKEN,
  fetcher = fetch,
  timeoutMs = 8000,
}: SearchPriceChartingOptions): Promise<PriceChartingSearchResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) throw new Error("PriceCharting search query must be at least 2 characters.");

  if (!token) {
    throw new PriceChartingUnavailableError("PRICECHARTING_API_TOKEN is not configured.");
  }

  const url = new URL(`${PRICE_CHARTING_API_BASE_URL}/products`);
  url.searchParams.set("t", token);
  url.searchParams.set("q", normalizedQuery);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetcher(url, {
    next: { revalidate: 3600 },
    signal: controller.signal,
  } as RequestInit & { next: { revalidate: number } }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`PriceCharting API request failed with ${response.status}.`);
  }

  const json = priceChartingSearchResponseSchema.parse(await response.json());
  if (json.status && json.status !== "success") {
    throw new Error(`PriceCharting API returned status ${json.status}.`);
  }

  return {
    source: "pricecharting",
    query: normalizedQuery,
    products: json.products.map(normalizeProduct).filter((product): product is PriceChartingProduct => Boolean(product)),
    available: true,
  };
}

export class PriceChartingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceChartingUnavailableError";
  }
}

function normalizeProduct(product: z.infer<typeof priceChartingProductSchema>): PriceChartingProduct | null {
  const productName = product["product-name"];
  if (!productName) return null;

  return {
    id: String(product.id ?? productName),
    productName,
    consoleName: product["console-name"] ?? null,
    loosePrice: normalizeCents(product["loose-price"]),
    completeInBoxPrice: normalizeCents(product["cib-price"]),
    newPrice: normalizeCents(product["new-price"]),
    gradedPrice: normalizeCents(product["graded-price"]),
  };
}

function normalizeCents(value: string | number | undefined) {
  if (value === undefined || value === "") return null;
  const cents = Number(value);
  return Number.isFinite(cents) ? cents / 100 : null;
}
