# TCGpal PRD v0.3: Collector Decision OS

## 1. Product Summary

**Product name:** TCGpal

**Positioning:** A cautious decision operating system for TCG collectors and small sellers.

**One-line value proposition:** TCGpal helps collectors avoid bad buys by turning every card decision into a repeatable workflow: evidence check, raw-vs-slab math, personal thesis, follow-up plan, and outcome review.

**Core belief:** Generic AI search tools answer card questions. TCGpal should manage card decisions over time.

TCGpal should not compete directly with Perplexity, ChatGPT Deep Research, TCGplayer, eBay, Collectr, PriceCharting, or marketplace apps on broad search or price lookup. It should sit above them as the user's personal decision memory and discipline layer.

## 2. Why TCGpal Exists

### 2.1 User Problem

Collectors and small sellers often do not fail because they lack information. They fail because their decision process is inconsistent:

- They overtrust seller titles such as "mint", "PSA10 candidate", or "no returns".
- They forget why they wanted a card.
- They do not define a buy condition or stop condition before purchase.
- They confuse collection desire with grading upside.
- They underestimate marketplace fees, shipping, grading cost, turnaround time, and liquidity risk.
- They repeat the same mistakes because past decisions are not reviewed.

### 2.2 Why Not Just Perplexity

Perplexity is strong at one-shot research:

- Search the web.
- Summarize sources.
- Explain current context.
- Generate a report.

But Perplexity does not naturally own:

- A persistent decision ledger.
- User-specific budget, risk tolerance, TCG preferences, and grading history.
- Structured pre-buy checklists.
- Raw-vs-slab deterministic math tied to saved decisions.
- 30-day follow-up items.
- Personal calibration from past grading assumptions versus actual outcomes.
- A history of "why I bought, why I skipped, what I learned."

**TCGpal's defensible product space is not card research. It is card decision discipline.**

## 3. Target Users

### 3.1 Primary User: Collection-Resale Hybrid Collector

**Profile**

- Collects specific TCGs, characters, artists, or sets.
- Cares about not overpaying.
- Sometimes grades cards or rotates cards for resale.
- Monthly card budget usually ranges from $50 to $500.

**Jobs**

- "Help me avoid impulse buys."
- "Help me decide if raw, PSA9, PSA10, or no-buy makes more sense."
- "Help me remember why I wanted this card."
- "Help me ask the seller the right questions before buying."
- "Help me learn from my grading assumptions."

### 3.2 Secondary User: Small Seller / Hobby Vendor

**Profile**

- Buys and sells cards casually.
- Has limited time and limited inventory.
- Needs discipline around fees, shipping, grading decisions, and liquidity.

**Jobs**

- "Help me avoid sending bad grading candidates."
- "Help me decide which inventory needs action."
- "Help me track why I bought a card and whether the decision worked."
- "Help me compare a listing against recent comps before I buy inventory."

### 3.3 Secondary User: New Collector

**Profile**

- Likes an IP but does not fully understand versions, rarity, condition, grading, or marketplace risk.

**Jobs**

- "Help me understand what risk I am taking."
- "Help me avoid wrong-version or condition-misrepresented listings."
- "Help me create a safer first collecting process."

## 4. Product Principles

1. **Decision-first, not hype-first.** TCGpal should never feel like a pump tool.
2. **Rules before agents.** Deterministic logic should handle calculations, scoring, guardrails, and local workflow.
3. **Agents gather evidence, rules enforce discipline.** Agents should search, compare, extract, and summarize messy external information.
4. **Every recommendation needs conditions.** The product should say "consider if", "skip if", "ask first", or "wait for", not "must buy".
5. **Every decision should age.** A card decision should be reviewed later against its original thesis.
6. **No unsupported certainty.** Especially around PSA10 odds, price movement, liquidity, and profit.

## 5. Core Product Loop

### 5.1 First-Run Setup

User selects:

- Favorite TCGs.
- Collector persona.
- Monthly budget range.
- Optional favorite characters/themes.
- Grading willingness.
- Preferred market.
- Risk posture.

Output:

