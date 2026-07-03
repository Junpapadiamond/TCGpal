import { NextResponse } from "next/server";
import { answerComparisonQuestion } from "@/lib/ai/comparison-qa";
import { comparisonQuestionRequestSchema } from "@/lib/schemas";

export const maxDuration = 20;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = comparisonQuestionRequestSchema.parse(body);
    return NextResponse.json(await answerComparisonQuestion(parsed.report, parsed.question));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The comparison question could not be answered.",
      },
      { status: 400 },
    );
  }
}
