# Press Rules & Matchup Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three issues: (1) 4-player format should be a single 2v2 match, not 3 wheel matches; (2) UP/DN perspective should be relative to the top player(s) in setup (teamA); (3) rewrite hole 9 and hole 18 press lifecycle rules per the owner's actual game rules.

**Architecture:** All changes are in `app.js` (game logic) and `CLAUDE.md` / `gameplay.md` (docs). The press lifecycle changes affect `buildLines()` which orchestrates `runSegment()` output. The matchup change affects `getMatchups()`. The perspective change is already correct (teamA = top players), just needs verification and clearer labeling in UI.

**Tech Stack:** Vanilla JS, no build system, no tests. Manual browser testing.

---

## Correct Press Lifecycle Rules (from owner)

### Front press lifecycle (holes 1-9 presses)

**Step 1 — Hole 9 result (from perspective of the team that is DOWN in the press):**

- team_down **wins** hole 9 → press is dead (wiped, no payout)
- team_down **ties** hole 9 → press carries into back 9, value unchanged
- team_down **loses** hole 9 → press carries into back 9, value doubles

**Step 2 — Back 9 main line result (GATE, only for carried presses):**

- team_down wins or ties back match → press is dead (they escaped)
- team_down loses back match → press is owed (proceeds to step 3)

**Step 3 — Hole 18 result (only if press is owed):**

- team_down loses hole 18 → press value doubles again
- Otherwise → press settles at current value

### Back press lifecycle (holes 10-18 presses)

- team_down **wins** hole 18 → press is dead (wiped)
- team_down **ties** hole 18 → press is dead (push, wiped)
- team_down **loses** hole 18 → press is owed, settles at current value

### Key insight

"team_down" in a press is always the side that was losing when the press spawned — that's the side at -2 that triggered the auto-press. The press result (UP/DN) is tracked from teamA's perspective like everything else, but the hole 9/18 rules apply from the perspective of whichever team was down.

In the current code, presses trigger at `status <= -2`, meaning teamA is down. So teamA is always the "team_down" in presses. The hole result `resultForHole()` returns +1 when teamA wins, -1 when teamA loses. So:
- "team_down wins hole 9" = `h9 > 0` (teamA won)
- "team_down loses hole 9" = `h9 < 0` (teamA lost)

### Current code vs correct rules — Front presses

| Scenario | Current code | Correct rule |
|----------|-------------|--------------|
| Win hole 9 | Double & carry | Dead (wiped) |
| Push hole 9 | Carry | Carry |
| Lose hole 9 | Wiped | Double & carry, then gated by back result |

The current code has win/lose **backwards** and is missing the back-9 gate entirely.

### Current code vs correct rules — Back presses

| Scenario | Current code | Correct rule |
|----------|-------------|--------------|
| Win hole 18 | Double & realize | Dead (wiped) |
| Push hole 18 | Realize | Dead (wiped/push) |
| Lose hole 18 | Wiped | Owed, settles |

Also backwards.

---

## Task 1: Fix 4-player matchups — single 2v2

**Files:**
- Modify: `app.js:169-189` (`getMatchups()`)
- Modify: `app.js:355-366` (`renderGameTypePills`, wheel logic)
- Modify: `app.js:432-450` (crown click handler)

**Step 1: Rewrite `getMatchups()` for 4-player**

Currently generates 3 wheel matches. Change to return a single 2v2: players 0+1 vs players 2+3.

```js
function getMatchups() {
  const n = +state.gameType;
  if (n === 4) {
    // 4-player: straight 2v2, first two vs last two
    return [{
      label: `${pname(0)} + ${pname(1)} vs ${pname(2)} + ${pname(3)}`,
      teamA: [0, 1], teamB: [2, 3]
    }];
  }
  // 5-player: wheel format with 2 wheel players
  const wa = +state.wheelA, wb = +state.wheelB;
  const others = [0,1,2,3,4].filter(i => i !== wa && i !== wb);
  const pairs = [[others[0],others[1]], [others[0],others[2]], [others[1],others[2]]];
  return pairs.map(pair => ({
    label: `${pname(wa)} + ${pname(wb)} vs ${pname(pair[0])} + ${pname(pair[1])}`,
    teamA: [wa, wb], teamB: pair
  }));
}
```

