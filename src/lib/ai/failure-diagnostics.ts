export type AiFailure = { code: string; httpStatus?: number };
// Never return the provider body, prompt, credentials or arbitrary exception text.
export function safeAiFailure(error: unknown): AiFailure {
  const message = error instanceof Error ? error.message : "";
  const httpStatus = Number(/^(?:Anthropic|OpenAI) (\d{3}):/.exec(message)?.[1]) || undefined;
  if (httpStatus) return { code: [401, 403].includes(httpStatus) ? "authentication" : httpStatus === 429
    ? "rate_limit" : httpStatus >= 500 ? "upstream" : "request_rejected", httpStatus };
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return { code: "timeout" };
  if (/^AI output failed/.test(message)) return { code: "schema_validation" };
  if (/^AI output truncated/.test(message)) return { code: "truncated_output" };
  if (error instanceof SyntaxError) return { code: "invalid_json" };
  if (/response.*(?:empty|did not include)/i.test(message)) return { code: "empty_output" };
  if (/not configured/.test(message)) return { code: "configuration" };
  if (/body exceeds/.test(message)) return { code: "response_too_large" };
  return { code: "transport_or_unknown" };
}
