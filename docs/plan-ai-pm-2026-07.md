# TCGpal 4-week plan: real users, visible AI, PM-grade artifacts

Written 2026-07-23. Goal: in 4 weeks, turn the project from "impressive build" into "evidence I can product-manage an AI product" — usable in AI PM interviews in the US, China, and Taiwan.

North star metric: **verified-decision rate** — % of comparisons where the user clicks out to a listing (`choice_opened`) or answers Yes to "did this evidence change what you would do?" (`decision_feedback_submitted`). Both events already exist in `ComparisonApp.tsx`.

---

## Week 1 — Users and a funnel (highest priority, blocks everything else)

The single biggest gap. No feature work this week except instrumentation gaps.

1. Wire the funnel end to end. Events already fired: `card_search_started` → `card_identity_confirmed` → `comparison_completed` → `choice_opened` / `decision_feedback_submitted`. Verify they land in your analytics backend (Amplitude/Vercel Analytics); add `session_origin` property distinguishing web vs MCP so the MCP distribution story gets a number. Build one dashboard: funnel + verified-decision rate + searches/day.
2. Recruit 20–50 real buyers:
   - US/EN: r/PokeInvesting, r/pkmntcg, r/OnePieceTCG, 2–3 active Discords. Post as "I built a tool that tells you which eBay listing is actually worth buying — looking for feedback," not as marketing.
   - TW/中文: PTT TCG boards, 巴哈姆特, FB 社團 (寶可夢卡牌交流). The 中文 UI is the hook.
   - Ask each user for one thing: a card they were about to buy this week. Watch what they do (5 recorded sessions minimum — screen share or Clarity/heatmap).
3. Collect qualitative signal: after each session, two questions only — "would you have bought differently?" and "what did you not trust?"

Deliverable: a one-page metrics readout (funnel numbers, verified-decision rate, 3 quotes, top 2 drop-off points). This page gets shown in interviews.

Definition of done: ≥30 real comparisons by non-you users, dashboard live, 5 observed sessions.

## Week 2 — Publish the eval page + decision log (career artifacts from existing material)

No new AI yet; make the existing rigor visible.

1. Eval page (`docs/evals.md`, later a public /method subsection):
   - Identity resolution: run the existing test corpus + 100 sampled real queries from Week 1 logs; report exact-print accuracy, ambiguity-gallery rate, wrong-confirm rate.
   - Extraction (paste-a-URL): 30 listings across eBay/Mercari/Yahoo JP; precision on price/condition/photos fields; LLM gap-fill contribution vs deterministic-only.
   - Abstention: % of comparisons ending in `next_moves`, framed as a feature ("we abstain rather than fake confidence") with the guardrail rationale.
   - Source of truth: `output/one-piece-exact-print-audit.json` pipeline already computes much of this — surface, don't rebuild.
2. Decision log (`docs/decisions-and-tradeoffs.md`): 6–8 entries, each = context → options → call → why. Must include: refusing photo grade prediction (trust/liability), unknown ≠ risky calibration, abstention over fallback inventory, TCGplayer as reference-never-listing, why paste-a-URL instead of scraping. This is the anti-"AI built it for you" counter — these calls are in AGENTS.md already; rewrite them as decisions with reasoning.
3. Monetization memo (1 page, `docs/monetization.md`): eBay Partner Network affiliate on `choice_opened` clicks. Unit economics with Week 1 real numbers: searches/day × click-out rate × EPN commission. State what you would NOT do (paid rankings — conflicts with evidence-neutrality).

Definition of done: three docs committed; evals have real numbers, not placeholders.

## Week 3 — Ship the vision evidence-check (the load-bearing AI feature)

Upgrades "evidence" from photo *count* to verified claims. Stays inside the guardrail: identity/authenticity of the *photo*, never condition/grade prediction.

Scope (v1, eBay listings only):
1. For each candidate listing's photos, a vision model answers three yes/no/unknown questions:
   - Stock photo vs actual item (catalog art match, watermarks, white-background renders)?
   - Does a photo show the confirmed print's identifying marks (collector number, set stamp) matching the confirmed card?
   - Are front AND back shown?
