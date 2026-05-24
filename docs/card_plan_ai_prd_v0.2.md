# CardPlan AI PRD v0.2

## 0. Project Summary

**Product name:** CardPlan AI  
**Positioning:** An AI planning layer for TCG collectors and small sellers.  
**Core users:** TCG collectors, beginner investors, small-scale sellers, and hobbyists who want to buy, sell, grade, or organize cards more thoughtfully.  
**Core problem:** Existing TCG tools are strong at price lookup, marketplace transactions, portfolio valuation, and trend charts, but many users still struggle with what to do next: whether to buy raw or slab, how to avoid listing risks, how to allocate budget, when to sell, and how to remember why they made a purchase.

CardPlan AI does not try to replace TCGplayer, 集换社, PriceCharting, Collectr, or marketplace tools. It sits above them as a decision-support and planning layer.

**One-sentence value proposition:**  
CardPlan AI turns scattered card data, user goals, risk preferences, and marketplace screenshots into structured buy/sell plans, listing-risk checks, raw-vs-slab explanations, and decision journals.

---

## 1. Product Philosophy

CardPlan AI should avoid becoming an AI “pump” or “buy signal” tool. The product should feel like a careful hobby assistant, not a financial advisor, not a hype account, and not a trading bot.

### 1.1 What the product should do

- Help users organize their thinking before buying or selling.
- Translate price data into action conditions.
- Explain trade-offs instead of giving overconfident predictions.
- Help users understand version, condition, fee, liquidity, and holding-period risk.
- Encourage users to record the reasoning behind their card decisions.
- Support both collection enjoyment and small-scale resale workflows.

### 1.2 What the product should not do

- Promise profit.
- Say a card will definitely rise.
- Replace professional grading companies.
- Automatically tell users to buy a listing without showing assumptions.
- Hide uncertainty.
- Rank recommendations only by affiliate revenue.
- Encourage users to over-concentrate into high-risk cards.

### 1.3 Product tone

The product should sound helpful, grounded, and cautious:

- “This may be worth watching if your goal is long-term collection.”
- “The current input is missing sold-price data, so confidence is limited.”
- “This listing may be fine for personal collection, but it is not ideal for grading speculation.”
- “Your plan is too concentrated in one high-price card. Consider keeping cash available.”

Avoid:

- “Buy now.”
- “Guaranteed profit.”
- “This card will moon.”
- “PSA10 likely” without strong photo evidence.

---

## 2. Target Users

## 2.1 Primary Persona A: Collection-Investment Hybrid User

### Profile

A collector who likes specific IPs, characters, artists, or sets, but also cares about not overpaying and preserving resale value.

### Example

- Likes One Piece and Pokémon.
- Interested in Chopper, Nami, Law, Charizard, Pikachu, Eevee, 151, manga rares, promos.
- Budget: $100–$500 per month.
- May sell duplicates or rotate cards occasionally.

### Main Jobs-to-be-Done

- “Help me choose which version fits my budget and goal.”
- “Help me avoid buying a card that is overpriced or hard to resell.”
- “Help me decide whether I should buy raw, PSA9, PSA10, or sealed.”
- “Help me build a collecting path around a character.”

### Pain Points

- Hard to compare versions.
- Hard to know whether PSA10 premium is justified.
- Hard to distinguish collecting value from hype.
- Hard to avoid impulse purchases.

---

## 2.2 Primary Persona B: Small-Scale TCG Seller

### Profile

A hobbyist who sells cards on eBay, Mercari, Shopee, card shops, Discord, Facebook groups, or local communities.

### Example

- Has 50–300 cards in inventory.
- Buys raw cards, grades some, sells some.
- Needs to track cost, profit, shipping, platform fee, and holding time.

### Main Jobs-to-be-Done

- “Help me know which cards to sell first.”
- “Help me avoid sending bad raw cards for grading.”
- “Help me create safer listing descriptions.”
- “Help me package low-value cards into bundles.”
- “Help me keep a record for profit tracking.”

### Pain Points

- Profit gets eaten by fees and shipping.
- Inventory becomes messy.
- Low-value cards are not worth selling one by one.
- Hard to know whether to hold, sell, grade, or bundle.

---

## 2.3 Secondary Persona C: New TCG Buyer

### Profile

A beginner who likes the IP but does not understand terminology, versions, rarity, grading, or pricing.

### Main Jobs-to-be-Done

- “Help me understand what I am looking at.”
- “Help me avoid buying fake, wrong-version, or misleading listings.”
- “Help me build a beginner-friendly collecting plan.”

### Pain Points

- Confused by raw/slab/sealed.
- Does not understand For Asia, Japanese domestic, English, reprint, promo, manga rare, alt art.
- Trusts seller titles too easily.

---

## 3. Competitive Differentiation

## 3.1 Existing Tool Categories

