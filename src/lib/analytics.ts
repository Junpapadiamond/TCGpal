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
}

export function trackEvent(event: TcgpalAnalyticsEvent, properties: Record<string, unknown> = {}) {
  initializeAnalytics();
  if (!initialized) return;
  posthog.capture(event, sanitizeAnalyticsProperties(properties));
}

export function sanitizeAnalyticsProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => allowedProperties.has(key)),
  );
}