2. Output feeds existing structures: append to `evidence` and `trustNotes` on `NormalizedListing`; "Thin evidence" verdict copy gains specifics ("photo appears to be a stock image" / "collector number visible and matches"). Unknown stays neutral per the risk-calibration rule.
3. Architecture: new module `src/lib/comparison/photo-evidence.ts`, called from the listing-compare pipeline behind an env flag (`PHOTO_EVIDENCE_ENABLED`); OpenAI-compatible vision call via the existing model config; cache per listing-image URL; hard timeout, failure = "unknown," never blocks the comparison.
4. Eval ships the same week (add to `docs/evals.md`): 50 hand-labeled listing photo sets (label stock/actual/unknown yourself — ~2h); report precision/recall per question; set a launch bar (e.g., stock-photo precision ≥0.9 — false "stock" accusations are the costly error; recall can be low at launch).
5. UI: one small line in the listing row/lead card, e.g. "📷 Actual item · number verified" or "Stock photo — ask for real photos." No new panels.

Definition of done: flag on in prod, eval published, and the "Ask" flow (below) references missing photo evidence.

Quick add-on (1 day): **Ask-the-seller drafting.** The Ask button generates the specific message from known evidence gaps ("Could you add a photo of the back and the corner showing SWSH144?"). Copy-to-clipboard, both languages. Uses existing explain endpoint infrastructure.

## Week 4 — Watch agent (retention loop) + interview packaging

1. Watch agent v1:
   - On any result — especially abstentions — "Watch this card": store card id + condition + max price + evidence threshold (≥2 real photos, proven seller).
   - A scheduled job (Vercel cron, reuse the report pipeline + 15-min cache infra) re-runs the comparison 2–4×/day; when a listing meets the bar, notify by email (Resend free tier) with the receipt-format summary and deep link.
   - Storage: start with Vercel KV/Postgres, no auth — watch tied to an email address; deleting = link in the email. (No accounts keeps you inside the no-login product principle.)
   - Also expose watch-creation through the MCP so a ChatGPT user can say "watch this card under $30" — that's the demo moment.
   - Metric: watches created, alert→click rate, D7 return.
2. Interview packaging:
   - One 6-page narrative deck (or Notion page): problem → insight (evidence, not price, is the bottleneck) → guardrail decisions → funnel numbers → eval table → what's next. CN version: add the 为什么先做美国市场 slide (闲鱼 has no public API → paste-a-URL architecture is the China wedge; incumbents 集换社/卡淘 are price-first, you are evidence-first).
   - 90-second screen recording: search → confirm → verdict → photo-evidence line → set a watch from ChatGPT via MCP.
   - Resolve the naming (TCGlens vs TCGpal) before recording anything.

Definition of done: watch agent live with ≥5 real watches from Week 1 users; deck + video done.

---

## Explicitly deferred (say "not now" in interviews — that's also PM skill)

- General chat assistant beyond the existing explain endpoint — not load-bearing.
- Condition/grade prediction from photos — permanently out (trust position, not a capability gap).
- JP condition-vocabulary mapping agent — good Week 5+ candidate, after cross-border demand shows up in watch/paste data.
- More marketplaces — only after EPN monetization proves the eBay loop.

## Risks

- Recruiting flops → fall back to 10 paid-with-a-booster-pack user tests; observed sessions matter more than volume.
- Vision costs/latency → sample only top-N candidate listings' first 3 photos; cache aggressively.
- Watch agent spam/abuse → cap watches per email (5), expire after 30 days.
- eBay API rate limits under cron load → stagger schedules, reuse report cache, batch by card.

## The one-line story this plan buys you

"I shipped an evidence agent for trading-card buyers, got N users, measured a X% verified-decision rate, published evals for every model-touched surface, and distributed it through MCP into ChatGPT — and I can show you the decisions, not just the code."
