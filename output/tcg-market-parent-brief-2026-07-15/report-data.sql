-- Reviewed evidence snapshot for the TCG market parent brief.
-- Literal values preserve the exact data displayed in artifact.json.
-- Underlying primary/community URLs and limitations are documented in source-notes.md.

CREATE TABLE japan_market (market_billion_yen REAL, growth REAL);
INSERT INTO japan_market VALUES (319.7, 0.117);

CREATE TABLE pokemon_us (sales_billion_usd REAL, growth REAL);
INSERT INTO pokemon_us VALUES (2.5, 0.87);

CREATE TABLE magic_revenue (revenue_billion_usd REAL, growth REAL);
INSERT INTO magic_revenue VALUES (1.7201, 0.59);

CREATE TABLE china_events (latest_attendees INTEGER, baseline_attendees INTEGER);
INSERT INTO china_events VALUES (25000, 6000);

CREATE TABLE adult_buying (cohort TEXT, purchase_rate REAL);
INSERT INTO adult_buying VALUES
  ('Men 30s', 0.284),
  ('Men 20s', 0.282),
  ('Women 20s', 0.212),
  ('All adults', 0.085);

CREATE TABLE community_themes (theme TEXT, posts INTEGER, share REAL);
INSERT INTO community_themes VALUES
  ('Affordability / macro', 13, 13.0 / 18.0),
  ('Speculation / FOMO', 13, 13.0 / 18.0),
  ('Scarcity / scalping', 9, 9.0 / 18.0),
  ('Exit liquidity', 6, 6.0 / 18.0),
  ('Supply / reprints', 5, 5.0 / 18.0),
  ('Nostalgia / IP', 4, 4.0 / 18.0),
  ('Play / community', 2, 2.0 / 18.0),
  ('Grading', 1, 1.0 / 18.0);

CREATE TABLE break_even (shipping_label TEXT, required_sale_price REAL, required_appreciation REAL);
INSERT INTO break_even VALUES
  ('$0', 115.73, 0.157),
  ('$5', 121.50, 0.215),
  ('$10', 127.26, 0.273);

CREATE TABLE durable_vs_cyclical (layer TEXT, evidence TEXT, why_it_can_last TEXT, reversal_risk TEXT);
INSERT INTO durable_vs_cyclical VALUES
  ('Fandom and play', 'Adult buying, organized play, family use, global IP reach', 'Provides consumption value even without resale gains', 'Audience fatigue, weaker new-player conversion'),
  ('Publisher growth', 'Japan TCG growth; Pokémon retail growth; Magic revenue growth', 'Localization, new products, broader distribution', 'Overproduction, product overload, weaker content'),
  ('Market infrastructure', 'Large marketplaces, reference prices, grading capacity', 'Reduces search and trust friction', 'Fees, counterfeit risk, low-value grading oversupply'),
  ('Scarcity premium', 'Stockouts, limited promos, chase variants', 'True rarity plus durable character demand', 'Reprints, restocks, substitutes, allocation changes'),
  ('Speculative reflexivity', 'Tracker attention, buyouts, FOMO, resale narratives', 'Can persist while new buyers and liquidity expand', 'No next buyer, macro shock, attention rotation');

CREATE TABLE us_asia (dimension TEXT, us TEXT, asia TEXT, implication TEXT);
INSERT INTO us_asia VALUES
  ('Reference-price method', 'U.S.: TCGplayer aggregates recent completed sales and handles outliers. Asia: observers often compare shop asks, buy lists, or last-trade snapshots.', 'Observers often compare shop asks, buy lists, or last-trade snapshots', 'U.S. series can look mechanically smoother'),
  ('Market pooling', 'U.S.: large English-language buyer pool and national shipping. Asia: demand is split by country, language, shop, and platform.', 'Demand is split by country, language, shop, and platform', 'Thin local items move more on one transaction'),
  ('Release and allocation', 'U.S.: later/localized releases can absorb prior information. Asia: Japan often price-discovers products first and promos may be highly local.', 'Japan often price-discovers new products first; promos may be highly local', 'Fresh-release spikes appear first and more sharply in Asia'),
  ('Currency', 'U.S.: a domestic buyer sees no currency conversion. Asia: a cross-border buyer sees card price plus JPY/TWD/USD movement.', 'Cross-border buyer sees card price plus JPY/TWD/USD movement', 'Converted prices add volatility unrelated to the card'),
  ('Condition and trust', 'U.S.: standardized marketplace fields and high-value authentication. Asia: strong local norms exist, but labels may not map cleanly across platforms.', 'Strong local norms exist, but cross-platform labels may not map cleanly', 'Apparent price gaps can be evidence/condition gaps');

