# Do we need to build a backend on Vercel for login? (2026-08-14)

Short answer: **no — you already have one.** The question as asked has a false premise
worth clearing before deciding anything, and once it is cleared the real decision turns
out to be a product decision, not an infrastructure one.

Written per the Founder Decision Challenge in AGENTS.md: instinct separated from
mechanism, strongest case, objections, one recommendation with a falsifiable test.

---

## The premise: "build a backend on Vercel"

TCGlens is a Next.js 16 app deployed on Vercel, and it already runs server code there:

- `src/app/api/agent/*` — the public REST surface (listing-compare, card-identity,
  card-discovery, explain), all server-side route handlers.
- `src/app/api/comparison-snapshots/route.ts` — writes 30-day receipt snapshots.
- `src/lib/mcp/*` — the MCP endpoint.
- `src/lib/external/*` — the only place provider credentials are ever read; those calls
  are already server-only, which is why `EBAY_CLIENT_SECRET` never reaches a browser.

Every one of these is a serverless function on Vercel. There is no missing backend. A
login flow would be four or five more route handlers next to the ones already there.

So "do I need to build a backend" resolves to two much smaller questions:

1. **Where do user records live?** Vercel functions are stateless and their filesystem is
   ephemeral. Users need a durable store. Upstash Redis is already wired up
   (`src/lib/ops/redis.ts`) and would technically hold accounts, but Redis is the wrong
   shape for the thing you would actually want later — querying users by email, joining
   saved cards, exporting for analysis. That wants Postgres (Vercel Postgres, Neon, or
   Supabase), which is a provisioning step, not a build.
2. **Who verifies the password?** This is the part worth outsourcing. Sessions, password
   resets, email verification, OAuth providers, and rate-limited login attempts are a lot
   of security surface for a product that has not yet proven repeat use. A managed
   provider (Clerk, Auth0, Supabase Auth, or NextAuth/Auth.js with a Postgres adapter)
   gives you all of it behind a route handler you already know how to write.

**Estimated real work:** provision Postgres, add an auth provider, add middleware to
protect whatever needs protecting, migrate the analytics allowlist. Days, not weeks — and
almost none of it is "backend engineering".

## The instinct behind the question

The instinct is almost certainly not "I want a login screen". It is one of:

- *I want people to come back and I want to know who they are* (retention + identity).
- *I want to save someone's searches or watchlist* (persistence).
- *I want to charge money eventually* (monetization needs accounts).

Each of those is testable without auth, and two of them are already on the roadmap as
gates that have not been passed.

## The strongest case for building login now

Real, and I do not want to strawman it. Accounts are the substrate for everything after
the pilot: you cannot measure "4 of 10 return with another card within 14 days" (a stated
G-DEMAND gate in `PROGRESS.md`) without a stable identity, you cannot save a watchlist,
and you cannot bill anyone. Building it early means the retention data starts accumulating
from the first pilot user rather than from a later cohort. Auth is also the kind of work
that never gets easier — retrofitting accounts onto a product with live users is strictly
harder than starting with them.

## Two serious objections

**1. It is explicitly a non-goal, and the gate it is waiting on has not been passed.**
`AGENTS.md` lists auth under "do not add until the core comparison pilot passes its
validation gates", and `PROGRESS.md` repeats it. The pilot has not run: the state today is
"founder self-test ready", not "10 users completed a comparison". Building the thing that
is gated on evidence you have not collected is how a product ends up with a beautiful
login screen in front of a comparison that still shows the wrong artwork one time in
three. This session measured that number: **9 of 13 One Piece searches returned a correct
eBay link (69%)**, against a target of 80%. A returning user is a user who returns to a
wrong answer.

**2. The retention question can be answered without accounts.** A signed-in user is one
way to recognise a repeat visitor; it is not the cheapest. The receipt snapshot already
produces a stable shareable URL, and PostHog is already wired with an event allowlist.
Anonymous device-level identification measures "did this person come back with a second
card" at a fraction of the cost — and unlike a login wall, it does not suppress the very
behaviour you are trying to measure. A login wall on an anonymous no-friction tool is a
conversion tax paid before the product has earned it.

## What is being assumed without evidence

- That users *want* accounts. Nothing measured so far says they do. The product's own
  positioning is "opens directly to card search with no login" — that is currently a
  feature.
- That retention is the binding constraint. The measured constraint right now is
  **accuracy**, not retention.
- That login is hard on Vercel. It is not; this was the false premise.

## Recommendation

**Do not build login now.** Not because it is hard — it is a few days — but because it
answers a question you are not yet asking, and it spends the pilot's goodwill on a
friction step before the core answer is trustworthy.

Instead, run the cheap version of the same test:

- **Smallest falsifiable test:** ship anonymous return-visitor measurement (device-level
  id through the existing PostHog allowlist, no PII, no new store) plus the existing
  shareable receipt link. Run it through the 10-person pilot.
- **Success criteria:** ≥ 4 of 10 pilot users return with a second card within 14 days,
  *and* at least 2 ask unprompted for a way to save or come back to a comparison.
- **Kill criteria:** fewer than 2 of 10 return. Then retention is not the constraint and
  login would have solved nothing.
- **Owner:** founder.
- **Review date:** at the end of the first 10-person pilot.

If the success criteria are met, the build order is: Vercel Postgres → Auth.js with the
Postgres adapter → route-handler session checks → extend `src/lib/analytics.ts` allowlist.
No new service, no separate backend, no change to the provider-credential boundary.

**One thing worth doing now, at near-zero cost:** whatever you build later will want a
stable user id on the snapshot records. Nothing in today's snapshot schema forecloses
that, so there is no migration debt accruing while you wait. Waiting is genuinely free
here, which is the strongest argument for waiting.
