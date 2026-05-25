import { z } from "zod";
import { getAiConfig, getModelForStep } from "@/lib/ai/config";
import { createAiProvider } from "@/lib/ai/provider";
import {
  runCriticStage,
  runEvidenceStage,
  runMathStage,
  runRiskStage,
  type PipelineStagePayload,
} from "@/lib/ai/listing-risk-pipeline";
import { listingEvidenceSchema, listingRiskInputSchema } from "@/lib/schemas";

const pipelineRequestSchema = z.object({
  listingInput: listingRiskInputSchema,
  evidence: listingEvidenceSchema.optional(),
  continueFromEvidence: z.boolean().default(false),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = pipelineRequestSchema.parse(body);
  const config = getAiConfig();
  const provider = createAiProvider(config);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: PipelineStagePayload | { stage: "done" } | { stage: "error"; message: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        let evidence = parsed.evidence;

        if (!evidence) {
          const evidenceStage = await runEvidenceStage({
            listingInput: parsed.listingInput,
            provider,
            primaryModel: config.primaryModel,
          });
          evidence = evidenceStage.evidence;
          send(evidenceStage);
        }

        if (parsed.continueFromEvidence) {
          const riskStage = await runRiskStage({
            listingInput: parsed.listingInput,
            evidence,
            provider,
          });
          send(riskStage);

          const mathStage = runMathStage({
            listingInput: parsed.listingInput,
            evidence,
            riskScore: riskStage.riskScore,
          });
          send(mathStage);

          const criticStage = await runCriticStage({
            evidence,
            riskScore: riskStage.riskScore,
            math: mathStage.math,
            provider,
            cheapModel: getModelForStep("critic", config),
          });
          send(criticStage);
        }

        send({ stage: "done" });
      } catch (error) {
        send({ stage: "error", message: error instanceof Error ? error.message : "Unknown pipeline error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