### Price / marketplace tools

Examples: TCGplayer, 集换社, eBay, Cardmarket, Mercari, Yahoo Auctions.

Strength:

- Transaction and price discovery.
- Marketplace liquidity.
- Listings and seller data.

Gap:

- They show what something costs, but not always how that card fits a specific user’s plan.

### Portfolio trackers

Examples: Collectr, PriceCharting, spreadsheets.

Strength:

- Track collection value.
- Show raw, graded, sealed estimates.
- Record ownership.

Gap:

- They often focus on what users own, less on why users should take a specific action.

### Content/community tools

Examples: YouTube, Reddit, Discord, X, 小红书, Bilibili.

Strength:

- Market narratives, hype, community opinions.

Gap:

- Information is scattered and often biased.

---

## 3.2 CardPlan AI Differentiation

### Difference 1: From price tracking to decision planning

Competitors answer:

> “What is this card worth?”

CardPlan AI answers:

> “Given my budget, risk preference, collection goal, and holding period, what should I do with this card?”

### Difference 2: From card-centric to user-centric

Competitors usually start with a card search.

CardPlan AI starts with:

- User goal
- Budget
- Risk preference
- Time horizon
- Willingness to grade
- Market access
- Current inventory

### Difference 3: From recommendations to conditional plans

CardPlan AI should not say “buy this card.” It should say:

- Consider only if price is below X.
- Avoid if the version is unclear.
- Use raw only if photos confirm surface and corners.
- Sell if net profit exceeds X and liquidity remains healthy.
- Recheck if reprint or promo re-release news appears.

### Difference 4: From ownership record to decision journal

Most tools record the card after the user buys it.

CardPlan AI records the reasoning before and after the purchase:

- Why am I considering this card?
- What evidence do I have?
- What would make me not buy it?
- When should I review the decision?
- Did the actual outcome match my original thesis?

### Difference 5: From portfolio value to portfolio health

Instead of only showing total collection value, CardPlan AI can identify:

- IP concentration
- Character concentration
- Raw/slab/sealed mix
- Low-liquidity exposure
- Average holding period
- Overexposure to speculative grading plays

---

## 4. MVP Scope

The MVP should focus on four AI-powered features:

1. Plan Generator
2. Listing Risk Checker
3. Raw vs Slab Explainer
4. Decision Journal

Supporting features:

- Basic onboarding
- Card candidate input
- Watchlist
- Basic inventory
- Calculation engine
- Exportable output

---

# 5. Feature 1: Plan Generator

## 5.1 Feature Summary

The Plan Generator helps users create structured buy/sell plans based on their goals, budget, risk preference, candidate cards, and holding period.

It should generate multiple plans instead of one definitive recommendation.

## 5.2 User Story

As a TCG collector who wants to buy Chopper cards with a $300 budget, I want CardPlan AI to generate conservative, balanced, and aggressive plans, so I can choose a strategy that matches my risk tolerance.

## 5.3 Inputs

### Required inputs

- IP: Pokémon / One Piece / Yu-Gi-Oh / Sports Cards / Other
- Goal: Collection / Collection + resale / Grading play / Small seller inventory / Set completion
- Budget
- Risk level: Low / Medium / High
- Holding period: Short-term / 3–6 months / 1 year+ / Long-term collection
- Candidate cards or theme

### Optional inputs

- Current inventory
- Preferred market
- Willingness to grade
- Favorite characters
- Language preference
- Existing card links or screenshots
- User notes

## 5.4 Outputs

The system generates 3 plan types:

### Conservative Plan

Focus:

- Lower risk
- More liquidity
- Smaller position size
- Less grading speculation

Example output:

> Conservative plan: Use 50–60% of the budget on cards with stable character demand and clear versions. Avoid concentrating the entire budget into one manga rare. Keep 20–30% cash for better entry opportunities. Prioritize PSA10 only when the slab premium is not excessive.

### Balanced Plan

Focus:

- Mix of collection value and resale potential
- Some raw/slab comparison
- Moderate concentration

Example output:

> Balanced plan: Allocate around 40% to one representative Chopper card, 30% to lower-cost promos or early cards, 20% to opportunistic raw cards, and 10% cash buffer. Use the Raw vs Slab tool before buying any raw card above $50.

### Aggressive Plan

Focus:

- High upside, high volatility
- Higher concentration
- Possible grading speculation

Example output:

> Aggressive plan: Concentrate on one high-demand chase version only if the entry price is below recent sold comps and the version is clear. This plan has higher downside because liquidity may be thin and the budget is concentrated.

## 5.5 Plan Generator Example

### User input

- IP: One Piece
- Theme: Tony Tony Chopper
- Budget: $300
- Goal: Collection + resale
- Risk: Medium
- Holding period: 6 months
- Willing to grade: Maybe
- Main market: eBay

