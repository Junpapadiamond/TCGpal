import { searchIntentSchema, type SearchIntent, type TcgGame } from "@/lib/schemas";
import { parseCardQuery } from "./query-parser";

export function needsSearchInterpretation(query: string) {
  return /[$€£¥￥]|\b(?:under|below|budget|up to|at most|less than|maximum|max|or less|condition|mint|nm|lp|mp|looking|find|show|want|graded|slab)\b|[\u3400-\u9fff]/i.test(query);
}

// These expressions describe buyer constraints, never seller facts or prices.
export function parseSearchIntent(input: string, game: TcgGame = "pokemon"): SearchIntent {
  let query = input.normalize("NFKC").trim();
  let issue: SearchIntent["issue"] = /人民币|人民幣|日元|日圓|台币|台幣|港币|港幣|欧元|歐元|英镑|英鎊|[€£¥￥]|\b(?:CNY|RMB|JPY|EUR|GBP|HKD|TWD)\b/i.test(query) ? "currency" : null;
  if (/\b(?:psa|bgs|cgc|sgc)\s*\d|评级|評級|slab|graded/i.test(query)) issue ??= "graded";
  if (/\b(?:not|without|except|between)\b|不要|不想|除外|含税|含稅|after tax|all.in/i.test(query)) issue ??= "clarify";
  let budgetMax: number | null = null;
  const amount = "([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)";
  const patterns = [
    new RegExp(`(?:under|below|up to|at most|less than|budget(?: of)?|maximum|max|预算|預算|不超过|不超過|低于|低於)\\s*[:：]?\\s*\\$?${amount}\\s*(?:USD|dollars?|美元|美金|块|塊|元)?(?:以内|以下|一下|以內)?`, "i"),
    new RegExp(`\\$?${amount}\\s*(?:USD|dollars?|美元|美金|块|塊|元)?\\s*(?:以内|以下|一下|以內|or less)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (!match) continue;
    budgetMax = Number(match[1].replaceAll(",", ""));
    query = query.replace(match[0], " ");
    break;
  }
  if (budgetMax !== null && (budgetMax <= 0 || budgetMax > 1_000_000)) { budgetMax = null; issue ??= "clarify"; }
  let desiredCondition: SearchIntent["desiredCondition"] = null;
  const good = /(?:good|excellent|great)\s*condition|好品[相项項]|品[相项項]好|品相好的|成色好|品相不错|品相不錯/gi;
  const conditionAssumed = good.test(query);
  good.lastIndex = 0;
  const conditions: Array<[RegExp, NonNullable<SearchIntent["desiredCondition"]>]> = [
    [/\b(?:lightly played|lp)(?:\s+or better)?\b|微瑕(?:及以上|以上)?/gi, "Lightly Played"],
    [/\b(?:near[ -]?mint|nm)\b|近全新|近新品/gi, "Near Mint"],
    [/\b(?:moderately played|mp)\b|中度磨损/gi, "Moderately Played"],
    [/\bany condition\b|不限品相/gi, "Unknown"],
  ];
  for (const [pattern, condition] of conditions) {
    if (pattern.test(query)) { desiredCondition = condition; pattern.lastIndex = 0; query = query.replace(pattern, " "); break; }
  }
  if (conditionAssumed) { desiredCondition ??= "Near Mint"; query = query.replace(good, " "); }
  query = query
    .replace(/噴火龍|喷火龙|老喷|老噴|\bcharizard\b/gi, "Charizard")
    .replace(/日版|日文/g, "Japanese ")
    .replace(/英文版|美版|英文/g, "English ")
    .replace(/皮卡丘/g, "Pikachu")
    .replace(/路飞|路飛/g, "Luffy")
    .replace(/娜美/g, "Nami")
    .replace(/(?:我(?:想要|想买|想買|要搜|要买|要買|要|想找)|想找|想买|想買|请帮我|請幫我|帮我|幫我|找一张|找一張|找|一张|一張|给我|給我|推荐|推薦|的|卡片)/g, " ")
    .replace(/\b(?:show me|find me|find|looking for|i want|i would like|please|in|a|an|with)\b/gi, " ")
    .replace(/[,，、:：。]/g, " ").replace(/\s+/g, " ").trim();
  if (!query || /^(?:卡|cards?|something)$/i.test(query)) issue ??= "card_required";
  if (/\b(?:under|below|budget|between|up to|at most|less than|maximum|max|USD|dollars)\b|[$]|预算|預算|以内|以下|以內|美元|美金/i.test(query)) issue ??= "clarify";
  return searchIntentSchema.parse({ query, game: parseCardQuery(query).game ?? game, budgetMax, desiredCondition, conditionAssumed, issue, source: "rules" });
}
