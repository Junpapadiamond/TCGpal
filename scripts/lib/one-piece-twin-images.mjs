// Research only: equal reference pixels do not prove equal physical treatments.
export function twinGroups(catalog) {
  const groups = new Map();
  for (const card of catalog) {
    const stem = (card.variant ?? "base").replace(/\s*\([PR]\d+\)/gi, "").trim();
    const key = JSON.stringify([card.card_set_id, card.set_name, stem]);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function compareImages(left, right) {
  if (left.status !== "observed" || right.status !== "observed") return { status: "not_compared" };
  if (!left.vector?.length || left.vector.length !== right.vector?.length) throw new Error("Incompatible image vectors");
  let squared = 0;
  for (let index = 0; index < left.vector.length; index++) squared += (left.vector[index] - right.vector[index]) ** 2;
  return {
    status: "compared",
    byteIdentical: left.sha256 === right.sha256,
    pixelIdentical: left.width === right.width && left.height === right.height && left.pixelSha256 === right.pixelSha256,
    rgbRmse32x45: Number(Math.sqrt(squared / left.vector.length).toFixed(6)),
  };
}

// Deliberately conservative: any nonempty Disallow blocks this one-off run,
// including rules for another agent. No attempt to outsmart access restrictions.
export function robotsAllowsResearch(status, text) {
  if (status === 404 || status === 410) return true;
  if (status !== 200) return false;
  return !text.split(/\r?\n/).some((line) => /^\s*disallow\s*:\s*\S/i.test(line.split("#")[0]));
}