- A local profile stored in `localStorage`.
- A card-forward home screen.
- Initial deterministic demo recommendations.

### 5.2 Card Decision Flow

User starts from:

- A curated/demo recommendation.
- A pasted listing.
- A manually entered card.
- A saved journal item.

TCGpal guides the user through:

1. **Evidence check:** Is the listing clear enough?
2. **Listing risk:** What seller/title/description risks exist?
3. **Raw-vs-slab math:** Do the numbers justify grading speculation?
4. **Decision thesis:** Why am I considering this?
5. **30-day plan:** What needs follow-up?
6. **Outcome review:** Did the decision work?

### 5.3 Journal Calibration Loop

When users save journal entries with assumed PSA10 probability and actual grade outcome:

- TCGpal compares assumptions against outcomes.
- TCGpal adjusts future PSA10 assumptions deterministically.
- TCGpal shows the user when they are consistently too optimistic.

This is one of the most important differentiators versus generic AI search.

## 6. MVP Scope

### 6.1 Must Have

#### A. Onboarding

Inputs:

- Favorite TCGs.
- Persona.
- Budget range.

Acceptance criteria:

- First open shows onboarding.
- Completion creates a profile.
- Profile affects home recommendations.
- No external API or model call required.

#### B. Card-Forward Home

Home should show:

- Budget/risk/journal/plan summary.
- Deterministic card recommendations.
- Card-shaped placeholders if real card images are unavailable.
- Latest journal note.
- Review queue.
- 30-day plan.

Acceptance criteria:

- Recommendations appear immediately after onboarding.
- Every recommendation opens a decision sheet.
- Home is useful even without AI.

#### C. Card Decision Sheet

Each card sheet shows:

- Card name/version/TCG.
- Raw guide.
- PSA9 guide.
- PSA10 guide.
- Estimated PSA10 probability.
- Risk flags.
- Counter note.
- Actions:
  - Run Raw vs Slab.
  - Check Listing Risk.
  - Add to 30-day plan.

Acceptance criteria:

- All actions preserve the selected card context.
- Plan items must reference the correct card.
- Closing the sheet returns to Home without losing profile state.

#### D. Listing Risk Checker

Inputs:

- Listing title.
- Description.
- Price.
- Marketplace.
- User goal.

Rule output:

- Risk level.
- Confidence.
- Cautious summary.
- Missing information.
- Key risks.
- Seller questions.
- Suitability.

Acceptance criteria:

- Must work without AI.
- Must flag unsupported condition claims.
- Must flag missing back photos / corner photos / surface photos.
- Must treat grading goals as stricter than personal collection goals.
- Must allow adding result to 30-day plan.

#### E. Raw vs Slab Calculator

Inputs:

- Raw price.
- PSA10 sold price.
- PSA9 sold price.
- Other estimate.
- Grading cost.
- Marketplace fee.
- Shipping.
- PSA10 probability.
- PSA9 probability.

Output:

- Expected profit.
- Worst case.
- Break-even PSA10 probability.
- Recommendation.
- Assumptions.

Acceptance criteria:

- All math is deterministic TypeScript.
- No model call is required.
- Result can be saved to 30-day plan.
- Result can later be connected to journal outcome.

#### F. Decision Journal

Fields:

- TCG.
- Card name.
- Version.
- Date.
- Action type.
- Price.
- Goal.
- Tags.
- Sentiment.
- Original thesis.
- Watch reason.
- Buy condition.
- Sell condition.
- Stop condition.
- Risks.
- Missing information.
- Review date.
- Review status.
- Final outcome.
- Lessons learned.
- Assumed PSA10 probability.
- Actual grade.
- Decision source.

Acceptance criteria:

- Entries persist locally.
- Entries can be filtered.
- Unresolved entries appear in Home review queue.
- Entries can influence future calibration.

#### G. 30-Day Plan

Plan items can be created from:

- Card recommendation.
- Listing Risk result.
- Raw vs Slab result.
- Journal review item.

Plan item fields:

- Source.
- Title.
- Card name.
- Summary.
- Due date.
- Status.

