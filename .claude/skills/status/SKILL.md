---
name: status
description: |
  Produce a project status / session handoff for TCGpal: a tight summary of what got
  done, what's broken or blocked, and what's still unfinished (the goals), grounded in
  real git history and the codebase — not vibes. Use this WHENEVER the user wants to
  take stock, hand off, or remember where things stand. Trigger phrases include:
  "summarize what we did", "what did we do this chat", "where are we", "what's left",
  "what are we facing", "status update", "give me a handoff", "catch me up", "what's
  unfinished", "我们做了啥", "进展", "现在到哪了", "还有啥没做". Also use it as the natural thing
  to run before /compact, before ending a long session, or at the start of a new one to
  reload context. Output is a chat reply by default; write it to a file only if asked.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Write
metadata:
  trigger: summarize session work + problems + unfinished goals for TCGpal
  source: distilled from the TCGpal one-piece / eBay / agent build sessions
---

# Status — TCGpal session summary & handoff

Produce a grounded snapshot of where the project stands. Three sections, always in this
order: **Done**, **Problems / blocked**, **Unfinished (goals + next steps)**. Ground every
claim in real evidence (git log, file contents, test runs) — never summarize from memory
alone, and never invent a commit hash or a passing test.

## Procedure

1. **Establish ground truth from git.** Run these and read the output before writing a word:
   ```bash
   git branch --show-current
   git log --oneline -15
   git status --short
   git log --oneline origin/$(git branch --show-current)..HEAD   # unpushed commits
   ```
   - The branch matters: per `AGENTS.md` this repo develops on `main` (or the assigned
     `claude/...` branch). Note if there are **unpushed** or **uncommitted** changes —
     that's a handoff risk worth calling out.

2. **Map commits to outcomes.** Turn `git log --oneline` since the session start into a
   short table (commit → plain-language "what this did"). Lead with user-visible outcomes,
   not file names. If unsure what a commit changed, `git show --stat <hash>`.

3. **Find the open problems.** Look for what's broken, blocked, or unverifiable:
   - Run the gate if it's quick and the user wants certainty:
     `npm run lint && npm run typecheck && npm run test` (skip `build` unless asked — it's slow).
     Report real pass/fail counts; if you didn't run it, say so — don't claim green.
   - Known structural blockers in this repo to check for and name explicitly when relevant:
     **egress is sandboxed** (optcgapi.com / external hosts may be unreachable — features
     that need them can't be verified live here); **eBay Browse** has an OAuth-token gate
     *and* a search-access "growth check" gate (`node scripts/check-ebay.mjs` tests both);
     **only eBay has a legal API** (cross-platform automation is walled off → manual ledger);
     **analytics/PostHog must never throw into the app** (`new URL` throws in Safari).
   - Grep for `TODO`/`FIXME`/`@ts-expect-error` if hunting for loose ends:
     `rg -n "TODO|FIXME|HACK" src/ | head -40`.

4. **Pull the goals / unfinished work.** Check, in this order, for the live intent:
   - The newest plan file in `/root/.claude/plans/` (plan-mode output captures locked decisions).
   - `validation-plan.md` / spec / `AGENTS.md` "Scope" + "Current Status" for product gates.
   - Any half-built foundation in the tree (e.g. a `harness.ts` with tests but no caller =
     a started-but-unfinished feature). List the **remaining bricks** concretely, not "polish it".

5. **Write the summary as ONE copyable block.** Emit the entire status inside a single
   fenced code block so the Claude app shows a one-click "copy" button that grabs the
   whole thing at once. Requirements:
   - Wrap everything in a **four-backtick** fence with a `markdown` info string
     (` ````markdown ` … ` ```` `). Four backticks so any triple-backtick commands inside
     (e.g. `node scripts/check-ebay.mjs`) don't close the block early.
   - Put all three sections **inside** that one block, in order: **Done** (a markdown
     table commit → outcome, or tight bullets, in user-facing language) · **Problems /
     blocked** (what's broken/unverifiable and *why*, what to run to confirm — e.g. "eBay
     keyset unverified live") · **Unfinished — goals + next steps** (active goal, then a
     numbered list someone could pick up cold). End the block with the single most useful
     next action.
   - Put **nothing outside the block** except, at most, one short lead-in line — the
     copyable block itself is the deliverable. The markdown renders as raw source inside
     the block (tables won't prettify); that's the intended trade for one-click full copy.

   Default to this in-chat copyable block. Write to a file (e.g. `STATUS.md` or
   `docs/handoff-<date>.md`) **only if the user asks** — don't litter the repo.

## Rules
- Evidence over memory: every "done" maps to a commit; every "passing" maps to a run you did.
- Honesty about state: surface unpushed/uncommitted work, skipped checks, and unverifiable
  features rather than papering over them. A handoff that hides a gap is worse than none.
- Plain language for outcomes; precise names (files, commits, commands) for the next person.
- Don't pad. If a section is empty (nothing blocked, nothing unpushed), say so in one line.
- Respect the branch policy in `AGENTS.md` — note the working branch and never imply work
  landed somewhere it didn't.
- One copyable block: the whole status lives in a single four-backtick fenced block so the
  app's copy button grabs all of it. No stray commentary outside it.
