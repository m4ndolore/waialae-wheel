# Waialae Wheel Bet Tracker — Mobile Redesign

## Context

The current app is a functional vanilla JS SPA that tracks simultaneous wheel matches. It works but has a desktop-first layout with an 18-column table that's unusable on mobile. The primary use case is on-course — golfers entering scores on their phones between shots.

## Design Direction

**Aesthetic:** Country Club Classic — deep forest green, warm cream, antique gold, burgundy, serif typography. Premium but not fussy. Inspired by the physical Waialae scorecard.

**Architecture:** Single-page app with 5-tab bottom navigation. Still vanilla HTML/CSS/JS, no dependencies, localStorage persistence.

## Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--green-deep` | `#1a3a2a` | Primary, nav, headers |
| `--cream` | `#f5f0e8` | Page background |
| `--gold` | `#c9a84c` | Accents, active states, wins |
| `--burgundy` | `#7a1f1f` | Down/loss states |
| `--walnut` | `#3a2a1a` | Body text |
| `--cream-light` | `#faf7f2` | Card backgrounds |
| `--green-muted` | `#2d5a3f` | Secondary green |

## Typography

- Headers: Playfair Display (Google Fonts)
- Body/numbers: Source Serif 4 (Google Fonts)

## Bottom Navigation (5 tabs)

1. **Setup** — Players, handicaps, wheel selection, saved groups
2. **Scorecard** — Per-hole score entry with swipe navigation
3. **Matches** — Summary dashboard (totals, active lines, at-risk)
4. **Detail** — Deep dive into specific match/game betting lines
5. **Settlement** — Final money summary with share

## Tab 1: Setup

- **Saved Groups:** Horizontal scrollable chips at top. Tap to load, "+" to save current, long-press to delete.
- **Game Type:** Two large pill buttons (4-Player / 5-Player), gold fill on active.
- **Player Cards:** Horizontal cards with name input + handicap stepper (+/- buttons). Crown icon to designate wheel player(s).
- **Base Bet:** Stepper with preset buttons ($5, $10, $20, $25).
- **Start Round:** Large gold button → navigates to Scorecard tab.

## Tab 2: Scorecard

- **Hole Navigation:** Swipe left/right. Top bar: large hole number, 18-dot progress strip (filled = scored), tap dot to jump. Subtitle: "Hdcp 7 · Par 4".
- **Score Entry:** Player rows with name + score display. Tap row → numpad overlay (bottom-anchored, phone-dialer style). Keys 1-9, backspace, "next player" button. Auto-dismiss after last player.
- **Quick Results Banner:** After all scores entered, color-coded summary: which team won each match for both games. Auto-advance to next hole after 1.5s (with "Stay" cancel button).

## Tab 3: Matches (Summary Dashboard)

- **Grand Total Card:** Large gold-bordered card showing net wheel-side position (+$60 / -$30). Subtitle: "Through 12 holes".
- **Match Cards:** One per match. Shows matchup label, net total, low net + aggregate subtotals, active lines with status and color coding, press values.
- **At-Risk Banner:** Appears on holes 8/9/17/18 warning what's at stake with hole 9/18 press rules. Warm amber background.
- **Tap match card → navigates to Detail tab filtered to that match.**

## Tab 4: Detail

- **Match Selector:** Horizontal pill tabs (Match 1 / 2 / 3).
- **Game Toggle:** Low Net / Aggregate pills.
- **Line Cards (collapsed):** Line name, value, current status. Small sparkline bar showing trajectory.
- **Line Cards (expanded on tap):** Hole-by-hole vertical list with result per hole and running total. Color-coded left borders. Press trigger callouts. Settlement info at bottom.
- **Press Nesting:** Presses visually indented below parent line.
- **Hole 9/18 Annotations:** Gold-bordered callout rows in expanded view.

## Tab 5: Settlement

- **Grand Total Card:** Prominent gold-bordered total.
- **Per-Match Accordions:** Each expands to show Low Net + Aggregate subtotals, each settled line with result. Wiped lines in strikethrough. Doubled lines gold-highlighted.
- **Who Owes Who:** Simple per-match summary from wheel perspective.
- **Share Button:** Native share sheet or clipboard copy of text summary.

## State Model Additions

```javascript
state.activeTab    // 'setup' | 'scorecard' | 'matches' | 'detail' | 'settlement'
state.savedGroups  // [{ name, players, gameType, wheelA, wheelB, baseBet }]
```

Existing state shape and localStorage key unchanged for backward compatibility.

## Interaction Patterns

- 48px minimum tap targets throughout
- Swipe gestures for hole navigation (with fallback arrow buttons)
- Numpad overlay instead of native number input
- Expandable cards instead of wide tables
- Auto-advance after score entry with cancel option