Acceptance criteria:

- Items persist locally.
- Items can be marked done or skipped.
- Items show due date.
- Items must not leak stale card/listing context.

## 7. Agent System Scope

### 7.1 Agent-Worthy Tasks

Use agents only when the task is open-ended, external, changing, and evidence-heavy.

Examples:

- Search multiple marketplaces for recent sold comps.
- Compare eBay, TCGplayer, Mercari, Cardmarket, Yahoo Japan, or other sources.
- Read KOL posts, social chatter, set release news, and collector discussion.
- Extract useful facts from messy pages.
- Filter irrelevant comps by language, version, condition, grade, region, or listing type.
- Summarize conflicting evidence.
- Produce a cited due diligence report.
- Monitor a card or theme over time.

### 7.2 Non-Agent Tasks

Do not use agents for:

- Raw-vs-slab math.
- Basic listing text red flags.
- Budget guardrails.
- Local recommendation scoring.
- Plan item status updates.
- Journal storage.
- PSA10 calibration from known journal outcomes.

### 7.3 Recommended First Agent Feature: Card Due Diligence Report

**User input**

- Card name.
- Version.
- TCG.
- Optional listing URL.
- User goal.
- Budget range.

**Agent tasks**

1. Search recent sold comps.
2. Filter comps for version/language/condition mismatch.
3. Check current active listing risk.
4. Check recent collector/KOL/social chatter.
5. Summarize liquidity and hype context.
6. Run deterministic raw-vs-slab math when enough numbers exist.
7. Produce a final cautious report.

**Output**

- Decision: `skip`, `ask seller first`, `watch`, `consider under condition`, or `buy only if`.
- Evidence quality score.
- Recent comps with source links.
- Version/condition risks.
- Raw-vs-slab result.
- Hype/liquidity notes.
- Missing information.
- Seller questions.
- Confidence level.
- Suggested 30-day plan item.

**Acceptance criteria**

- Every external claim has a source link.
- The report distinguishes facts from assumptions.
- The final recommendation is conditional.
- Weak evidence lowers confidence.
- The report can be saved into Journal and 30-day plan.

## 8. Proposed Multi-Agent Design

### 8.1 Search Agent

Responsibility:

- Find candidate sources.
- Retrieve marketplace listings, sold comps, public posts, and official card references where available.

Output:

- Source list with title, URL, source type, timestamp, and raw snippet.

### 8.2 Comps Agent

Responsibility:

- Extract prices, dates, grade/raw status, language, version, condition, and marketplace.
- Remove irrelevant comps.

Output:

- Normalized comp table.
- Comp confidence.
- Rejection reasons for discarded comps.

### 8.3 Listing Risk Agent

Responsibility:

- Apply deterministic listing risk rules.
- Optionally use AI to explain ambiguous or messy listings.

Output:

- Risk level.
- Missing evidence.
- Seller questions.
- Suitability by user goal.

### 8.4 Trend Context Agent

Responsibility:

- Summarize recent KOL/social/release chatter.
- Identify whether demand is organic, event-driven, or hype-driven.

Output:

- Trend notes.
- Hype risk.
- Recency.
- Source quality.

### 8.5 Critic Agent

Responsibility:

- Challenge the draft conclusion.
- Flag unsupported certainty.
- Check for weak comps, stale sources, version mismatch, and overconfident language.

Output:

- Pass/fail.
- Required revisions.
- Safety warnings.

### 8.6 Report Agent

Responsibility:

- Turn structured evidence into a concise user-facing report.
- Keep language cautious and actionable.

Output:

- Final due diligence report.
- Suggested next action.
- Journal-ready summary.
- Plan-ready follow-up item.

## 9. Competitive Differentiation

### 9.1 Versus Perplexity / Generic AI Search

Perplexity answers:

> What does the web say about this card?

TCGpal answers:

> Given my personal budget, grading history, open plan items, and risk tolerance, should this specific decision move forward, wait, or stop?

### 9.2 Versus Marketplace Tools

Marketplace tools answer:

> What can I buy or sell right now?