**Step 2: Hide wheel crown UI for 4-player mode**

In `renderPlayerCards()`, only show crown icons when `gameType === 5`. For 4-player, show a team indicator instead (e.g., "A" / "B" or team color). Players can be reordered by drag or the UI just uses position: top 2 = team A, bottom 2 = team B.

Simple approach: hide crowns for 4-player, add a subtle team divider between players 2 and 3.

**Step 3: Remove wheelA references from 4-player pill toggle**

In `renderGameTypePills`, remove the `wheelB` reset logic for 4-player since there's no wheel.

**Step 4: Test in browser**

Open index.html, set 4-player format, verify only 1 match appears in Matches tab. Switch to 5-player, verify 3 matches with wheel players.

**Step 5: Commit**

```bash
git add app.js
git commit -m "fix: 4-player format is single 2v2 match, not 3 wheel matches"
```

---

## Task 2: Rewrite `buildLines()` press lifecycle

**Files:**
- Modify: `app.js:237-274` (`buildLines()`)

This is the core logic fix. Replace the hole 9 and hole 18 press handling.

**Step 1: Rewrite front press hole 9 logic**

Replace lines 242-256 with the correct lifecycle:

```js
// ── Front press: hole 9 rule ──
// Press triggered at status <= -2, so teamA is "team_down"
// h9 > 0 means team_down (teamA) won hole 9
// h9 < 0 means team_down (teamA) lost hole 9
const h9 = resultForHole(8, game, matchIndex);
front.forEach(line => {
  if (line.kind !== 'press') return;
  if (h9 === null) return;

  if (h9 > 0) {
    // team_down wins hole 9 → press is dead
    line.final = {state: 'wiped at 9', amount: 0};
    return;
  }

  if (h9 < 0) {
    // team_down loses hole 9 → double and carry
    line.value *= 2;
    line.note = 'doubled at 9';
  } else {
    // push hole 9 → carry unchanged
    line.note = 'carried at 9';
  }

  // Carry: extend press through back 9
  let running = line.status[9] ?? 0;
  for (let h = 10; h <= 18; h++) {
    const r = resultForHole(h - 1, game, matchIndex);
    if (r === null) break;
    running += r;
    line.status[h] = running;
  }
  line.end = 18;
});
```

**Step 2: Add back-9 gate for carried front presses**

After extending front presses through back 9, check the back main line result as a gate:

```js
// ── Front press: back-9 gate ──
// Only carried front presses (those with line.end === 18 and no final)
const backMain = back.find(l => l.kind === 'main');
const backResult = backMain?.status[18]; // positive = teamA up, negative = teamA down
front.forEach(line => {
  if (line.kind !== 'press' || line.final || line.end !== 18) return;
  if (backResult === undefined) return; // back 9 not complete yet

  if (backResult >= 0) {
    // team_down (teamA) won or tied back match → escaped, press dead
    line.final = {state: 'escaped (won back)', amount: 0};
    return;
  }

  // team_down lost back match → press is owed
  // Check hole 18 for additional doubling
  const h18 = resultForHole(17, game, matchIndex);
  if (h18 === null) return;

  if (h18 < 0) {
    // team_down loses hole 18 → double again
    line.value *= 2;
    line.final = {state: 'doubled at 18', amount: -line.value};
  } else {
    // team_down wins or ties hole 18 → settles at current value
    const standing = line.status[18] ?? 0;
    line.final = {state: 'settled', amount: standing > 0 ? line.value : standing < 0 ? -line.value : 0};
  }
});
```

**Step 3: Rewrite back/overall press hole 18 logic**

Replace lines 258-265:

