export function mergeUserFacingStrings(left: string[], right: string[]) {
  const merged: string[] = [];

  for (const item of [...left, ...right]) {
    const cleaned = sanitizeUserFacingText(item);
    if (!cleaned || merged.some((existing) => isNearDuplicate(existing, cleaned))) continue;
    merged.push(cleaned);
  }

  return merged;
}

export function sanitizeUserFacingText(value: string) {
  return value
    .replace(/[\u0590-\u05ff\u0600-\u06ff]+/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isNearDuplicate(left: string, right: string) {
  const leftKey = normalizeForDedupe(left);
  const rightKey = normalizeForDedupe(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (leftKey.length > 24 && rightKey.length > 24 && (leftKey.includes(rightKey) || rightKey.includes(leftKey))) return true;

  const leftTokens = new Set(leftKey.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(rightKey.split(" ").filter((token) => token.length > 2));
  if (leftTokens.size < 4 || rightTokens.size < 4) return false;

  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.72;
}

function normalizeForDedupe(value: string) {
  return sanitizeUserFacingText(value)
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(corners)\b/g, "corner")
    .replace(/\b(angled)\b/g, "angle")
    .replace(/\b(all|four)\b/g, " ")
    .replace(/\b(can|could|please|you|the|and|with|for|any|are|is|it|this|that|share|provide)\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
