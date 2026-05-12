# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Waialae Wheel Bet Tracker v2 — a golf betting calculator for simultaneous wheel matches at Waialae Country Club. Vanilla JavaScript SPA with no dependencies, no build system, no package manager.

## Running

Open `index.html` in a browser. No server, build step, or install required.

## Deployment

Upload `index.html`, `styles.css`, and `app.js` to any static host (Netlify, Vercel, GitHub Pages).

## Architecture

Three files, flat structure:

- `index.html` — markup and layout
- `app.js` — all logic: state management, game calculations, DOM rendering
- `styles.css` — styling

**State model:** Single `state` object persisted to `localStorage` under key `'waialaeWheelTrackerV2'`. All mutations call `save()` then re-render affected sections.

**Rendering:** Imperative DOM manipulation via `render()` and sub-renderers (`renderPlayers`, `renderHole`, `renderHoleResults`, `renderTracker`, `renderSettlement`). No virtual DOM or templating.

**Game logic flow:**
1. `dotOnHole(playerIndex, hole)` — handicap stroke allocation using Waialae's hole difficulty index
2. `net(playerIndex, holeIndex)` — gross score minus dots
3. `getMatchups()` — generates team pairings (straight 2v2 for 4-player, 3 wheel matches for 5-player)
4. `resultForHole(hidx, game, matchIndex)` — determines hole winner (+1/-1/0) for low net or aggregate
5. `runSegment(game, matchIndex, name, start, end, value)` — tracks a betting line across holes, auto-pressing at 2-down
6. `buildLines(game, matchIndex)` — assembles front/back/overall lines with press rules for holes 9 and 18

## Domain Rules

- **Wheel format:** One or two "wheel" players rotate as partners against all other pair combinations
- **4-player:** Straight 2v2 (players 1+2 vs players 3+4), no wheel
- **5-player:** 2 wheel players create 3 matches against the 3 combinations of the other 3 players
- **Dots:** Lowest handicap gets zero; others receive strokes on holes where their handicap difference ≥ hole's difficulty index
- **Auto-press:** Each line (main or press) can spawn at most one child press, triggered when either team goes 2 down. Once a line has spawned its press, it never spawns another regardless of subsequent status changes. Only FRONT_9 and BACK_9 lines create presses. No OVERALL presses.
- **Press perspective:** Each press determines its `pressWinningTeam` from its own running status. All lifecycle gates evaluate from that team's perspective.
- **Front press hole 9:** Tied press = closed (payout 0, no carry). pressWinningTeam wins hole 9 = double & carry. pressWinningTeam loses hole 9 = erased. Hole 9 tied = carry at current value.
- **Front press back-9 gate:** Uses BACK_9 main line result for same scoring category. pressWinningTeam wins back = double & pay. Ties back = pay at value. Loses back = erased.
- **Back press hole 18:** Tied press = closed (payout 0). pressWinningTeam wins hole 18 = double & pay. pressWinningTeam loses hole 18 = erased. Hole 18 tied = pay at value.
- **Base bets:** Front $baseBet, Back $baseBet, Overall $baseBet×2; settle flat (win/lose/push, not by margin)
