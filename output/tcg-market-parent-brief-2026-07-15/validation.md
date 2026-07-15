# Validation receipt

Validated 2026-07-15.

- Community sample: 18 rows; every coded theme field is binary; the sample is explicitly purposive and non-representative.
- Derived counts: affordability/macro 13, speculation/FOMO 13, scarcity/scalping 9, exit liquidity 6, supply/reprints 5, nostalgia/IP 4, play/community 2, grading 1.
- Fee scenario: a $100 acquisition requires a $115.73 sale with no seller-paid shipping, $121.50 with $5 shipping, and $127.26 with $10 shipping under the stated 13.25% + $0.40 fee assumption.
- Evidence snapshot: `report-data.sql` executes successfully in SQLite and returns the expected validation row.
- Portable artifact: schema validation and packaging passed; 24 ordered manifest blocks, 3 chart datasets, and 4 metric cards.
- PDF: 8 letter-size pages, unencrypted, with English and Traditional Chinese rendered via an explicit local CJK print font.
- Visual QA: all 8 rendered pages were inspected at print resolution; no clipped prose, overlapping content, blank pages, missing Chinese glyphs, or truncated structured sections remained.
- Reference QA: the final page contains direct links to eight primary/institutional sources and six representative community discussions; the complete 18-post coding sheet accompanies the report.

Known tooling note: the portable package's bundled browser verifier timed out during its static-chart pass with the installed full Chrome binary, so verification used the package's structural checks plus direct headless-Chrome HTML/PDF rendering and page-by-page visual inspection.
