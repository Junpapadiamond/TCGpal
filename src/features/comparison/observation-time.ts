export function formatObservationTime(value: string, lang: "en" | "zh") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}
