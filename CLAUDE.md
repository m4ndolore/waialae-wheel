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
- **Auto-press:** Triggers when any line reaches 2 down
- **Front press hole 9 rule:** Win = wiped (dead), Push = carry into back 9, Lose = double value and carry
- **Front press back-9 gate:** If team_down wins or ties back match, carried front press is dead (escaped). If team_down loses back match, press is owed.
- **Front press hole 18 (if owed):** Lose = double again, otherwise settle at current value
- **Back press hole 18 rule:** Win or Push = wiped (dead), Lose = owed and settles
- **Base bets:** Front $baseBet, Back $baseBet, Overall $baseBet×2; settle flat (win/lose/push, not by margin)
