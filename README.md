# New-Pair Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yusuf-marchetti/token-radar-newpair-acct-07/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yusuf-marchetti/token-radar-newpair-acct-07/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that hunts new pairs: pre-token protocols ranked by implied value, with the emphasis on pairs that are new — recently listed, already large, and surging — and a concrete four-step farm plan for each one.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

## The model

Implied value follows only from the sealed snapshot's own figures — no hardcoded list of names:

```
peer     = median market-cap / TVL of the protocols in the same category
           that already record a token (clamped to 0.15–5; global median
           when a category has no traded peer)
momentum = 1 + 0.5 × clamp(change_7d, −50%, +200%)
fresh    = exp(−age_days / 540) for a known listing date, 0.45 unknown
tilt     = 0.45 + 0.55 × fresh
ignition = 1.5 when listed in the last 180 days and up 20%+ in 7 days
implied  = TVL × peer × momentum × tilt × ignition
```

The board holds up to 200 rows: every protocol on the snapshot's watchlist, plus the highest-scoring other genuine pre-token protocols — 197 rows on this snapshot. Protocols that already record a token are never ranked; the dashboard shows the largest of them apart, as the market's own values.

## Layout

- `main.ts` — the entry point: reads the snapshot, writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, then `dossier.json`.
- `lib/model.ts` — the new-pair model, the farm-plan generator and the board's own gate checks.
- `dashboard/` — a static page (no network): sortable board, chain/category/search filters, a detail view for every protocol with its value breakdown, and the already-trading strip.
- `screenshots/` — the board, a protocol detail view and a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored from the kit.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yusuf-marchetti&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
