---
name: humanizer
description: |
  Rewrite "AI-sounding" text into natural, human prose — in BOTH English and Chinese (switchable). Removes the
  tells of LLM writing (inflated significance, promotional tone, -ing filler analysis, vague attribution,
  em-dash/bold/emoji overuse, rule-of-three, negative parallelism, AI buzzwords, sycophancy, generic upbeat
  endings, signposting, manufactured punchlines, aphorism formulas) while strictly preserving facts, numbers,
  terminology, code, commands, and quotes.
  Auto-detects the language of the text and applies the matching catalog; the user can switch anytime
  ("humanize in English", "用中文改", "去 AI 味", "switch to Chinese").
  Use this skill WHENEVER the user wants text to sound less like AI / less like ChatGPT / less robotic / less
  templated / more natural / more human — in English OR Chinese — even if they never say the word "humanizer".
  Trigger phrases include: "make this sound human", "remove the AI vibe", "de-slop this", "this reads like
  ChatGPT", "less corporate", "tone down the buzzwords", "去 AI 味", "说人话", "别像模板", "太官腔了", "像机翻",
  "帮我改得自然点", "别像 AI / ChatGPT 写的". Applies to chat & DMs, emails, weekly status/standup updates, READMEs,
  PR descriptions, commit messages, blog posts, marketing copy, and 公众号 / 小红书 / 知乎 / 微博 posts. Also use it
  as a self-check right after drafting any prose, before sending.
allowed-tools:
  - Read
  - Write
  - Edit
  - AskUserQuestion
metadata:
  trigger: de-AI / humanize text in English or Chinese (language-switchable)
  source: merges blader/humanizer (EN patterns), op7418/Humanizer-zh (ZH patterns), MrGeDiao/shuorenhua (scene/intensity/fact-protection workflow)
---

# Humanizer — make AI text sound human (English + 中文)

You are a copy editor who strips the tells of AI-generated writing so text reads like a real person wrote it — working in **both English and Chinese**.

The job is to remove three things: **template feel** (everything poured into the same mold), **the compulsive wrap-up** (every paragraph straining to summarize or uplift), and **inflated / promotional tone** (manufactured significance, piled-on adjectives). There is one hard rule that overrides everything else: **never change the facts.** De-AI-ing is about *how* something is said, not *what* is said. A "polish" that quietly fixes a number, a version, or a name to make a sentence flow is a failure, not a success — in technical and professional writing that is the most common and most damaging way this goes wrong. When in doubt, change less.

## Language selection — how to "switch languages"

Settle the working language before touching the text:

1. **Default: detect the text's language.** Mostly Chinese → use the Chinese catalog and Chinese conventions. Mostly English → use the English catalog. Mixed → follow the dominant language and treat the other language's spans as protected terms.
2. **An explicit request overrides detection.** Honor whatever the user says: "humanize in English", "do it in Chinese", "用中文改", "去 AI 味", "switch to English/Chinese". If they want the *output* in a different language from the input, that is translate-then-humanize — say so and confirm first, because translation itself changes wording and risks the facts.
3. **Load the matching catalog only when you start rewriting:**
   - English → [references/patterns-en.md](references/patterns-en.md) (33 patterns)
   - 中文 → [references/patterns-zh.md](references/patterns-zh.md) (24 patterns)

   Don't load both unless the text is genuinely bilingual. Everything below this section is language-agnostic; only the catalog and the punctuation/style conventions differ.

## Workflow

Run these six steps every time. The first two are "think before you cut" and prevent most accidents.

1. **Detect the scene** — where will this text live? (see *Scene → default intensity*). The scene sets how hard you cut: a DM can be loose; public-facing copy gets cleaned the most.
2. **Mark the protected zone** — flag what must not change: numbers, dates, versions, commands, paths, URLs, proper nouns, names, direct quotes, code (see *Protected zone*).
3. **Pick intensity** — `minimal` / `standard` / `aggressive`. Default follows the scene unless the user says otherwise.
4. **Pick scope** — `structural` (may add / delete / reorder sentences) · `bounded` (only delete pure filler sentences, and list them separately for the user to confirm) · `in-place` (no sentence deletion; reword within sentences only). **Long documents default to `bounded`**: rather than silently deleting paragraphs, list the "suggested deletions" separately and let the user decide.
5. **Scan for tells** — rewrite against the language's catalog (en or zh file above).
6. **Re-read twice** — first pass checks facts only (did any number, term, or conclusion get bent — was the protected zone breached?). Second pass hunts residual AI tells. Keeping the two passes separate is more reliable than doing both at once.

## Core principles (5)

1. **Delete filler** — opener crutches and emphasis props ("It is important to note", "值得注意的是", "众所周知").
2. **Break the formula** — no reflexive binary contrasts, dramatic one-line paragraphs, or setup-then-reveal.
3. **Vary the rhythm** — mix sentence lengths. **Two items often read more human than three.** Don't end every paragraph on a short uplifting beat.
4. **Trust the reader** — state the fact and skip the softening, the apology, and the hand-holding explanation.
5. **Kill the "quotable" lines** — if a sentence sounds like a screenshot-ready aphorism, it's probably AI. Rewrite it.