### Generated plan summary

**Plan A: Conservative collector plan**

- $120–150: one recognizable Chopper card in PSA10 or clean raw condition
- $50–80: lower-cost promo or early card
- $40–60: sealed/event product if available at reasonable price
- $50 cash reserve

Buy conditions:

- Version must be clear.
- Do not buy raw if seller does not show front/back closeups.
- Do not pay more than recent sold comps.

Sell conditions:

- If net profit reaches 25–30%, consider partial exit.
- If no recent sold comps appear for 60 days, do not add more.

Risks:

- Chopper is popular but not always as liquid as top chase characters.
- Low-end cards may be hard to sell individually.

---

# 6. Feature 2: Listing Risk Checker

## 6.1 Feature Summary

The Listing Risk Checker analyzes marketplace listings, screenshots, photos, and seller descriptions to identify risks before the user buys.

This is one of the strongest differentiators because users often lose money from unclear listings, wrong versions, poor photos, or overconfident condition claims.

## 6.2 User Story

As a buyer looking at an eBay listing, I want to upload the listing screenshot or paste the title and description, so CardPlan AI can tell me what is missing, what may be risky, and what I should ask the seller before buying.

## 6.3 Inputs

- Listing title
- Listing description
- Listed price
- Seller-provided condition
- Marketplace
- Uploaded images or screenshots
- User’s intended goal: self-collection / grading / resale

## 6.4 Risk Categories

### Version risk

- Unclear language or region
- For Asia vs Japanese domestic
- English vs Japanese
- Reprint vs original
- Promo source unclear
- Similar card names across different sets

### Condition risk

- No back photo
- No corner closeup
- No surface angle photo
- “Mint” claim without evidence
- Visible whitening or scratches
- Possible print line

### Pricing risk

- Price based on active listing instead of sold comps
- Price close to PSA10 while raw condition is unverified
- Low liquidity
- Large gap between raw and slab without enough evidence

### Seller / listing risk

- Stock photo only
- Blurry photos
- Inconsistent title and image
- No return policy, depending on platform norms
- Off-platform payment request
- Too-good-to-be-true price

## 6.5 Outputs

The output should include:

1. Risk score: Low / Medium / High
2. Confidence level: Low / Medium / High
3. Missing information
4. Key risks
5. Questions to ask the seller
6. Suitability for user goal
7. Final cautious summary

## 6.6 Listing Risk Checker Example

### User input

Title:

> Tony Tony Chopper EB01 Alt Art Japanese One Piece Mint

Description:

> Great condition, looks PSA10. No returns.

Images:

- Front photo only
- No back photo
- No closeup

User goal:

- Buy raw and grade

### Output

Risk score: High  
Confidence: Medium-low because only front image is available.

Key risks:

- Seller claims “looks PSA10,” but there is no back photo, no corner closeup, and no angled surface photo.
- The listing does not clearly confirm whether this is original EB01, PRB reprint, For Asia, or another variant.
- “No returns” increases buyer-side risk if condition is worse than expected.

Questions to ask seller:

- Can you provide clear front and back photos?
- Are there any scratches, dents, whitening, or print lines?
- Can you confirm the exact card number and version?
- Is this the original release or a reprint version?

Suggested action:

- Not suitable for grading speculation yet.
- May be acceptable only for personal collection if the price is discounted and the user is comfortable with condition uncertainty.

---

# 7. Feature 3: Raw vs Slab Explainer

## 7.1 Feature Summary

The Raw vs Slab Explainer combines numeric calculation and AI explanation to help users decide between buying raw, buying PSA9, buying PSA10, or avoiding the card.

This feature should not only calculate expected value but also explain assumptions and uncertainty.

## 7.2 User Story

As a buyer, I want to know whether a raw card is worth buying and grading compared with directly buying PSA10, so I can avoid overpaying for raw cards that only make sense if they grade perfectly.

## 7.3 Inputs

- Raw buy price
- PSA10 sold price
- PSA9 sold price
- PSA8 or lower estimate, optional
- Grading fee
- Shipping and insurance
- Platform fee
- Estimated probability of PSA10
- Estimated probability of PSA9
- User goal
- Holding period

## 7.4 Calculations

### Net sale value

Net sale value = sold price × (1 - marketplace fee) - shipping cost

### Expected value

Expected value = P(PSA10) × PSA10 net value + P(PSA9) × PSA9 net value + P(other) × other net value - raw cost - grading cost

### Break-even PSA10 probability

Minimum PSA10 probability required for expected value to become non-negative.

## 7.5 Outputs

- Expected profit / loss
- Worst-case outcome
- Break-even PSA10 probability
- Suggested route:
  - Buy raw only if condition is verified
  - Direct PSA10 is cleaner
  - PSA9 may be better value
  - Good for self-collection, not grading
  - Avoid at current price
