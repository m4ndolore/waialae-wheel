# Press Lifecycle v3 — Exact Spec Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite press creation and lifecycle logic to match the owner's exact specification, and improve the detail tab to show actual scores in a table layout.

**Architecture:** Replace `runSegment()` and `buildLines()` with logic that: (a) suppresses overall presses, (b) determines `pressWinningTeam` from each press's own standing, (c) applies hole 9 / back-9 gate / hole 18 rules from that team's perspective. Then redesign the detail tab expanded view to show a score table instead of just win/loss dots.

**Tech Stack:** Vanilla JS, no build system, no tests. Manual browser testing.

---

## Discrepancies Between Current Code and Spec

| # | Issue | Current | Spec |
|---|-------|---------|------|
| 1 | Overall presses | Created by `runSegment` | No overall presses — only front and back lines can press |
| 2 | Press perspective | Uses teamA as implicit "team_down" | Determine `pressWinningTeam` from the press's own running status |
| 3 | Front press tied at hole 9 | Carries into back 9 | Closes permanently with payout 0, does NOT carry |
| 4 | Front press hole 9 rule | From team_down (teamA) perspective | From `pressWinningTeam` perspective |
| 5 | Back-9 gate perspective | From teamA perspective | From `pressWinningTeam` perspective |
| 6 | Back press lifecycle | Uses back match result to settle | Uses hole 18 result from `pressWinningTeam` perspective |
| 7 | Back press tied at hole 18 | Not handled separately | Closes permanently with payout 0 |
| 8 | Overall presses in settlement | Settled via back match result | Should not exist |

## Key Perspective Rule

`resultForHole()` returns +1 when teamA wins, -1 when teamA loses. A press's `status[h]` tracks the running total from teamA's perspective (positive = teamA winning the press).

To determine `pressWinningTeam`:
- `status > 0` → teamA is winning the press
- `status < 0` → teamB is winning the press
- `status === 0` → press is tied

To check if `pressWinningTeam` won a specific hole:
- If pressWinningTeam is teamA: hole result > 0 means they won
- If pressWinningTeam is teamB: hole result < 0 means they won

So the check is: `pressWinningTeam won the hole` iff `sign(pressStanding) === sign(holeResult)`.
And: `pressWinningTeam lost the hole` iff `sign(pressStanding) !== sign(holeResult) && holeResult !== 0`.

---

## Task 1: Suppress overall presses

**Files:**
- Modify: `app.js` — `runSegment()` (~line 207)

**Step 1: Add a `pressable` parameter to `runSegment`**