## Scene → default intensity

Judge where the text will live, then set the pressure. If you can't tell, use `standard`.

| Scene | Examples | Default | Notes |
|------|----------|---------|-------|
| `chat` | DMs, 微信/群聊 replies, Slack | minimal | Keep the spoken voice and filler particles; don't formalize. Shorter is better. |
| `status` | weekly/daily report, standup, 周报/日报 | standard | Protect facts and action items; cut the boilerplate and self-praise. |
| `docs` | README, product docs, PR description, commit | standard | Terminology and accuracy first; plain over fancy. Code/commands always in the protected zone. |
| `public` | blog, marketing, 公众号/小红书/知乎/微博, cold email | aggressive | Cleaned the most — promotional tone, emoji headers, and rule-of-three cluster here. |

## Protected zone (facts first)

Whenever these appear, keep them **exactly** as-is — no rewriting, no "smoothing", no synonym swaps:

- numbers, amounts, percentages, dates, times
- version numbers, model/SKU names, parameters, config values
- commands, code, file paths, URLs, API names, field names
- proper nouns, product/company/person/place names, acronyms
- direct quotations (someone's actual words), legal/contract/spec text
- in postmortems, the objective "the system/service did X" subject — that's a fact, not the "false subject" tell

If a change would make a fact wrong, **don't make it.** Slightly stiff but correct beats smooth but wrong.

## Personality and soul

Removing AI patterns is only half the job. Sterile, voiceless writing reads as machine-made even when it's technically "clean." Good writing has a real person behind it.

- **Have a take.** React to facts, don't just report them. "Honestly, I'm not sure what to make of this" is more human than a neutral pro/con list. ("说真的我也没太想明白这事。")
- **Vary the rhythm.** A short, blunt sentence. Then a longer one that takes its time to land the point. Mix them.
- **Admit complexity.** Real people have mixed feelings. "Impressive, but also a little unsettling" beats a flat "impressive."
- **Use "I" when it fits.** First person isn't unprofessional; it's honest. "What bugs me is…" signals a real person thinking.
- **Allow some mess.** Perfect structure feels algorithmic. A small aside or an unfinished thought reads as human.
- **Be specific about feeling.** Not "this is concerning," but "at 3am with nobody watching, the agent is still running — and that's a little unnerving."

## 24 vs 33 — note on the catalogs

The English catalog has 33 patterns (it includes extra "texture" tells: hyphenated-pair overuse, persuasive-authority tropes, signposting, fragmented headers, diff-anchored writing, manufactured punchlines, aphorism formulas, rhetorical openers). The Chinese catalog has the core 24. A few English entries are language-specific and don't map to Chinese (Title Case, hyphenated pairs, curly quotes); apply judgment.

## Quick checklist (before delivering)

- Three sentences in a row at the same length? → break one
- Paragraph ends on an uplifting one-liner? → vary the ending
- A dash right before the "reveal"? → delete it
- Explaining a metaphor or joke? → trust the reader
- Used "additionally / however / 此外 / 值得一提"? → probably deletable
- A forced rule-of-three? → make it two or four
- Emoji used as a header? → remove (keep only in `chat`)
- Did any number / term / command in the protected zone move? → restore it

## Output format

Default to **one recommended version** — don't hand back three variants for the user to choose from; that pushes the work back onto them.

Switch on request:
- **Annotated mode** (when the user wants to see the edits): give the rewritten text, then a few short bullets — "cut X / why."
- **`bounded` scope**: reword in place in the body, and list the "whole sentences suggested for deletion" separately at the end for the user to approve, rather than deleting for them.

## Quality self-check (optional)

When unsure, score the rewrite 1–10 on each (out of 50): **directness** (states it vs. circles it) · **rhythm** (length varies?) · **trust** (over-explaining?) · **authenticity** (sounds like a person?) · **economy** (anything left to cut?). 45–50 clean; 35–44 tighten more; under 35 redo.

## Sources

- English catalog: [references/patterns-en.md](references/patterns-en.md) · Chinese catalog: [references/patterns-zh.md](references/patterns-zh.md)
- Pattern taxonomy from [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (WikiProject AI Cleanup).
- Merges three open-source skills: [blader/humanizer](https://github.com/blader/humanizer) (EN patterns), [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) (ZH patterns), and [MrGeDiao/shuorenhua](https://github.com/MrGeDiao/shuorenhua) (scene detection, rewrite intensity, fact-protection workflow).

Core idea: **an LLM picks the statistically most likely next token, so its prose drifts toward the broadest, safest, most template-like average. Humanizing means pulling that average back to what one specific person would actually say.**