- Explanation of assumptions

## 7.6 Example

### Input

- Raw price: $80
- PSA10 price: $220
- PSA9 price: $95
- Grading + shipping: $35
- Marketplace fee: 13%
- Shipping cost after sale: $5
- User estimates PSA10 probability: 50%
- User estimates PSA9 probability: 40%
- Other: 10%

### Output

Summary:

> This raw card is only attractive if you have strong confidence in PSA10 potential. At the current input, the expected value is sensitive to grading outcome. If it returns PSA9, the trade may barely break even or lose money after fees.

Recommendation:

> Consider raw only if the seller provides clear front/back, corner, and surface-angle photos. If PSA10 is available near $200–220 and you mainly want collection certainty, buying PSA10 may be simpler and lower risk.

---

# 8. Feature 4: Decision Journal

## 8.1 Feature Summary

The Decision Journal records why a user considered, bought, sold, graded, or skipped a card. It creates a feedback loop for learning and reducing impulsive purchases.

This feature is especially valuable for PM portfolio storytelling because it changes user behavior rather than only displaying data.

## 8.2 User Story

As a collector, I want to record why I bought or skipped a card, so I can review my decisions later and improve my buying discipline.

## 8.3 Journal Entry Types

- Considering purchase
- Bought
- Skipped
- Sent for grading
- Listed for sale
- Sold
- Holding
- Re-evaluation

## 8.4 Fields

- Card name
- Version
- Date
- Action type
- Price considered or paid
- User goal
- Original thesis
- Buy condition
- Sell condition
- Stop condition
- Risks noted
- Missing information
- Review date
- Final outcome
- Lessons learned

## 8.5 Example Journal Entry

Card:

> Tony Tony Chopper EB01-006 AA Japanese

Action:

> Considering purchase

Original thesis:

> I like Chopper and want one representative card that can stay in my collection but still have decent resale demand.

Buy condition:

> Only buy if raw price is below $80 and seller provides clean front/back photos.

Stop condition:

> Do not buy if version is unclear or if PSA10 premium is too small compared with raw + grading cost.

Sell condition:

> If net profit exceeds 30% or if I need to rotate budget into a higher-priority card.

Review date:

> 30 days later

AI reflection:

> This is a balanced thesis, but the plan depends heavily on version clarity and condition. Avoid treating this as a guaranteed grading play.

---

# 9. User Flows

## 9.1 Flow A: First-time user creates a plan

1. User lands on homepage.
2. User clicks “Create my first card plan.”
3. User completes onboarding:
   - IP
   - budget
   - goal
   - risk
   - holding period
4. User enters theme or candidate cards.
5. System generates conservative, balanced, and aggressive plans.
6. User saves one plan to dashboard.
7. System asks user to create a Decision Journal entry for the top candidate card.

## 9.2 Flow B: User checks a risky listing

1. User pastes marketplace title or uploads screenshot.
2. User selects goal: self-collection / grading / resale.
3. Listing Risk Checker analyzes text and image.
4. System outputs risk score, missing info, seller questions, and suitability.
5. User saves listing to Watchlist or creates Journal entry.

## 9.3 Flow C: User compares raw vs slab

1. User opens Raw vs Slab Explainer.
2. User enters raw price, PSA10 price, PSA9 price, grading cost, fee.
3. System calculates expected value and break-even PSA10 probability.
4. AI explains which assumption matters most.
5. User saves calculation to the card profile.

## 9.4 Flow D: User reviews past decisions

1. User opens Decision Journal.
2. User filters entries by Bought, Skipped, Sold, Sent for Grading.
3. System summarizes patterns:
   - “You often consider raw cards without back photos.”
   - “Your skipped decisions avoided high version uncertainty.”
   - “Your best outcomes came from cards with clear sold comps.”
4. User updates personal rules.

---

# 10. Information Architecture

## 10.1 Main Navigation

- Dashboard
- Plan Generator
- Listing Risk Checker
- Raw vs Slab
- Watchlist
- Decision Journal
- Inventory
- Settings

## 10.2 Dashboard Components

- Active plan
- Cards under review
- Recent risk checks
- Upcoming review dates
- Portfolio health snapshot
- Recent journal entries

## 10.3 Plan Generator Page

Sections:

- User goal selector
- Budget input
- Risk selector
- Candidate cards
- Generate plan button
- Plan comparison table
- Save plan

## 10.4 Listing Risk Checker Page

Sections:

- Paste title / description
- Upload images
- User goal selector
- Analyze button
- Risk report
- Seller questions
- Save to Watchlist / Journal

## 10.5 Raw vs Slab Page

Sections:

- Price inputs
- Grading assumptions
- Fee settings
- Calculation result
- AI explanation
- Save calculation

## 10.6 Decision Journal Page

Sections:

- Timeline view
- Card filter
- Action filter
- Review reminders
- AI reflection summary

