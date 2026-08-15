# Launch links — tagged for attribution

Copy these exactly. The `?s=` value is mapped to a coarse enum in the browser
(`reddit`, `rednote`, `discord`, `internal`, `other`) before anything is sent —
the raw tag never leaves the page, so per-post tags are safe to make specific.

Replace `tcgpal.vercel.app` with the custom domain if you point one at it before
posting.

## Reddit — one tag per post

Any tag starting with `reddit` maps to the `reddit` channel.

| Where | Link |
|---|---|
| r/PokemonTCG | `https://tcgpal.vercel.app/?s=reddit_pokemontcg_01` |
| r/OnePieceTCG | `https://tcgpal.vercel.app/?s=reddit_onepiecetcg_01` |
| r/pkmntcgcollections | `https://tcgpal.vercel.app/?s=reddit_pkmntcgcollections_01` |
| r/SideProject | `https://tcgpal.vercel.app/?s=reddit_sideproject_01` |
| comment replies in a thread | `https://tcgpal.vercel.app/?s=reddit_comment_01` |

Bump the trailing number for a second post in the same place
(`reddit_pokemontcg_02`) — that is how you tell a repost from the original.

## RedNote — bio link only

Any tag starting with `rednote`, `xhs`, or `xiaohongshu` maps to `rednote`.

| Where | Link |
|---|---|
| profile bio | `https://tcgpal.vercel.app/?s=rednote_bio` |
| a note that can carry a link | `https://tcgpal.vercel.app/?s=rednote_note_01` |

**RedNote restricts clickable outbound links in notes.** Realistically only the
bio link carries the tag; anyone who types the domain by hand arrives untagged.
Worse, RedNote's in-app browser usually sends no referrer, so those visits land
in `direct` with no way to recover them.

If RedNote attribution matters, point a short vanity domain or a distinct path
at the app and put *that* in the notes — a path you only ever publish on RedNote
is self-attributing even with no tag and no referrer.

## Discord / elsewhere

| Where | Link |
|---|---|
| Discord | `https://tcgpal.vercel.app/?s=discord_<server>` |
| anything else | `https://tcgpal.vercel.app/?s=<name>` → lands in `other` |

## Your own testing

```
https://tcgpal.vercel.app/?s=internal
```

Use this every time you open the app yourself. The channel persists for the
whole tab session, and `channel = internal` is filtered out of every insight in
`docs/launch-metrics.md`. Without it you will be a meaningful share of your own
launch funnel.
