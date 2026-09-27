# Mainland Chinese copy refresh — 2026-09-27

## Scope

The founder asked for Chinese that sounds natural to Mainland card buyers and named POKECOLOR and 集换社 as reference sites. The [copy standard](zh-cn-copy-standard.md) records the pages actually read, access limitations, vocabulary decisions and maintenance rules.

Rewrote Chinese search, confirmation, recommendation, seller/photo explanations, empty states, source descriptions, sharing, receipts and the method page. Chinese Q&A prompts now specify the same vocabulary. One Piece display labels use 卡图 and 普通版 instead of 画面. Catalog identifiers, English release names, seller text, scoring, fetchers, amounts and English UI copy retain their existing meaning and behavior.

| Before | After |
|---|---|
| 认准你要的那张卡，挑出最值得买的一件。 | 收这张卡，先比比价。 |
| 搜索卡片 | 想收哪张卡？ |
| 就选这个版本 | 就这张 |
| 你的默认视角 / 换个视角看 | 默认推荐方式 / 你更看重 |
| 最划算 / 最便宜 / 最稳妥 / 证据最足 | 综合推荐 / 总价最低 / 稳妥优先 / 图文最全 |
| 决策凭证 / 证据清单 | 比价记录 / 商品明细 |
| 暂时没有能放心买的 | 这次还没找到合适的 |
| 基础画面 / SP 特别画面 | 普通版 / SP 特殊卡图 |

Unknown seller history stays unverified; incomplete charges never become zero; missing tax still reads 税前总价. The NM reference remains condition-blind. Mercari is labeled as the US site, avoiding the Japanese-site nickname. The price-floor explanation asks the buyer to check the item rather than suggesting counterfeit status from price alone.

## Verification

- Full product gate: lint, typecheck, tests and production build. Final counts are recorded in `PROGRESS.md`.
- Existing Chinese text assertions were updated; no new tests that merely duplicate strings. English dictionary was compared against the base and is identical.
- Browser: built-in Codex browser, 1440 × 1000 desktop and 390 × 844 mobile. Inspected English and Chinese landing/results, Chinese One Piece confirmation, and Chinese method page. Mobile document width stayed within the viewport (375 px document / 390 px viewport).
- Used the existing local comparison fixture proxy on a separate port. Screenshots clearly say `LOCAL QA · SYNTHETIC MARKETPLACE FACTS`. Marketplace rows are synthetic, not acquisition evidence. Catalog art uses existing allowed sources.
- Receipt copy and link behavior were verified in the existing receipt component tests. A durable shared receipt was not published during this copy review.
- React review: no changes to hooks, state, component boundaries or data fetching; accessible names and text-based interactions pass the existing UI suite.
- No search behavior changed, so the five-search manual smoke was not repeated. The hermetic sequential flow remains part of the full suite. No provider credential checks, paid runs, plugin validation or Graphify regeneration were needed for string-only edits.
- Work was isolated from the uncommitted `codex/search-examples` checkout. That work was not included in this release.

## Screenshots

- [English desktop](../output/chinese-copy/en-desktop.png)
- [Chinese desktop](../output/chinese-copy/zh-desktop.png)
- [Chinese mobile](../output/chinese-copy/zh-mobile.png)
- [English result](../output/chinese-copy/en-result-desktop.png)
- [Chinese result](../output/chinese-copy/zh-result-desktop.png)
- [Chinese mobile result](../output/chinese-copy/zh-result-mobile.png)
- [Chinese version confirmation](../output/chinese-copy/zh-identity-desktop.png)
- [Chinese method page](../output/chinese-copy/zh-method-desktop.png)