---

# 11. Technical Architecture

## 11.1 Recommended MVP Stack

Frontend:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod for schema validation

Backend:

- Next.js route handlers or server actions
- Supabase Postgres
- Supabase Auth
- Supabase Storage for uploaded images
- Prisma or Drizzle ORM

AI layer:

- LLM API for reasoning and report generation
- Vision-capable model for listing screenshots and card photos
- Embeddings for memory / retrieval later
- Structured output with Zod schemas

Payments later:

- Stripe Billing

Deployment:

- Vercel for MVP
- Supabase hosted project

---

## 11.2 Architecture Diagram

User Interface

→ Next.js App Router

→ API / Server Actions

→ Core Services:

- Plan Service
- Listing Risk Service
- Raw vs Slab Calculation Service
- Journal Service
- Inventory Service
- User Profile Service

→ Data Layer:

- Supabase Postgres
- Supabase Storage
- Optional vector store

→ AI Orchestration Layer:

- Planner Agent
- Listing Risk Agent
- Condition/Version Agent
- Calculation Explainer Agent
- Journal Reflection Agent
- Critic / Safety Agent

→ External Sources Later:

- eBay links / sold comps input
- TCGplayer manual references or API if available
- PriceCharting manual input or future integration
- PSA pop report manual input or future integration

---

# 12. Multi-Agent Design

The product can use a multi-agent structure internally, even if the MVP UI looks simple.

## 12.1 Agent 1: User Context Agent

Purpose:

- Understand user profile, risk tolerance, budget, and goal.
- Convert onboarding answers into a structured user profile.

Inputs:

- User questionnaire
- Past journal entries
- Watchlist
- Inventory summary

Outputs:

- User type
- Risk constraints
- Preferred recommendation style
- Budget guardrails

Example output:

```json
{
  "user_type": "collection_resale_hybrid",
  "risk_level": "medium",
  "budget_guardrail": "single_card_max_50_percent",
  "grading_preference": "maybe",
  "preferred_market": "eBay"
}
```

---

## 12.2 Agent 2: Card & Version Agent

Purpose:

- Identify card information and possible version ambiguity.
- Flag if the card may be confused with another version.

Inputs:

- Card title
- Card number
- Uploaded image
- User notes

Outputs:

- Version candidates
- Confidence score
- Missing information
- Version risk

Example output:

```json
{
  "card_candidates": [
    {
      "name": "Tony Tony Chopper",
      "set": "EB01",
      "version": "Alternate Art",
      "confidence": 0.72
    }
  ],
  "version_risk": "medium",
  "missing_info": ["back photo", "full card number", "release version"]
}
```

---

## 12.3 Agent 3: Listing Risk Agent

Purpose:

- Analyze listing text and images.
- Identify condition, version, pricing, and seller-risk issues.

Inputs:

- Listing title
- Listing description
- Listing images
- User goal
- Version Agent output

Outputs:

- Risk score
- Key risks
- Missing info
- Seller questions
- Suitability by goal

---

## 12.4 Agent 4: Calculation Agent

Purpose:

- Perform deterministic math for raw vs slab decisions.
- This should not be left to the LLM.

Inputs:

- Raw price
- PSA10 price
- PSA9 price
- Grading cost
- Fee rate
- Shipping cost
- Probability estimates

Outputs:

- Expected profit
- Break-even probability
- Worst-case result
- Sensitivity analysis

Important rule:

All financial calculations must be deterministic code, not model-generated arithmetic.

---

## 12.5 Agent 5: Plan Generator Agent

Purpose:

- Generate conservative, balanced, and aggressive plans using structured user profile, card data, and calculation results.

Inputs:

- User Context Agent output
- Candidate cards
- Listing Risk Agent output
- Calculation Agent output
- Inventory summary

Outputs:

- Three plans
- Buy conditions
- Do-not-buy conditions
- Sell conditions
- Risk notes
- Next actions

---

## 12.6 Agent 6: Journal Reflection Agent

Purpose:

- Help user write and later review decision journals.
- Identify repeated patterns in user behavior.

Inputs:

- Journal entries
- Outcome data
- Watchlist history
- Inventory history

Outputs:

- Reflection summary
- Behavioral patterns
- Suggested personal rules

Example:

> You considered 7 raw cards this month. 5 had incomplete back photos. Consider adding a rule: no raw card above $50 without front/back and corner closeups.

---

## 12.7 Agent 7: Critic / Safety Agent

Purpose:

- Review outputs for overconfidence, unsupported profit claims, and missing disclaimers.
- Ensure the product avoids financial-advice style language.

Checks:

- Does the output promise profit?
- Does it say “guaranteed” or “must buy”?
- Does it hide uncertainty?
- Are assumptions shown?
- Are missing data points listed?
- Is the user’s risk preference respected?

