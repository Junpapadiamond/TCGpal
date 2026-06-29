"use client";

import posthog from "posthog-js";

export type TcgpalAnalyticsEvent =
  | "comparison_started"
  | "source_detected"
  | "card_identity_confirmed"
  | "manual_candidate_added"
  | "comparison_completed"
  | "comparison_failed"
  | "choice_opened"
  | "decision_feedback_submitted"
  | "second_comparison_started";

const allowedProperties = new Set([
  "marketplace",
  "status",
  "demo_mode",
  "candidate_count",
  "choice_role",
  "confidence",
  "duration_bucket",
  "changed_decision",
]);

let initialized = false;

export function initializeAnalytics() {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  try {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: "never",
      persistence: "localStorage",
    });
    initialized = true;
  } catch {
    // Analytics must never break the app. If init fails (e.g. a strict browser
    // rejecting a host URL, or storage disabled in private mode), stay disabled.
    initialized = false;
  }
}

export function trackEvent(event: TcgpalAnalyticsEvent, properties: Record<string, unknown> = {}) {
  // A telemetry failure must never surface as a broken comparison. Any throw
  // from PostHog (e.g. Safari's URL constructor) is swallowed here.
  try {
    initializeAnalytics();
    if (!initialized) return;
    posthog.capture(event, sanitizeAnalyticsProperties(properties));
  } catch {
    /* ignore analytics errors */
  }
}

export function sanitizeAnalyticsProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => allowedProperties.has(key)),
  );
}
