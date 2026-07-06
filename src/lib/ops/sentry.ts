import * as Sentry from "@sentry/nextjs";
import type { OpsRoute } from "@/lib/ops/events";

export type SentryOperationalContext = {
  route?: OpsRoute;
  provider?: string;
  operation?: string;
  requestId?: string;
  status?: string;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

export function isSentryEnabled() {
  return Boolean(process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

export function captureOperationalException(error: unknown, context: SentryOperationalContext = {}) {
  if (!isSentryEnabled()) return;

  Sentry.captureException(error, {
    tags: {
      route: context.route,
      provider: context.provider,
      operation: context.operation,
      status: context.status,
    },
    extra: {
      requestId: context.requestId,
      ...context.extra,
    },
  });
}