---

# 13. Skills Design

If using a Skills-style system, define reusable skill folders. Each skill should have a clear purpose, input schema, output schema, examples, and constraints.

## 13.1 Skill: card_version_check

Purpose:

- Identify possible card version and flag ambiguity.

Inputs:

- title
- description
- image URLs
- known IP
- known card number

Outputs:

- likely card identity
- version candidates
- confidence
- missing evidence
- version risk

Rules:

- Never claim 100% certainty from incomplete photos.
- Always list what evidence is missing.

---

## 13.2 Skill: listing_risk_check

Purpose:

- Analyze a marketplace listing for buyer risk.

Inputs:

- listing text
- images
- price
- user goal

Outputs:

- risk score
- risk categories
- seller questions
- suggested action

Rules:

- Do not accuse seller of fraud without strong evidence.
- Use “risk indicators” instead of definitive claims.

---

## 13.3 Skill: raw_vs_slab_analysis

Purpose:

- Explain deterministic raw-vs-slab calculation results.

Inputs:

- calculation result JSON
- user profile

Outputs:

- plain-English explanation
- assumptions
- sensitivity notes
- suggested route

Rules:

- Do not perform arithmetic inside the LLM if deterministic results are available.
- Explain, do not recalculate loosely.

---

## 13.4 Skill: buy_sell_plan_generation

Purpose:

- Generate structured plans.

Inputs:

- user profile
- candidate card summaries
- risk reports
- calculation results
- budget

Outputs:

- conservative plan
- balanced plan
- aggressive plan
- action list

Rules:

- Always include buy conditions, do-not-buy conditions, sell conditions, and risks.
- Avoid single-card all-in suggestions unless user explicitly requests and risk is clearly warned.

---

## 13.5 Skill: decision_journal_reflection

Purpose:

- Generate and review journal entries.

Inputs:

- user action
- card data
- original thesis
- outcome data

Outputs:

- journal entry
- review prompt
- lessons learned

Rules:

- Do not shame the user.
- Focus on learning and process improvement.

---

# 14. Harness / Evaluation Design

A good harness is important because this product’s value depends on consistent, safe, explainable outputs.

## 14.1 Why a harness matters

LLM outputs may be:

- Too confident
- Too vague
- Too financial-advice-like
- Bad at math
- Inconsistent across similar cases
- Missing key risk categories

The harness should test whether outputs follow product rules.

## 14.2 Evaluation Dataset

Create a test set of 50–100 scenarios.

Scenario categories:

1. Clear low-risk listing
2. Missing back photo
3. Ambiguous version
4. Overpriced raw card
5. PSA10 premium too high
6. Good self-collection but bad grading play
7. Low liquidity card
8. Beginner with high-risk budget concentration
9. Seller inventory cleanup
10. User wants aggressive speculation

## 14.3 Example Test Case

Input:

- User goal: grading speculation
- Raw price: $120
- PSA10 price: $180
- PSA9 price: $90
- Grading cost: $35
- Listing has only front photo
- Seller says “possible PSA10”

Expected output traits:

- Risk score should be medium-high or high.
- Should mention missing back photo.
- Should not recommend raw grading play.
- Should mention PSA10 premium is likely too small.
- Should ask for front/back/corner/surface photos.
- Should not promise profit.

## 14.4 Automated Checks

### Schema checks

- Output must include risk score.
- Output must include confidence.
- Output must include missing information.
- Output must include suggested next action.

### Policy checks

Reject or flag output if it contains:

- “guaranteed profit”
- “must buy”
- “certainly PSA10”
- “risk-free”
- “will definitely increase”

### Calculation checks

- Expected value must match deterministic calculation.
- Break-even probability must be within tolerance.

### Consistency checks

Same scenario with different card names should produce similar risk logic.

### Rubric grading

Human or LLM judge can score:

- Risk awareness: 1–5
- Specificity: 1–5
- Usefulness: 1–5
- Overconfidence control: 1–5
- Actionability: 1–5

---

# 15. Hermes Concept

Hermes can be used as the project’s internal name for an orchestration and messaging layer. In Greek mythology, Hermes is a messenger, which fits the idea of routing tasks between agents and tools.

## 15.1 Hermes Responsibilities

Hermes should not be an LLM itself. It should be the coordinator.

Responsibilities:

- Receive user request.
- Classify task type.
- Route to correct skill or agent.
- Gather tool outputs.
- Enforce schemas.
- Call Critic / Safety Agent.
- Return final structured result.
- Save relevant records to database.

## 15.2 Hermes Routing Examples

### User says:

> “Should I buy this raw Chopper card?”

Hermes route:

1. User Context Agent
2. Card & Version Agent
3. Listing Risk Agent
4. Calculation Agent if prices are provided
5. Raw vs Slab Explainer
6. Critic Agent
7. Save to Watchlist / Journal if user chooses

