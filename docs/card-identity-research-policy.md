# Card identity research policy

## Purpose

TCGlens should investigate a card family when deterministic catalog evidence cannot safely distinguish prints, when a clearly matching listing repeatedly abstains, or when users report a wrong sibling, language, treatment, or search result. Research improves the evidence model; it never bypasses the runtime identity gate.

This policy applies to Pokémon, One Piece, and future games. It governs offline and human-in-the-loop research, not product-route fetching. Product routes retain the source boundaries in `AGENTS.md`.

## Source hierarchy

Source authority is claim-specific. A source that is strong for release history may be weak for seller terminology or product condition.

1. **Primary official sources:** publisher card lists, set checklists, product pages, tournament rules, promo announcements, correction notices, and official card images. Prefer these for collector number, card name, artwork, treatment, language, release channel, and distribution claims.
2. **Structured secondary sources:** Pokémon TCG API, TCGplayer/TCGCSV, eBay Catalog, and other established catalogs with stable product or card identifiers. Use them to cross-check identifiers, catalog naming, set membership, and commercial aliases; do not treat them as official release proof or seller inventory.
3. **Specialist secondary sources:** established card wikis, collector checklists, set guides, store articles, and tournament archives. Use them to reconstruct version history or terminology when official archives are incomplete, and record who published the claim.
4. **Community discovery sources:** Reddit, forums, public collector discussions, and user reports. Use them to discover aliases, visual differences, common mislistings, undocumented promos, and questions that stronger sources should answer. A popular post, comment count, or confident collector is not proof by itself.
5. **Marketplace examples:** listing titles and item specifics reveal seller vocabulary and failure modes. They may test a rule or supply a concrete counterexample, but price, seller reputation, or repeated copied titles cannot establish print identity.

Official sources win direct factual conflicts unless there is evidence that the official page is incomplete or corrected elsewhere. A runtime identity fact normally needs either one applicable primary official source, or two independent structured/specialist sources with no primary contradiction. Community evidence may corroborate that decision but must not be the final decisive source. Exceptions remain research-only until a reviewer documents why the normal threshold cannot be met.

## Investigation triggers

Open a scoped investigation when any of these occurs:

- multiple siblings share the same seller-facing class such as SP, Manga, Alternate Art, Winner, Anniversary, or Parallel;
- a release or treatment term appears to identify a print, but the current witness set still abstains;
- a listing that users can clearly identify repeatedly becomes an incorrect `Inspect First` lead;
- a sibling substitution, wrong-language acceptance, or wrong-name search result reaches confirmation or ranking;
- catalog IDs, product IDs, card numbers, images, or release names conflict across providers;
- a new promo, tournament, reprint, correction, or regional release is missing from reviewed metadata;
- community reports reveal a repeatable seller alias or mislisting pattern not represented in fixtures.

## Investigation steps

1. **Freeze the question.** Record the game, canonical card/print ID, collector number, sibling family, language, and the exact claim to prove or refute. Do not start with a proposed regex.
2. **Collect primary evidence.** Check applicable official card lists, images, product announcements, tournament documents, and correction notices. Save direct URLs and access dates.
3. **Cross-check structured catalogs.** Compare stable IDs, set names, treatments, release names, and product mappings. Record collisions and copied/shared mappings rather than resolving them by popularity.
4. **Search specialist and community sources.** Use targeted queries on card wikis, collector guides, forums, and Reddit to learn seller vocabulary, alternate names, visual distinctions, and known catalog errors. Follow useful claims back to their original source where possible.
5. **Build a claim table.** For every relevant claim, list supporting and refuting sources, source tier, publisher, URL, access date, and whether the source is independent or repeats another catalog.
6. **Resolve conflicts conservatively.** Prefer the most direct source for the claim. If credible sources still conflict or the sibling intersection is not unique, keep the runtime result `unknown` and state what evidence is missing.
7. **Adjudicate explicitly.** A human reviewer marks the claim `approved`, `rejected`, or `research-only` and explains the decision. Research scripts and generated ledgers never approve themselves.
8. **Promote through code review.** Add only the minimum reviewed seller-visible metadata, then add positive, sibling-negative, language, product-type, and unsafe-corpus tests. Re-run the relevant sibling matrix and holdout before publication.

## Evidence record

Each investigated claim should retain:

- game, canonical card ID, canonical print ID, collector number, and sibling-family scope;
- one atomic claim, such as “Heroines is a seller-visible release marker for this SP print”;
- source tier and kind, publisher/author, page title, direct URL, publication date when known, and access date;
- a short paraphrase of what the source supports or refutes; avoid copying long copyrighted passages;
- independence/provenance notes, including whether one catalog appears to mirror another;
- conflicts, unresolved questions, and the evidence that would change the decision;
- reviewer, decision date, status (`lead`, `corroborated`, `approved`, `rejected`, or `research-only`), and linked tests or runtime metadata change.

Do not store credentials, private-group content, deleted-post reconstructions, seller personal data, or scraped page archives in the repository.

## Promotion gate

Research may change runtime identity only when all of the following are true:

- the claim meets the source threshold and has no unresolved stronger-source conflict;
- the evidence uniquely distinguishes the intended sibling or deliberately records that it cannot;
- the runtime token is seller-visible rather than an internal `_pN/_rN` identifier;
- a human reviewer approved the exact claim and provenance;
- regression tests prove the intended print and reject siblings, unrelated cards, conflicting languages/treatments, slabs, lots, and custom products at the correct eligibility layer;
- generated ledgers remain disconnected from runtime imports until curated metadata is reviewed and committed.

If any gate fails, keep the finding in the research ledger and preserve abstention. The goal is fewer incorrect `Inspect First` decisions without trading them for incorrect recommendations.