CREATE TABLE scenario_matrix (scenario TEXT, market_effect TEXT, who_benefits TEXT, warning_signal TEXT);
INSERT INTO scenario_matrix VALUES
  ('Category grows; supply normalizes', 'More players and revenue, but many modern singles stay flat or fall', 'Publishers, stores, tools, players', 'Print volume outpaces new active buyers'),
  ('True scarcity persists', 'Iconic, hard-to-substitute cards retain premiums', 'Owners of genuinely scarce, liquid items', 'Prices separate from completed-sale depth'),
  ('Reprint / restock wave', 'Access improves; scarcity premiums compress', 'Players and late buyers', 'Official production and restock notices'),
  ('Macro or attention reversal', 'Volumes fall first; asking prices can look sticky', 'Cash buyers with patience', 'Longer sale times, wider bid-ask gaps, forced sellers');

CREATE TABLE funding_stages (stage TEXT, share TEXT, work TEXT, release_gate TEXT);
INSERT INTO funding_stages VALUES
  ('1 — Correctness corpus · 25%', '25%', '30 real listing comparisons and expert review', '≥90% expert agreement; zero known invariant violations'),
  ('2 — Ten-buyer pilot · 35%', '35%', 'Recruit 10 raw-single buyers; observe card-first decisions', '8/10 complete within 60 seconds; ≥9 comparisons change next action'),
  ('3 — Repeat and trust · 25%', '25%', 'Fix failures; test return use and receipt sharing', 'Identity corrections <10%; ≥4/10 return; ≥3 share a receipt'),
  ('Contingency only · 15%', '15%', 'Unexpected provider, data, or usability fixes', 'Use only with written reason; otherwise return to family reserve');

CREATE TABLE tcglens_ideas (priority TEXT, idea TEXT, buyer_value TEXT, allowed_inputs TEXT, guardrail TEXT);
INSERT INTO tcglens_ideas VALUES
  ('Now', 'Now · Market-confidence strip', 'Explains whether the recommendation rests on fresh, comparable evidence', 'Reference freshness, comparable listing count, price dispersion, missing costs', 'Confidence in evidence—not a price forecast or grade prediction'),
  ('Now', 'Now · Supply-context receipt', 'Shows thin supply, unique sellers, excluded novelties, and source failures', 'Existing eBay fan-out and deterministic exclusions', 'No sold-liquidity claim without licensed completed-sale data'),
  ('After pilot', 'After pilot · Gross-to-net resale friction calculator', 'Makes fees, shipping, tax, FX, and break-even visible', 'User-entered scenario plus official fee schedules', 'Scenario only; no return prediction or investment recommendation'),
  ('After pilot', 'After pilot · Regional reference ledger', 'Separates U.S., Japan, Taiwan, and language-edition observations', 'Aggregate references, manual links, user-supplied facts', 'Manual pages remain unfetched and never become ranked inventory'),
  ('Later', 'Later · Hype-risk explanation', 'Warns when price evidence is thin, dispersed, stale, or supply-sensitive', 'Measured evidence quality and official reprint notices', 'Reddit/X mood never changes deterministic ranking');

SELECT 'validated' AS status,
       (SELECT COUNT(*) FROM community_themes) AS community_theme_rows,
       (SELECT COUNT(*) FROM tcglens_ideas) AS product_idea_rows;