The overall line should still be created (it's a main betting line), but presses should not spawn from it. Add a parameter to control press creation:

```js
function runSegment(game, matchIndex, name, start, end, value, pressable) {
  const lines = [], active = [];
  let pending = [], count = 0;
  const maxPresses = state.maxPresses ?? 0;
  const main = {name, kind:'main', start, end, value, status:{}, final:null};
  lines.push(main); active.push(main);
  for (let h = start; h <= end; h++) {
    pending.filter(x => x.h === h).forEach(() => {
      if (maxPresses > 0 && count >= maxPresses) return;
      count++;
      const pr = {name:`${name} Press ${count}`, kind:'press', start:h, end, value:state.baseBet, status:{}, final:null, note:''};
      lines.push(pr); active.push(pr);
    });
    const r = resultForHole(h-1, game, matchIndex);
    if (r === null) continue;
    active.forEach(line => {
      if (h < line.start || h > line.end) return;
      const prev = h === line.start ? 0 : (line.status[h-1] ?? 0);
      line.status[h] = prev + r;
    });
    if (pressable) {
      active.forEach(line => {
        if (line.status[h] !== undefined && line.status[h] <= -2 && h < end) {
          pending.push({h: h+1, from: line.name});
        }
      });
    }
  }
  return lines;
}
```

**Step 2: Update `buildLines()` calls**

```js
const front = runSegment(game, matchIndex, 'Front', 1, 9, state.baseBet, true);
const back = runSegment(game, matchIndex, 'Back', 10, 18, state.baseBet, true);
const overall = runSegment(game, matchIndex, 'Overall', 1, 18, state.baseBet * 2, false);
```

**Step 3: Commit**

```bash
git add app.js
git commit -m "fix: suppress overall presses — only front and back can press"
```

---

## Task 2: Rewrite front press hole 9 lifecycle

**Files:**
- Modify: `app.js` — `buildLines()` front press section (~line 242-272)

Replace the current front press hole 9 logic with the correct spec:

```js
  // ── Front press: hole 9 lifecycle ──
  const h9 = resultForHole(8, game, matchIndex);
  front.forEach(line => {
    if (line.kind !== 'press') return;
    if (h9 === null) return;

    // Evaluate press standing at end of hole 9
    const pressStanding = line.status[9] ?? 0;

    // If press is tied at hole 9, close permanently — does not carry
    if (pressStanding === 0) {
      line.final = {state: 'pushed at 9', amount: 0};
      return;
    }

    // pressWinningTeam: positive standing = teamA winning, negative = teamB winning
    // Check if pressWinningTeam won hole 9:
    //   same sign means pressWinningTeam won the hole
    const pwWonH9 = Math.sign(pressStanding) === Math.sign(h9);
    const pwLostH9 = !pwWonH9 && h9 !== 0;

    if (pwWonH9) {
      // pressWinningTeam won hole 9 → double and carry to back-9 gate
      line.value *= 2;
      line.note = 'doubled at 9';
    } else if (pwLostH9) {
      // pressWinningTeam lost hole 9 → erase
      line.final = {state: 'erased at 9', amount: 0};
      return;
    } else {
      // hole 9 tied → carry at current value to back-9 gate
      line.note = 'carried at 9';
    }

    // Lock and carry: extend press status through back 9
    // (do NOT extend line.end — the press itself stays a front press,
    //  but we track status to know it's carried)
    line.carried = true;
    line.pressWinnerSign = Math.sign(pressStanding);
  });
```

Note: we no longer extend the press through holes 10-18 by recalculating status. The press's own standing is locked at hole 9. The back-9 gate uses the back main line result, not the press's continued play.

**Step 3: Commit**

```bash
git add app.js
git commit -m "fix: front press hole 9 — use pressWinningTeam perspective, tied press does not carry"
```

---

## Task 3: Rewrite front press back-9 gate

**Files:**
- Modify: `app.js` — `buildLines()` back-9 gate section (~line 274-299)

Replace the current unified back-match settlement with the correct front press gate:

```js
  // ── Front press: back-9 gate ──
  // Only applies to carried front presses.
  // Uses BACK_9 main line result for the SAME scoring category.
  const backMain = back.find(l => l.kind === 'main');
  const backResult = backMain?.status[18]; // positive = teamA winning back
  front.forEach(line => {
    if (line.kind !== 'press' || line.final || !line.carried) return;
    if (backResult === undefined) return; // back 9 not complete yet

    // Evaluate from pressWinningTeam's perspective
    // line.pressWinnerSign: +1 if teamA was winning press, -1 if teamB
    const pwSign = line.pressWinnerSign;

    if (backResult === 0) {
      // pressWinningTeam tied back → pay at current value
      line.final = {state: 'paid (tied back)', amount: pwSign > 0 ? line.value : -line.value};
      return;
    }

    const pwWonBack = Math.sign(backResult) === pwSign;

    if (pwWonBack) {
      // pressWinningTeam won back → double and pay
      line.value *= 2;
      line.final = {state: 'doubled (won back)', amount: pwSign > 0 ? line.value : -line.value};
    } else {
      // pressWinningTeam lost back → erase
      line.final = {state: 'erased (lost back)', amount: 0};
    }
  });
```

**Step 2: Commit**

```bash
git add app.js
git commit -m "fix: front press back-9 gate — perspective-correct, no back press involvement"
```

---

## Task 4: Rewrite back press hole 18 lifecycle

**Files:**
- Modify: `app.js` — replace the current back/overall press settlement section

The back press lifecycle is separate from the front press lifecycle. Remove the old unified settlement and replace with:

```js
  // ── Back press: hole 18 lifecycle ──
  const h18 = resultForHole(17, game, matchIndex);
  back.forEach(line => {
    if (line.kind !== 'press' || line.final) return;
    if (h18 === null) return;

    // Evaluate press standing at end of hole 18
    const pressStanding = line.status[18] ?? 0;

    // If press is tied at hole 18, close permanently with payout 0
    if (pressStanding === 0) {
      line.final = {state: 'pushed at 18', amount: 0};
      return;
    }

    // pressWinningTeam perspective
    const pwSign = Math.sign(pressStanding);
    const pwWonH18 = Math.sign(h18) === pwSign;
    const pwLostH18 = Math.sign(h18) === -pwSign;

    if (pwWonH18) {
      // pressWinningTeam won hole 18 → double and pay
      line.value *= 2;
      line.final = {state: 'doubled at 18', amount: pwSign > 0 ? line.value : -line.value};
    } else if (pwLostH18) {
      // pressWinningTeam lost hole 18 → erase
      line.final = {state: 'erased at 18', amount: 0};
    } else {
      // hole 18 tied → pay at current value
      line.final = {state: 'paid at 18', amount: pwSign > 0 ? line.value : -line.value};
    }
  });
```

Note: Overall presses no longer exist (suppressed in Task 1), so we don't need to handle them here.

**Step 2: Commit**

```bash
git add app.js
git commit -m "fix: back press hole 18 — pressWinningTeam perspective, tied = payout 0"
```

---

## Task 5: Clean up buildLines() and remove stale code

**Files:**
- Modify: `app.js` — `buildLines()`

**Step 1: Remove the old unified back-match settlement block**

The old `[...front, ...back, ...overall].forEach` block that checked `backResult` should be fully replaced by Tasks 3 and 4. Remove any remnants.

**Step 2: Remove front press back-9 extension code**

The old code that extended front presses through holes 10-18 (`line.end = 18`, status recalculation through back 9) is no longer needed. Front presses lock at hole 9 and the gate uses the back main line result. Remove the loop that set `line.status[h]` for h=10..18 and `line.end = 18`.

**Step 3: Verify main line settlement is unchanged**

The main line settlement block should still work:
```js
  [...front, ...back, ...overall].forEach(line => {
    if (line.kind !== 'main') return;
    const fs = line.status[line.end];
    if (fs === undefined) return;
    line.final = {state:'settled', amount: fs > 0 ? line.value : fs < 0 ? -line.value : 0};
  });
```

**Step 4: Final `buildLines()` should look like:**

```js
function buildLines(game, matchIndex) {
  const front = runSegment(game, matchIndex, 'Front', 1, 9, state.baseBet, true);
  const back = runSegment(game, matchIndex, 'Back', 10, 18, state.baseBet, true);
  const overall = runSegment(game, matchIndex, 'Overall', 1, 18, state.baseBet * 2, false);

  // ── Front press: hole 9 lifecycle ──
  // [Task 2 code]

  // ── Front press: back-9 gate ──
  // [Task 3 code]

  // ── Back press: hole 18 lifecycle ──
  // [Task 4 code]

  // ── Main line settlement ──
  [...front, ...back, ...overall].forEach(line => {
    if (line.kind !== 'main') return;
    const fs = line.status[line.end];
    if (fs === undefined) return;
    line.final = {state:'settled', amount: fs > 0 ? line.value : fs < 0 ? -line.value : 0};
  });

  return [...front, ...back, ...overall];
}
```

**Step 5: Commit**

```bash
git add app.js
git commit -m "refactor: clean up buildLines — remove stale settlement code"
```

---

## Task 6: Update at-risk banners

**Files:**
- Modify: `app.js` — `renderAtRiskBanner()` (~line 793)

**Step 1: Update hole 9 banner**

Count only front presses (not overall). Update text:
```
"Front presses at risk. Press winner wins hole 9 = double & carry. Loses = erased. Tied press = closed."
```

**Step 2: Update hole 18 banner**

Count only back presses. Update text:
```
"Back presses at risk. Press winner wins hole 18 = double & pay. Loses = erased. Tie = pay."
```

**Step 3: Commit**

```bash
git add app.js
git commit -m "fix: update at-risk banners for new press lifecycle rules"
```

---

## Task 7: Improve detail tab — show scores in table layout

**Files:**
- Modify: `app.js` — `renderDetailLines()` (~line 957)
- Modify: `styles.css` — add table styles

**Step 1: Redesign expanded hole-by-hole view**

When a line card is expanded, show a table with columns:
- Hole number
- Team A player 1 net score
- Team A player 2 net score
- Team A result (low net or aggregate depending on game)
- Team B player 1 net score
- Team B player 2 net score
- Team B result
- Hole winner indicator
- Running status

Replace the current `holesHtml` generation in `renderDetailLines()`:

```js
    // Expanded hole-by-hole table
    const m = getMatchups()[+state.activeMatch];
    let holesHtml = '<div class="detail-table">';
    holesHtml += `<div class="detail-table-header">
      <span class="dt-hole">H</span>
      <span class="dt-score">${pname(m.teamA[0]).slice(0,3)}</span>
      <span class="dt-score">${pname(m.teamA[1]).slice(0,3)}</span>
      <span class="dt-team-result">A</span>
      <span class="dt-score">${pname(m.teamB[0]).slice(0,3)}</span>
      <span class="dt-score">${pname(m.teamB[1]).slice(0,3)}</span>
      <span class="dt-team-result">B</span>
      <span class="dt-running">Status</span>
    </div>`;
    for (let h = line.start; h <= Math.min(line.end, findLastScoredHole()); h++) {
      const running = line.status[h];
      if (running === undefined) continue;
      const r = resultForHole(h-1, state.activeGame, +state.activeMatch);

      // Get individual net scores
      const aScores = m.teamA.map(i => net(i, h-1));
      const bScores = m.teamB.map(i => net(i, h-1));

      // Team results for this hole
      let aResult, bResult;
      if (state.activeGame === 'lowNet') {
        aResult = aScores.some(s => s === null) ? '' : Math.min(...aScores);
        bResult = bScores.some(s => s === null) ? '' : Math.min(...bScores);
      } else {
        aResult = aScores.some(s => s === null) ? '' : aScores.reduce((a,b) => a+b, 0);
        bResult = bScores.some(s => s === null) ? '' : bScores.reduce((a,b) => a+b, 0);
      }

      const rCls = r > 0 ? 'win' : r < 0 ? 'loss' : 'push';
      const runCls = running > 0 ? 'positive' : running < 0 ? 'negative' : '';

      holesHtml += `
        <div class="detail-table-row ${rCls}">
          <span class="dt-hole">${h}</span>
          <span class="dt-score">${aScores[0] ?? ''}</span>
          <span class="dt-score">${aScores[1] ?? ''}</span>
          <span class="dt-team-result">${aResult}</span>
          <span class="dt-score">${bScores[0] ?? ''}</span>
          <span class="dt-score">${bScores[1] ?? ''}</span>
          <span class="dt-team-result">${bResult}</span>
          <span class="dt-running ${runCls}">${st(running)}</span>
        </div>`;
    }
    holesHtml += '</div>';
```

**Step 2: Add CSS for detail table**

```css
.detail-table {
  font-size: 12px;
  font-family: var(--font-body);
}
.detail-table-header {
  display: grid;
  grid-template-columns: 28px repeat(3, 1fr) repeat(3, 1fr) 48px;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid var(--divider);
  font-weight: 700;
  color: var(--walnut-light);
  text-transform: uppercase;
  font-size: 10px;
}
.detail-table-row {
  display: grid;
  grid-template-columns: 28px repeat(3, 1fr) repeat(3, 1fr) 48px;
  gap: 2px;
  padding: 4px 0;
  border-bottom: 1px solid var(--divider);
}
.detail-table-row.win { background: rgba(76, 141, 95, 0.08); }
.detail-table-row.loss { background: rgba(139, 69, 69, 0.08); }
.dt-hole { font-weight: 700; color: var(--walnut-light); }
.dt-score { text-align: center; }
.dt-team-result { text-align: center; font-weight: 700; }
.dt-running { text-align: right; font-weight: 700; }
.dt-running.positive { color: var(--green-muted); }
.dt-running.negative { color: var(--burgundy); }
```

**Step 3: Commit**

```bash
git add app.js styles.css
git commit -m "feat: detail tab shows score table with net scores per hole"
```

---

## Task 8: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `gameplay.md`

**Step 1: Update CLAUDE.md domain rules**

Replace press rules with:
```markdown
- **Press creation:** Only FRONT_9 and BACK_9 lines create presses. No OVERALL presses.
- **Press perspective:** Each press determines its pressWinningTeam from its own running status. Lifecycle gates evaluate from that team's perspective.
- **Front press hole 9:** Tied press = closed (payout 0, no carry). pressWinningTeam wins hole 9 = double & carry. pressWinningTeam loses hole 9 = erased. Hole 9 tied = carry at current value.
- **Front press back-9 gate:** Uses BACK_9 main line result for same scoring category. pressWinningTeam wins back = double & pay. Ties back = pay at value. Loses back = erased.
- **Back press hole 18:** Tied press = closed (payout 0). pressWinningTeam wins hole 18 = double & pay. pressWinningTeam loses hole 18 = erased. Hole 18 tied = pay at value.
```

**Step 2: Update gameplay.md**

Rewrite the press lifecycle sections to match.

**Step 3: Commit**

```bash
git add CLAUDE.md gameplay.md
git commit -m "docs: update press lifecycle rules to v3 spec"
```