TCGpal answers:

> Is this decision disciplined enough to act on?

### 9.3 Versus Portfolio Trackers

Portfolio tools answer:

> What do I own and what is it worth?

TCGpal answers:

> Why did I make this decision, what did I assume, and did I learn from the outcome?

## 10. Metrics

### 10.1 Activation Metrics

- Onboarding completion rate.
- First recommendation opened.
- First listing risk check completed.
- First raw-vs-slab calculation completed.
- First journal entry saved.

### 10.2 Engagement Metrics

- Weekly active decision count.
- Number of cards added to 30-day plan.
- Review queue completion rate.
- Journal entries with outcome filled in.
- Repeat use of calibration-adjusted PSA10 probability.

### 10.3 Quality Metrics

- Percentage of plan items with correct card context.
- Percentage of risk reports with missing information identified.
- Percentage of due diligence reports with source links.
- User-rated helpfulness of final decision brief.
- Reduction in repeated user mistakes over time.

### 10.4 Safety Metrics

- Zero profit guarantees.
- Zero "must buy" language.
- Zero unsupported PSA10 certainty.
- AI fallback success rate.
- Critic rejection rate for overconfident reports.

## 11. Non-Goals

Current phase should not include:

- Supabase.
- Auth.
- Payments.
- Image upload.
- Vision model.
- Always-on web search.
- Marketplace scraping at scale.
- Real-time price alerts.
- Automated buying.
- Financial-advisor language.
- Main-navigation Plan Generator.

## 12. Roadmap

### Phase 0.7: Local Decision Layer

Status: current MVP.

Includes:

- Onboarding.
- Card-forward Home.
- Listing Risk Checker.
- Raw vs Slab Calculator.
- Decision Journal.
- 30-day plan.
- LocalStorage persistence.
- Optional AI listing explanation.

### Phase 0.8: Trust and Context Polish

Goals:

- Fix stale card/listing context leaks.
- Remove fake-rich first-time state or label demo state clearly.
- Improve card decision sheet continuity.
- Improve AI output cleanup and de-duplication.
- Make rule output the primary trusted result.

Acceptance criteria:

- Running Raw vs Slab from a selected card creates plan items for that card.
- First-time user state is clearly empty or clearly demo.
- AI output cannot add duplicate bullets without consolidation.
- Non-English accidental tokens are filtered or corrected.

### Phase 0.9: Due Diligence Report Prototype

Goals:

- Add one explicit agent-powered workflow.
- Keep it user-triggered.
- Use citations.
- Save output to Journal and 30-day plan.

Feature:

- `Card Due Diligence Report`.

Acceptance criteria:

- User can enter card/version/listing URL.
- System returns sourced report.
- Report includes evidence quality.
- Report includes deterministic raw-vs-slab math when possible.
- Report can be saved as a journal entry.

### Phase 1.0: Persistent Decision Memory

Goals:

- Strengthen journal and review loops.
- Make personal calibration central.
- Add better watchlist/review surfaces.

Potential features:

- Decision timeline.
- Mistake pattern detection.
- Weekly review digest.
- Personal PSA10 optimism meter.
- Saved seller-question templates.

## 13. Open Questions

1. Should first-run include a true empty state or a clearly marked demo starter journal?
2. Which marketplace/source should be supported first for sourced due diligence?
3. Should external research be manual paste-first before automated search?
4. What is the minimum evidence required before TCGpal allows a `consider` recommendation?
5. Should TCGpal support Chinese/Japanese source summaries in Phase 1, or remain English-first?
6. Should the agent report be paywalled later, given that external research is the costly part?

## 14. Product Thesis

TCGpal should not try to beat generic AI search at answering arbitrary card questions.

TCGpal should win by owning the user's repeatable card decision process:

- Remember the user's thesis.
- Enforce cautious checks.
- Calculate grading economics.
- Track missing evidence.
- Create follow-up actions.
- Review outcomes.
- Calibrate future assumptions.

Agents are useful only when they bring external evidence into this system. The product moat is not the agent architecture. The moat is structured decision memory.