```js
// ── Back press: hole 18 rule ──
const h18 = resultForHole(17, game, matchIndex);
[...back, ...overall].forEach(line => {
  if (line.kind !== 'press' || line.final) return;
  if (h18 === null) return;

  if (h18 >= 0) {
    // team_down wins or ties hole 18 → press is dead
    line.final = {state: h18 > 0 ? 'wiped at 18' : 'push at 18', amount: 0};
  } else {
    // team_down loses hole 18 → owed, settles at current value
    const standing = line.status[18] ?? 0;
    line.final = {state: 'settled at 18', amount: standing > 0 ? line.value : standing < 0 ? -line.value : 0};
  }
});
```

**Step 4: Test in browser**

Create a test scenario:
- Enter scores for holes 1-9 where teamA goes 2-down early (triggering a front press)
- Test win hole 9 → verify press disappears
- Test lose hole 9 → verify press doubles and carries
- Test carried press with back-9 win → verify press escapes
- Test carried press with back-9 loss + lose hole 18 → verify double again

**Step 5: Commit**

```bash
git add app.js
git commit -m "fix: rewrite press lifecycle — correct hole 9/18 rules per actual game"
```

---

## Task 3: Update at-risk banner text

**Files:**
- Modify: `app.js:749-785` (`renderAtRiskBanner()`)

**Step 1: Update banner wording**

The banner near hole 9 and 18 should reflect the corrected rules:

- Hole 9 banner: "Win = wiped. Push = carry. Lose = double & carry."
- Hole 18 banner (back presses): "Win/Push = wiped. Lose = settles."
- Hole 18 banner (front carried): "Contingent on back 9 result."

**Step 2: Commit**

```bash
git add app.js
git commit -m "fix: update at-risk banner text to match corrected press rules"
```

---

## Task 4: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `gameplay.md`

**Step 1: Update CLAUDE.md domain rules**

Replace the hole 9/18 press rules and 4-player description:

```markdown
- **4-player:** Straight 2v2 (players 1+2 vs players 3+4), no wheel
- **5-player:** 2 wheel players create 3 matches against the 3 combinations of the other 3 players
- **Front press hole 9 rule:** Win = wiped (dead), Push = carry into back 9, Lose = double value and carry
- **Front press back-9 gate:** If team_down wins or ties back match, carried front press is dead (escaped). If team_down loses back match, press is owed.
- **Front press hole 18 (if owed):** Lose = double again, otherwise settle at current value
- **Back press hole 18 rule:** Win or Push = wiped (dead), Lose = owed and settles
```

**Step 2: Update gameplay.md**

Rewrite the "Hole 9 Rule" and "Hole 18 Rule" sections and the 4-player setup description to match the corrected rules.

**Step 3: Commit**

```bash
git add CLAUDE.md gameplay.md
git commit -m "docs: correct press lifecycle rules and 4-player format description"
```

---

## Task 5: Verify UP/DN perspective

**Files:**
- Review: `app.js:191-203` (`resultForHole`)
- Review: `app.js:205` (`st()`)

**Step 1: Verify current behavior**

`resultForHole` returns +1 when teamA wins. In 4-player, teamA = players 0+1 (top two in setup). In 5-player, teamA = wheel players. `st()` displays positive as "UP", negative as "DN".

This means UP/DN is already relative to the top players / wheel players. The perspective is correct as-is, but we should verify the UI labels make it clear whose perspective is shown.

**Step 2: Add perspective label to match cards/detail**

In `renderMatchCards()` and `renderDetailLines()`, consider adding a small label like "From [Player 1]'s side" to make the perspective unambiguous. The grand total already says "Wheel side" which works for 5-player. For 4-player, update to show the team name.

In `renderGrandTotal()` line ~802, change "Wheel side" to dynamically reflect the format:

```js
const sideLabel = +state.gameType === 4
  ? `${pname(0)} + ${pname(1)}`
  : 'Wheel side';
container.innerHTML = `
  <div class="grand-amount ${cls}">${grand >= 0 ? '+' : ''}$${grand}</div>
  <div class="grand-subtitle">${sideLabel} · Through ${lastScoredHole} hole${lastScoredHole !== 1 ? 's' : ''}</div>`;
```

**Step 3: Commit**

```bash
git add app.js
git commit -m "fix: dynamic perspective label for 4-player vs 5-player formats"
```
