# Waialae Wheel Bet — How the Game Works

## Overview

The Wheel is a **2v2 team match play** betting format designed for a regular group of 4 or 5 social amateur golfers with different skill levels. One (or two) players are designated the "wheel" — they play in every match simultaneously, rotating partners. It creates action for everyone on every hole.

## Setup

**4 players:** Straight 2v2 — players 1+2 vs players 3+4. One match, no wheel. Example: Magoo + Ali vs Gary + Sang.

**5 players:** Pick 2 wheel players. They form a permanent team and play 3 matches against the 3 possible pairings of the other 3 players.

In the 5-player format, the wheel players take on more risk and action since they're in every match.

## Handicap Strokes ("Dots")

Everyone plays net, using relative dots rather than full USGA strokes:

1. The lowest-handicap player in the group gets **zero** dots.
2. Everyone else gets dots equal to their handicap difference from that low player.
3. A player receives a dot (one stroke reduction) on a given hole if their dot count is ≥ that hole's difficulty ranking on the Waialae scorecard.

Example: A 14-handicap playing with a 7-handicap gets 7 dots, applied to the 7 hardest holes on the course.

### Waialae Hole Difficulty Index

| Hole | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|------|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|----|----|-----|
| Index | 7 | 17 | 13 | 1 | 9 | 11 | 3 | 15 | 5 | 6 | 16 | 12 | 18 | 2 | 10 | 14 | 4 | 8 |

Lower index = harder hole. Hole 4 is the hardest (index 1), Hole 13 is the easiest (index 18).

## Two Games Per Match

Each match tracks **two separate bets** simultaneously:

- **Low Net:** The lower net score between the two teammates wins the hole (best-ball).
- **Aggregate:** The combined net score of both teammates wins the hole (total team score).

## Betting Lines

For each match, in each game (low net and aggregate), there are three main betting lines:

| Line | Holes | Base Value |
|------|-------|-----------|
| Front 9 | 1–9 | $10 |
| Back 9 | 10–18 | $10 |
| Overall | 1–18 | $20 |

Main lines settle **flat** — you either win, lose, or push. It doesn't matter if you're 1-up or 5-up; you win or lose the same fixed amount.

## Match Play Scoring

Each hole is won (+1), lost (-1), or pushed/halved (0). The running score tracks how many up or down you are, like regular match play — but it keeps going through all 18 holes (no closing out early).

## Presses (Auto-Press at 2-Down)

Only **Front 9** and **Back 9** lines create presses. The Overall line does not press.

When a front or back betting line reaches **2 down**, a new "press" bet automatically starts from the next hole through the end of that segment. A press is a new side bet at the base amount ($10), giving the losing side a chance to recover.

Presses can themselves go 2-down, triggering additional presses. This can cascade — a bad stretch can generate several active presses.

### Press Perspective

Each press determines its own **pressWinningTeam** — the team currently winning that specific press based on the holes it covers. All lifecycle rules (hole 9, back-9 gate, hole 18) evaluate from the pressWinningTeam's perspective. If a press is tied at its checkpoint, it closes with payout 0.

## Front Press Lifecycle

### Step 1: Hole 9

At the end of hole 9, evaluate each front press's standing over its own holes:

- **Press is tied** → Closed permanently. Payout 0. Does not carry.
- **pressWinningTeam wins hole 9** → Press value **doubles**, and the press **carries** to the back-9 gate.
- **pressWinningTeam loses hole 9** → Press is **erased**. Payout 0.
- **Hole 9 is tied** → Press **carries** at current value to the back-9 gate.

### Step 2: Back-9 Gate

After the back 9 is complete, evaluate the **Back 9 main line result** (same scoring category as the press) from the pressWinningTeam's perspective:

- **pressWinningTeam wins the back** → Press value **doubles** again and pays.
- **pressWinningTeam ties the back** → Press **pays at current value**.
- **pressWinningTeam loses the back** → Press is **erased**. Payout 0.

A front press doubled at hole 9 can double again at the back-9 gate — paying at 4× original value.

## Back Press Lifecycle

At the end of hole 18, evaluate each back press's standing over its own holes:

- **Press is tied** → Closed permanently. Payout 0.
- **pressWinningTeam wins hole 18** → Press value **doubles** and pays.
- **pressWinningTeam loses hole 18** → Press is **erased**. Payout 0.
- **Hole 18 is tied** → Press **pays at current value**.

The full Back 9 match result does **not** gate back presses. Only hole 18 matters.

## Why These Rules Matter

Hole 9 and hole 18 are the pivotal moments. A team winning a front press gets rewarded if they also win hole 9 (double and carry), but risks erasure if they lose it. The back-9 gate then creates a second high-stakes checkpoint. Back presses hinge entirely on hole 18. These rules create drama at the turn and the closing hole — the most important moments in the round.

## Scale of Action

With 3 matches × 2 games × 3 base lines + cascading presses, there can be **dozens** of active bets running simultaneously off a single set of scores. Players enter their gross score once per hole and the tracker resolves everything across all matches and games automatically.

## Settlement

At the end of the round, all settled lines are totaled from the wheel side's perspective. The wheel player(s) either collect from or pay to the field based on the net of all matches combined.