### User says:

> “Make me a $300 plan for One Piece cards.”

Hermes route:

1. User Context Agent
2. Plan Generator Agent
3. Critic Agent
4. Save Plan

### User says:

> “Why did I buy this card last month?”

Hermes route:

1. Journal Retrieval
2. Journal Reflection Agent
3. Return original thesis and review notes

## 15.3 Hermes Pseudocode

```ts
type TaskType =
  | "PLAN_GENERATION"
  | "LISTING_RISK_CHECK"
  | "RAW_VS_SLAB"
  | "JOURNAL_CREATE"
  | "JOURNAL_REVIEW";

async function hermesRoute(input: UserRequest) {
  const taskType = await classifyTask(input);
  const userContext = await getUserContext(input.userId);

  switch (taskType) {
    case "PLAN_GENERATION": {
      const plan = await planGeneratorAgent({ input, userContext });
      return await criticAgent(plan);
    }

    case "LISTING_RISK_CHECK": {
      const version = await cardVersionAgent(input);
      const risk = await listingRiskAgent({ input, version, userContext });
      return await criticAgent(risk);
    }

    case "RAW_VS_SLAB": {
      const calc = rawVsSlabCalculator(input.prices);
      const explanation = await rawVsSlabExplainer({ calc, userContext });
      return await criticAgent(explanation);
    }

    case "JOURNAL_CREATE": {
      const entry = await journalAgent({ input, userContext });
      await saveJournalEntry(entry);
      return entry;
    }
  }
}
```

---

# 16. Data Model v0.2

## 16.1 users

- id
- email
- display_name
- created_at
- subscription_tier

## 16.2 user_profiles

- id
- user_id
- primary_goal
- risk_level
- monthly_budget
- holding_period
- grading_preference
- preferred_markets
- favorite_ips
- favorite_characters
- created_at
- updated_at

## 16.3 cards

- id
- user_id
- name
- ip
- card_number
- set_name
- language_region
- rarity
- version_note
- image_url
- created_at

## 16.4 listings

- id
- user_id
- card_id
- marketplace
- title
- description
- listing_url
- listing_price
- currency
- image_urls
- seller_condition
- created_at

## 16.5 listing_risk_reports

- id
- listing_id
- risk_score
- confidence
- version_risk
- condition_risk
- pricing_risk
- seller_risk
- missing_info_json
- seller_questions_json
- suggested_action
- report_json
- created_at

## 16.6 raw_vs_slab_calculations

- id
- user_id
- card_id
- raw_price
- psa10_price
- psa9_price
- other_price
- grading_cost
- marketplace_fee_rate
- shipping_cost
- psa10_probability
- psa9_probability
- expected_profit
- break_even_psa10_probability
- recommendation
- created_at

## 16.7 plans

- id
- user_id
- title
- goal
- budget
- risk_level
- holding_period
- conservative_plan_json
- balanced_plan_json
- aggressive_plan_json
- created_at

## 16.8 decision_journals

- id
- user_id
- card_id
- listing_id
- action_type
- thesis
- buy_condition
- sell_condition
- stop_condition
- risks
- missing_info
- price
- review_date
- outcome
- lesson
- created_at
- updated_at

## 16.9 watchlist_items

- id
- user_id
- card_id
- listing_id
- status
- target_buy_price
- target_sell_price
- reason
- review_date
- notes
- created_at

## 16.10 inventory_items

- id
- user_id
- card_id
- quantity
- purchase_price
- purchase_date
- purchase_platform
- condition
- grading_status
- grading_cost
- sale_price
- sale_date
- sale_platform
- platform_fee
- shipping_cost
- net_profit
- roi
- notes

---

# 17. API Design v0.1

## POST /api/onboarding/profile

Creates or updates user profile.

## POST /api/plan/generate

Input:

- userProfile
- budget
- goal
- candidates

Output:

- conservativePlan
- balancedPlan
- aggressivePlan

## POST /api/listing/analyze

Input:

- title
- description
- price
- images
- userGoal

Output:

- riskReport

## POST /api/raw-vs-slab/calculate

Input:

- rawPrice
- psa10Price
- psa9Price
- gradingCost
- feeRate
- shippingCost
- probabilities

Output:

- deterministic calculation
- AI explanation

## POST /api/journal/create

Creates journal entry.

## GET /api/journal

Fetches journal entries.

## POST /api/hermes/route

Optional unified endpoint for agent routing.

---

# 18. UI Examples

## 18.1 Homepage Hero

Headline:

> Stop guessing. Build a card plan.

Subheadline:

> CardPlan AI helps TCG collectors and small sellers turn card prices, listings, and goals into safer buy/sell plans.

CTA:

> Create My First Plan

Secondary CTA:

> Check a Listing Risk

---

## 18.2 Plan Generator Output Card

Title:

> Balanced Plan for One Piece Chopper Cards

Summary:

> This plan balances personal collection value with resale flexibility. It avoids putting the entire budget into one high-risk card and keeps cash available for better entry opportunities.

Sections:

- Budget split
- Top candidate cards
- Buy conditions
- Do-not-buy conditions
- Sell conditions
- Risks
- Next actions

---

## 18.3 Listing Risk Report Card

Title:

> Listing Risk Report

Risk score:

> Medium-High

Confidence:

> Medium-low due to missing back photo and unclear version.

Missing information:

- Back photo
- Corner closeups
- Exact card number
- Version confirmation

Suggested seller questions:

- Can you provide clear front and back photos?
- Are there any scratches, whitening, dents, or print lines?
- Is this the original release or a reprint?

---

# 19. Development Roadmap

## Phase 0: PM Portfolio Prototype

Goal:

- Build polished demo with mock data.
- Show product thinking and core flows.

Deliverables:

- Landing page
- Onboarding
- Plan Generator mock
- Listing Risk Checker mock
- Raw vs Slab Calculator working
- Decision Journal mock

## Phase 1: Functional MVP

Goal:

- Make the product usable by real users manually.

Deliverables:

- Auth
- Database
- Save plans
- Save risk reports
- Save journal entries
- Upload listing images
- Deterministic calculation engine

## Phase 2: AI + Multi-Agent System

Goal:

- Add real AI orchestration.

Deliverables:

- Hermes router
- Skill schemas
- Vision-based listing analysis
- Plan Generator Agent
- Critic Agent
- Harness tests

## Phase 3: Seller Tools

Goal:

- Support small-scale sellers.

Deliverables:

- Inventory CSV import
- Inventory cleanup assistant
- Bundle builder
- eBay listing writer
- Profit dashboard

## Phase 4: Data Integrations

Goal:

- Reduce manual input.

Deliverables:

- Marketplace link parsing
- User-provided sold comp capture
- Optional third-party APIs
- Price history if available

---

# 20. PM Portfolio Storyline

## Problem

TCG collectors and small sellers have access to prices, but not enough structured decision support. They often make purchases based on hype, incomplete listings, or unclear version/condition assumptions.

## Insight

The user does not only need to know what a card is worth. They need to know how that card fits their goal, budget, risk tolerance, holding period, and current inventory.

## Solution

CardPlan AI provides an AI planning layer with four core functions:

1. Generate buy/sell plans.
2. Analyze listing risks.
3. Explain raw-vs-slab decisions.
4. Record decision journals for review.

## Differentiation

Unlike price trackers, CardPlan AI turns market information into personal decision workflows.

## Success Metrics

- Percentage of users who complete onboarding
- Number of plans generated per user
- Number of risk checks saved
- Number of journal entries created
- Return usage after review reminders
- Reduction in incomplete purchases, measured by user self-report

---

# 21. First Build Recommendation

Start with a polished PM-demo MVP:

1. Landing page
2. Onboarding questionnaire
3. Raw vs Slab Calculator with real deterministic math
4. Plan Generator using mock candidate cards
5. Listing Risk Checker using pasted title/description first, image upload later
6. Decision Journal entry creation

Do not start with complex price scraping. The first version should prove that users want a planning layer, not another price chart.

---

# 22. Codex Kickoff Prompt

Use this prompt when starting development:

```text
Build CardPlan AI, an AI planning layer for TCG collectors and small sellers.

Tech stack:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- localStorage first, Supabase later

Build the first PM-demo MVP with these pages:
1. Landing page
2. Onboarding questionnaire
3. Dashboard
4. Plan Generator
5. Listing Risk Checker
6. Raw vs Slab Calculator
7. Decision Journal

Core requirements:
- Raw vs Slab Calculator must use deterministic TypeScript functions.
- Plan Generator can use mock data first.
- Listing Risk Checker should accept pasted title/description and output structured risk report mock logic.
- Decision Journal should save entries to localStorage.
- UI should look polished enough for a product manager portfolio.
- Do not implement payment or external data integrations yet.
```

---

## 23. Open Questions

1. Should the first target IP be One Piece, Pokémon, or multi-IP from day one?
2. Should the first version support Chinese and English, or English only?
3. Should uploaded images be stored in Supabase from v1, or should image upload wait until Phase 2?
4. Should the product feel more like a SaaS dashboard or a conversational AI assistant?
5. Should the first business model be subscription, paid templates, or portfolio-only demo?

Recommended answers for v0.2:

- Start with multi-IP structure but use One Piece and Pokémon examples.
- Build English UI with optional Chinese examples later.
- Delay persistent image storage until Phase 2.
- Use SaaS dashboard as main UI, with AI report cards inside.
- Treat monetization as portfolio strategy first, not immediate launch pressure.

