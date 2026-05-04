// ── Waialae Game Bet Tracker v2 ───────────────────────────────────
// All game logic preserved from original. UI rebuilt for mobile-first tabs.

const HOLES = [...Array(18)].map((_, i) => i + 1);
const WAIALAE_HCP = [13,11,5,17,1,9,3,7,15,14,10,6,12,8,2,18,4,16];
// Waialae CC par: front 36, back 34, total 70
const WAIALAE_PAR = [4,4,4,4,4,4,3,4,5,4,3,4,3,4,4,4,4,4];

const blankScores = (n) => Array.from({length:18}, () => Array.from({length:n}, () => null));

const defaultState = {
  gameType: 4,
  players: [
    {name:'Magoo', hcp:7},
    {name:'Ali', hcp:11},
    {name:'Gary', hcp:14},
    {name:'Sang', hcp:26},
    {name:'Player 5', hcp:18}
  ],
  wheelA: 0,
  wheelB: 1,
  baseBet: 10,
  currentHole: 1,
  activeMatch: 0,
  activeGame: 'lowNet',
  activeTab: 'setup',
  maxPresses: 0,
  scores: blankScores(5),
  savedGroups: []
};

let state = JSON.parse(localStorage.getItem('waialaeWheelTrackerV2') || 'null') || structuredClone(defaultState);
// Ensure new fields exist on old saved state
if (!state.activeTab) state.activeTab = 'setup';
if (!state.savedGroups) state.savedGroups = [];
if (state.hcpLocked === undefined) state.hcpLocked = false;
if (state.maxPresses === undefined) state.maxPresses = 0;

function syncViewportHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}

syncViewportHeight();
window.addEventListener('resize', syncViewportHeight);
window.addEventListener('orientationchange', syncViewportHeight);
window.addEventListener('pageshow', syncViewportHeight);

// ── Persistence: localStorage + IndexedDB backup ─────────────────

const DB_NAME = 'waialaeWheel';
const DB_STORE = 'state';
const DB_KEY = 'current';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveToIDB(data) {
  openDB().then(db => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(data, DB_KEY);
  }).catch(() => {}); // silent fallback
}

function loadFromIDB() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }).catch(() => null);
}

function save() {
  const json = JSON.stringify(state);
  localStorage.setItem('waialaeWheelTrackerV2', json);
  saveToIDB(json);
}

// On load: if localStorage was wiped but IDB survived, restore from IDB
(async function restoreIfNeeded() {
  const lsData = localStorage.getItem('waialaeWheelTrackerV2');
  if (!lsData || lsData === 'null') {
    const idbData = await loadFromIDB();
    if (idbData) {
      localStorage.setItem('waialaeWheelTrackerV2', idbData);
      state = JSON.parse(idbData);
      if (!state.activeTab) state.activeTab = 'setup';
      if (!state.savedGroups) state.savedGroups = [];
      switchTab(state.activeTab);
    }
  }
})();

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `waialae-wheel-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importState(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.players && imported.scores) {
        state = imported;
        if (!state.activeTab) state.activeTab = 'setup';
        if (!state.savedGroups) state.savedGroups = [];
        save();
        switchTab(state.activeTab);
      }
    } catch (_) { alert('Invalid backup file.'); }
  };
  reader.readAsText(file);
}
function activePlayers() { return state.players.slice(0, +state.gameType); }
function pname(i) { return state.players[i]?.name || `Player ${i+1}`; }

// ── Golfer Database (localStorage) ───────────────────────────────

const GOLFER_DB_KEY = 'waialaeGolferDB';

function loadGolferDB() {
  try { return JSON.parse(localStorage.getItem(GOLFER_DB_KEY)) || {}; }
  catch { return {}; }
}

function saveGolfer(name, hcp) {
  if (!name || name.startsWith('Player ')) return;
  const db = loadGolferDB();
  db[name.toLowerCase()] = { name, hcp };
  localStorage.setItem(GOLFER_DB_KEY, JSON.stringify(db));
}

function lookupGolfer(name) {
  if (!name) return null;
  const db = loadGolferDB();
  return db[name.toLowerCase()] || null;
}

// ── Game Logic (unchanged) ────────────────────────────────────────

function dotOnHole(playerIndex, hole) {
  const players = activePlayers();
  const low = Math.min(...players.map(p => +p.hcp || 0));
  const diff = Math.max(0, (+state.players[playerIndex].hcp || 0) - low);
  const holeHcp = WAIALAE_HCP[hole - 1];
  // Full laps give a dot on every hole; remainder gives extra dot on hardest holes
  const full = Math.floor(diff / 18);
  const rem = diff % 18;
  return full + (rem >= holeHcp ? 1 : 0);
}

function net(playerIndex, hidx) {
  const g = state.scores[hidx]?.[playerIndex];
  if (g === null || g === '' || g === undefined) return null;
  return +g - dotOnHole(playerIndex, hidx + 1);
}

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

function resultForHole(hidx, game, matchIndex) {
  const m = getMatchups()[matchIndex];
  if (!m) return null;
  const an = m.teamA.map(i => net(i, hidx));
  const bn = m.teamB.map(i => net(i, hidx));
  if ([...an, ...bn].some(v => v === null)) return null;
  if (game === 'lowNet') {
    const a = Math.min(...an), b = Math.min(...bn);
    return a < b ? 1 : b < a ? -1 : 0;
  }
  const aa = an[0] + an[1], bb = bn[0] + bn[1];
  return aa < bb ? 1 : bb < aa ? -1 : 0;
}

function st(v) { return v === 0 ? 'AS' : v > 0 ? `${v}UP` : `${Math.abs(v)}DN`; }

function runSegment(game, matchIndex, name, start, end, value, pressable) {
  const lines = [], active = [];
  let pending = [], count = 0;
  const maxPresses = state.maxPresses ?? 0; // 0 = unlimited
  const main = {name, kind:'main', start, end, value, status:{}, final:null};
  lines.push(main); active.push(main);
  for (let h = start; h <= end; h++) {
    pending.filter(x => x.h === h).forEach(() => {
      if (maxPresses > 0 && count >= maxPresses) return; // cap reached
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

function buildLines(game, matchIndex) {
  const front = runSegment(game, matchIndex, 'Front', 1, 9, state.baseBet, true);
  const back = runSegment(game, matchIndex, 'Back', 10, 18, state.baseBet, true);
  const overall = runSegment(game, matchIndex, 'Overall', 1, 18, state.baseBet * 2, false);

  // ── Front press: hole 9 lifecycle ──
  // Determine pressWinningTeam from each press's own standing.
  // status > 0 → teamA winning press. status < 0 → teamB winning.
  // pressWinningTeam "won the hole" iff sign(standing) === sign(holeResult).
  const h9 = resultForHole(8, game, matchIndex);
  front.forEach(line => {
    if (line.kind !== 'press') return;
    if (h9 === null) return;

    const pressStanding = line.status[9] ?? 0;

    // Tied press at hole 9 → closed permanently, does not carry
    if (pressStanding === 0) {
      line.final = {state: 'pushed at 9', amount: 0};
      return;
    }

    const pwSign = Math.sign(pressStanding);
    const pwWonH9 = Math.sign(h9) === pwSign;
    const pwLostH9 = Math.sign(h9) === -pwSign;

    if (pwWonH9) {
      // pressWinningTeam won hole 9 → double and carry to back-9 gate
      line.value *= 2;
      line.note = 'doubled at 9';
    } else if (pwLostH9) {
      // pressWinningTeam lost hole 9 → erased
      line.final = {state: 'erased at 9', amount: 0};
      return;
    } else {
      // hole 9 tied → carry at current value
      line.note = 'carried at 9';
    }

    // Lock press and mark for back-9 gate
    line.carried = true;
    line.pressWinnerSign = pwSign;
  });

  // ── Front press: back-9 gate ──
  // Uses BACK_9 main line result for the same scoring category.
  // Evaluated from pressWinningTeam's perspective.
  const backMain = back.find(l => l.kind === 'main');
  const backResult = backMain?.status[18];
  front.forEach(line => {
    if (line.kind !== 'press' || line.final || !line.carried) return;
    if (backResult === undefined) return; // back 9 not complete

    const pwSign = line.pressWinnerSign;

    if (backResult === 0) {
      // back tied → pay at current value
      line.final = {state: 'paid (tied back)', amount: pwSign > 0 ? line.value : -line.value};
      return;
    }

    if (Math.sign(backResult) === pwSign) {
      // pressWinningTeam won back → double and pay
      line.value *= 2;
      line.final = {state: 'doubled (won back)', amount: pwSign > 0 ? line.value : -line.value};
    } else {
      // pressWinningTeam lost back → erased
      line.final = {state: 'erased (lost back)', amount: 0};
    }
  });

  // ── Back press: hole 18 lifecycle ──
  // Separate from front press lifecycle. Uses hole 18 result only.
  const h18 = resultForHole(17, game, matchIndex);
  back.forEach(line => {
    if (line.kind !== 'press' || line.final) return;
    if (h18 === null) return;

    const pressStanding = line.status[18] ?? 0;

    // Tied press at hole 18 → closed permanently
    if (pressStanding === 0) {
      line.final = {state: 'pushed at 18', amount: 0};
      return;
    }

    const pwSign = Math.sign(pressStanding);
    const pwWonH18 = Math.sign(h18) === pwSign;
    const pwLostH18 = Math.sign(h18) === -pwSign;

    if (pwWonH18) {
      // pressWinningTeam won hole 18 → double and pay
      line.value *= 2;
      line.final = {state: 'doubled at 18', amount: pwSign > 0 ? line.value : -line.value};
    } else if (pwLostH18) {
      // pressWinningTeam lost hole 18 → erased
      line.final = {state: 'erased at 18', amount: 0};
    } else {
      // hole 18 tied → pay at current value
      line.final = {state: 'paid at 18', amount: pwSign > 0 ? line.value : -line.value};
    }
  });

  // ── Main line settlement (unchanged) ──
  [...front, ...back, ...overall].forEach(line => {
    if (line.kind !== 'main') return;
    const fs = line.status[line.end];
    if (fs === undefined) return;
    line.final = {state:'settled', amount: fs > 0 ? line.value : fs < 0 ? -line.value : 0};
  });
  return [...front, ...back, ...overall];
}

// ── Tab Navigation ────────────────────────────────────────────────

function switchTab(tab) {
  state.activeTab = tab;
  save();
  document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.querySelectorAll('.nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  // Render the active tab
  if (tab === 'setup') renderSetup();
  else if (tab === 'scorecard') renderScorecard();
  else if (tab === 'matches') renderMatches();
  else if (tab === 'detail') renderDetail();
  else if (tab === 'settlement') renderSettlement();
}

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Setup Tab ─────────────────────────────────────────────────────

function renderSetup() {
  renderSavedGroups();
  renderGameTypePills();
  renderPlayerCards();
  renderBetStepper();
  renderPressLimit();
  renderGoLive();
  renderPastRounds();
}

function renderSavedGroups() {
  const container = document.getElementById('savedGroups');
  let html = '';
  state.savedGroups.forEach((g, i) => {
    const names = g.players.slice(0, g.gameType).map(p => p.name.slice(0,3)).join(' / ');
    html += `<button class="group-chip" data-index="${i}">${names}</button>`;
  });
  html += `<button class="group-chip group-chip-add" id="saveGroup">+ Save</button>`;
  container.innerHTML = html;

  container.querySelectorAll('.group-chip[data-index]').forEach(chip => {
    chip.addEventListener('click', () => {
      const g = state.savedGroups[+chip.dataset.index];
      state.gameType = g.gameType;
      state.players = structuredClone(g.players);
      state.wheelA = g.wheelA;
      state.wheelB = g.wheelB;
      state.baseBet = g.baseBet;
      save(); renderSetup();
    });
    let holdTimer;
    chip.addEventListener('touchstart', (e) => {
      holdTimer = setTimeout(() => {
        if (confirm('Delete this saved group?')) {
          state.savedGroups.splice(+chip.dataset.index, 1);
          save(); renderSavedGroups();
        }
      }, 600);
    }, {passive: true});
    chip.addEventListener('touchend', () => clearTimeout(holdTimer));
    chip.addEventListener('touchmove', () => clearTimeout(holdTimer));
  });

  document.getElementById('saveGroup')?.addEventListener('click', () => {
    state.savedGroups.push({
      players: structuredClone(state.players),
      gameType: state.gameType,
      wheelA: state.wheelA,
      wheelB: state.wheelB,
      baseBet: state.baseBet
    });
    save(); renderSavedGroups();
  });
}

function renderGameTypePills() {
  const pills = document.querySelectorAll('#gameTypePills .pill');
  pills.forEach(p => {
    p.classList.toggle('active', +p.dataset.value === +state.gameType);
    p.onclick = () => {
      state.gameType = +p.dataset.value;
      if (state.gameType === 4) { state.activeMatch = 0; }
      if (state.gameType === 5 && state.wheelB === state.wheelA) { state.wheelB = (state.wheelA + 1) % 5; }
      save(); renderSetup();
    };
  });
}

function renderHcpLock() {
  const btn = document.getElementById('hcpLockBtn');
  btn.textContent = state.hcpLocked ? '\u{1F512}' : '\u{1F513}';
  btn.classList.toggle('locked', state.hcpLocked);
  btn.onclick = () => { state.hcpLocked = !state.hcpLocked; save(); renderHcpLock(); renderPlayerCards(); };
}

function renderPlayerCards() {
  renderHcpLock();
  const container = document.getElementById('playerCards');
  const n = +state.gameType;
  let html = '';
  for (let i = 0; i < n; i++) {
    if (n === 4 && i === 0) html += `<div class="team-divider">Team A</div>`;
    if (n === 4 && i === 2) html += `<div class="team-divider">Team B</div>`;
    const isWheel = (n === 5) && (i === +state.wheelA || i === +state.wheelB);
    html += `
      <div class="player-card">
        ${n === 5 ? `<div class="player-crown ${isWheel ? 'active' : ''}" data-player="${i}" title="Wheel player">&#9813;</div>` : ''}
        <input class="player-name" type="text" value="${state.players[i].name}" data-player="${i}" autocomplete="off" autocorrect="off">
        <div class="hcp-input-wrap ${state.hcpLocked ? 'disabled' : ''}">
          <input class="hcp-input" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="54" value="${state.players[i].hcp}" data-player="${i}" ${state.hcpLocked ? 'disabled' : ''}>
        </div>
      </div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('.player-name').forEach(input => {
    let debounceTimer;
    input.addEventListener('input', (e) => {
      const pi = +e.target.dataset.player;
      state.players[pi].name = e.target.value;
      save();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const golfer = lookupGolfer(e.target.value);
        if (golfer && !state.hcpLocked) {
          state.players[pi].hcp = golfer.hcp;
          save();
          const hcpInput = container.querySelector(`.hcp-input[data-player="${pi}"]`);
          if (hcpInput) hcpInput.value = golfer.hcp;
        }
      }, 400);
    });
  });

  container.querySelectorAll('.hcp-input').forEach(input => {
    input.addEventListener('focus', (e) => e.target.select());
    input.addEventListener('change', (e) => {
      const pi = +e.target.dataset.player;
      const val = Math.max(0, Math.min(54, parseInt(e.target.value, 10) || 0));
      e.target.value = val;
      state.players[pi].hcp = val;
      saveGolfer(state.players[pi].name, val);
      save();
    });
    input.addEventListener('blur', (e) => {
      const pi = +e.target.dataset.player;
      const val = Math.max(0, Math.min(54, parseInt(e.target.value, 10) || 0));
      e.target.value = val;
      state.players[pi].hcp = val;
      saveGolfer(state.players[pi].name, val);
      save();
    });
  });

  container.querySelectorAll('.player-crown').forEach(crown => {
    crown.addEventListener('click', () => {
      const pi = +crown.dataset.player;
      if (pi === +state.wheelA) {
        state.wheelA = state.wheelB;
        state.wheelB = pi;
      } else if (pi === +state.wheelB) {
        // already wheel, do nothing
      } else {
        state.wheelA = state.wheelB;
        state.wheelB = pi;
      }
      save(); renderPlayerCards();
    });
  });
}

function renderBetStepper() {
  document.getElementById('betValue').textContent = `$${state.baseBet}`;
  document.querySelectorAll('.preset').forEach(p => {
    p.classList.toggle('active', +p.dataset.value === state.baseBet);
  });
}

document.getElementById('betMinus').addEventListener('click', () => {
  state.baseBet = Math.max(1, state.baseBet - 5);
  save(); renderBetStepper();
});
document.getElementById('betPlus').addEventListener('click', () => {
  state.baseBet += 5;
  save(); renderBetStepper();
});
document.querySelectorAll('.preset').forEach(p => {
  p.addEventListener('click', () => {
    state.baseBet = +p.dataset.value;
    save(); renderBetStepper();
  });
});

function renderPressLimit() {
  const hint = document.getElementById('pressLimitHint');
  hint.textContent = state.maxPresses === 0
    ? 'Presses spawn unlimited — can get wild'
    : `Max ${state.maxPresses} presses per line (front, back, overall)`;
  document.querySelectorAll('#pressLimitOptions .preset').forEach(p => {
    p.classList.toggle('active', +p.dataset.value === state.maxPresses);
  });
}

document.querySelectorAll('#pressLimitOptions .preset').forEach(p => {
  p.addEventListener('click', () => {
    state.maxPresses = +p.dataset.value;
    save(); renderPressLimit();
  });
});

document.getElementById('startRound').addEventListener('click', () => {
  activePlayers().forEach(p => saveGolfer(p.name, p.hcp));
  switchTab('scorecard');
});
document.getElementById('exportData').addEventListener('click', exportState);
document.getElementById('importData').addEventListener('change', (e) => {
  if (e.target.files[0]) importState(e.target.files[0]);
});
document.getElementById('resetRound').addEventListener('click', () => {
  if (confirm('Reset the entire round? All scores will be lost.')) {
    archiveCurrentRound();
    const saved = state.savedGroups;
    const archived = state.archivedRounds || [];
    state = structuredClone(defaultState);
    state.savedGroups = saved;
    state.archivedRounds = archived;
    save(); switchTab('setup');
  }
});

// ── Scorecard Tab ─────────────────────────────────────────────────

let numpadTarget = null;
let autoAdvanceTimer = null;

function renderScorecard() {
  renderHoleProgress();
  renderHoleDisplay();
  renderScoreRows();
  renderResultsBanner();
}

function renderHoleProgress() {
  const container = document.getElementById('holeProgress');
  let html = '';
  for (let h = 1; h <= 18; h++) {
    const idx = h - 1;
    const filled = activePlayers().every((_, pi) => state.scores[idx][pi] !== null);
    const current = h === state.currentHole;
    html += `<button class="hole-dot ${filled ? 'filled' : ''} ${current ? 'current' : ''}" data-hole="${h}"></button>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.hole-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      state.currentHole = +dot.dataset.hole;
      save(); renderScorecard();
    });
  });
}

function renderHoleDisplay() {
  const h = state.currentHole;
  document.getElementById('holeNum').textContent = h;
  document.getElementById('holeMeta').textContent = `Hdcp ${WAIALAE_HCP[h-1]} \u00b7 Par ${WAIALAE_PAR[h-1]}`;
}

function renderScoreRows() {
  const container = document.getElementById('scoreRows');
  const h = state.currentHole, idx = h - 1;
  const n = +state.gameType;
  let html = '';
  for (let i = 0; i < n; i++) {
    const gross = state.scores[idx][i];
    const hasScore = gross !== null;
    const dots = dotOnHole(i, h);
    const netVal = net(i, idx);
    const dotCls = dots === 0 ? 'no-dot' : dots >= 2 ? 'double-dot' : '';
    html += `
      <div class="score-row ${hasScore ? 'has-score' : ''}" data-player="${i}">
        <span class="score-player">${pname(i)}</span>
        <span class="score-dot ${dotCls}"></span>
        <span class="score-gross ${hasScore ? '' : 'empty'}">${hasScore ? gross : 'tap'}</span>
        <span class="score-net">${netVal !== null ? 'net ' + netVal : ''}</span>
      </div>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.score-row').forEach(row => {
    row.addEventListener('click', () => openNumpad(+row.dataset.player));
  });
}

function openNumpad(playerIndex) {
  numpadTarget = playerIndex;
  const overlay = document.getElementById('numpadOverlay');
  overlay.classList.remove('numpad-hidden');
  document.getElementById('numpadBackdrop').classList.remove('numpad-hidden');
  document.getElementById('numpadPlayer').textContent = pname(playerIndex);
  const idx = state.currentHole - 1;
  const val = state.scores[idx][playerIndex];
  document.getElementById('numpadValue').textContent = val !== null ? val : '';
}

function closeNumpad() {
  document.getElementById('numpadOverlay').classList.add('numpad-hidden');
  document.getElementById('numpadBackdrop').classList.add('numpad-hidden');
  numpadTarget = null;
}

document.querySelectorAll('.numpad-key').forEach(key => {
  key.addEventListener('click', () => {
    if (numpadTarget === null) return;
    const k = key.dataset.key;
    const idx = state.currentHole - 1;

    if (k === 'clear') {
      state.scores[idx][numpadTarget] = null;
      document.getElementById('numpadValue').textContent = '';
      save(); renderScoreRows();
      return;
    }

    if (k === 'next') {
      const n = +state.gameType;
      if (numpadTarget < n - 1) {
        openNumpad(numpadTarget + 1);
      } else {
        closeNumpad();
        save();
        renderScorecard();
        checkAutoAdvance();
      }
      return;
    }

    // Number key
    const current = state.scores[idx][numpadTarget];
    const str = (current !== null ? String(current) : '') + k;
    const num = parseInt(str, 10);
    if (num <= 20) {
      state.scores[idx][numpadTarget] = num;
      document.getElementById('numpadValue').textContent = num;
      save(); renderScoreRows(); renderResultsBanner();
    }
  });
});

// Close numpad on tap outside (backdrop)
document.getElementById('numpadBackdrop').addEventListener('click', () => closeNumpad());

function checkAutoAdvance() {
  const idx = state.currentHole - 1;
  const n = +state.gameType;
  const allFilled = activePlayers().every((_, pi) => state.scores[idx][pi] !== null);
  if (allFilled && state.currentHole < 18) {
    renderResultsBanner();
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => {
      state.currentHole++;
      save(); renderScorecard();
    }, 2000);
  }
}

function getLineStatuses(game, matchIndex, throughHole) {
  const lines = buildLines(game, matchIndex);
  // Group by segment: Front lines, Back lines, Overall lines
  const segments = {};
  lines.forEach(line => {
    if (line.final) return;
    if (throughHole < line.start) return;
    const lastH = Math.max(...Object.keys(line.status).filter(h => +h <= throughHole).map(Number), 0);
    const val = lastH ? (line.status[lastH] ?? 0) : 0;
    const seg = line.name.startsWith('Front') ? 'F' : line.name.startsWith('Back') ? 'B' : 'O';
    if (!segments[seg]) segments[seg] = [];
    segments[seg].push(st(val));
  });
  return segments;
}

function renderResultsBanner() {
  const banner = document.getElementById('resultsBanner');
  const idx = state.currentHole - 1;
  const allFilled = activePlayers().every((_, pi) => state.scores[idx][pi] !== null);

  if (!allFilled) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const matches = getMatchups();
  const throughHole = state.currentHole;
  let html = '';

  matches.forEach((m, mi) => {
    const teamANames = m.teamA.map(i => pname(i).split(' ')[0]).join(' + ');
    const teamBNames = m.teamB.map(i => pname(i).split(' ')[0]).join(' + ');

    const lnSegs = getLineStatuses('lowNet', mi, throughHole);
    const agSegs = getLineStatuses('aggregate', mi, throughHole);

    html += `
      <div class="banner-match-group">
        <div class="banner-team-label">${teamANames} vs ${teamBNames}</div>`;

    const segLabels = {F:'Front', B:'Back', O:'Overall'};
    ['lowNet','aggregate'].forEach(game => {
      const segs = game === 'lowNet' ? lnSegs : agSegs;
      const gameLabel = game === 'lowNet' ? 'Low' : 'Agg';
      ['F','B','O'].forEach(seg => {
        if (!segs[seg]) return;
        const display = segs[seg].map(v => {
          const cls = v.includes('UP') ? 'win' : v.includes('DN') ? 'loss' : 'push';
          return `<span class="${cls}">${v}</span>`;
        }).join(', ');
        html += `
          <div class="banner-match">
            <span class="banner-label">${gameLabel} ${segLabels[seg]}</span>
            <span class="banner-result">${display}</span>
          </div>`;
      });
    });

    html += `</div>`;
  });

  html += `<div class="banner-advance"><button class="btn-stay" id="btnStay">Stay on hole</button></div>`;
  banner.innerHTML = html;
  document.getElementById('btnStay')?.addEventListener('click', () => {
    clearTimeout(autoAdvanceTimer);
  });
}

// Hole navigation
document.getElementById('holePrev').addEventListener('click', () => {
  state.currentHole = Math.max(1, state.currentHole - 1);
  save(); renderScorecard();
});
document.getElementById('holeNext').addEventListener('click', () => {
  state.currentHole = Math.min(18, state.currentHole + 1);
  save(); renderScorecard();
});

// Swipe support for hole navigation
(function() {
  const el = document.getElementById('tab-scorecard');
  let startX = 0, startY = 0;
  el.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, {passive: true});
  el.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && state.currentHole < 18) { state.currentHole++; save(); renderScorecard(); }
      else if (dx > 0 && state.currentHole > 1) { state.currentHole--; save(); renderScorecard(); }
    }
  }, {passive: true});
})();

// ── Matches Tab ───────────────────────────────────────────────────

function renderMatches() {
  renderAtRiskBanner();
  renderGrandTotal();
  renderMatchCards();
}

function renderAtRiskBanner() {
  const banner = document.getElementById('atRiskBanner');
  const h = state.currentHole;
  const matches = getMatchups();

  if (h >= 8 && h <= 9) {
    let pressCount = 0;
    matches.forEach((_, mi) => {
      ['lowNet','aggregate'].forEach(game => {
        const lines = buildLines(game, mi);
        pressCount += lines.filter(l => l.kind === 'press' && l.end <= 9 && !l.final).length;
      });
    });
    if (pressCount > 0) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<strong>Hole 9 approaching</strong> &mdash; ${pressCount} front press${pressCount > 1 ? 'es' : ''} at risk.<br>Press winner wins 9 = double &amp; carry. Loses = erased. Tied press = closed.`;
      return;
    }
  }

  if (h >= 17 && h <= 18) {
    let pressCount = 0;
    matches.forEach((_, mi) => {
      ['lowNet','aggregate'].forEach(game => {
        const lines = buildLines(game, mi);
        pressCount += lines.filter(l => l.kind === 'press' && l.name.startsWith('Back') && !l.final).length;
      });
    });
    if (pressCount > 0) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<strong>Hole 18 approaching</strong> &mdash; ${pressCount} back press${pressCount > 1 ? 'es' : ''} at risk.<br>Press winner wins 18 = double &amp; pay. Loses = erased. Tie = pay.`;
      return;
    }
  }

  banner.classList.add('hidden');
}

function renderGrandTotal() {
  const container = document.getElementById('grandTotal');
  let grand = 0;
  const matches = getMatchups();
  matches.forEach((_, mi) => {
    ['lowNet','aggregate'].forEach(game => {
      const lines = buildLines(game, mi).filter(l => l.final);
      grand += lines.reduce((s, l) => s + (l.final.amount || 0), 0);
    });
  });

  const lastScoredHole = findLastScoredHole();
  const sideLabel = +state.gameType === 4
    ? `${pname(0)} + ${pname(1)}`
    : 'Wheel side';
  const cls = grand > 0 ? 'positive' : grand < 0 ? 'negative' : 'zero';
  container.innerHTML = `
    <div class="grand-amount ${cls}">${grand >= 0 ? '+' : ''}$${grand}</div>
    <div class="grand-subtitle">${sideLabel} &middot; Through ${lastScoredHole} hole${lastScoredHole !== 1 ? 's' : ''}</div>`;
}

function findLastScoredHole() {
  const n = +state.gameType;
  for (let h = 17; h >= 0; h--) {
    if (activePlayers().every((_, pi) => state.scores[h][pi] !== null)) return h + 1;
  }
  return 0;
}

function renderMatchCards() {
  const container = document.getElementById('matchCards');
  const matches = getMatchups();
  let html = '';

  matches.forEach((m, mi) => {
    let matchTotal = 0;
    let lnTotal = 0, agTotal = 0;
    let activeLinesList = [];

    ['lowNet','aggregate'].forEach(game => {
      const lines = buildLines(game, mi);
      const settled = lines.filter(l => l.final);
      const total = settled.reduce((s, l) => s + (l.final.amount || 0), 0);
      if (game === 'lowNet') lnTotal = total; else agTotal = total;
      matchTotal += total;

      // Collect active (unsettled) lines
      lines.filter(l => !l.final).forEach(l => {
        const lastHole = Math.max(...Object.keys(l.status).map(Number), 0);
        const val = lastHole ? l.status[lastHole] : 0;
        activeLinesList.push({
          name: (game === 'lowNet' ? 'LN' : 'AG') + ' ' + l.name,
          status: val !== undefined ? st(val) : 'AS',
          value: l.value,
          kind: l.kind
        });
      });
    });

    const amtCls = matchTotal > 0 ? 'positive' : matchTotal < 0 ? 'negative' : 'zero';
    const lnCls = lnTotal > 0 ? 'positive' : lnTotal < 0 ? 'negative' : '';
    const agCls = agTotal > 0 ? 'positive' : agTotal < 0 ? 'negative' : '';

    html += `
      <div class="match-card" data-match="${mi}">
        <div class="match-card-header">
          <span class="match-card-title">Match ${mi+1}</span>
          <span class="match-card-amount ${amtCls}">${matchTotal >= 0 ? '+' : ''}$${matchTotal}</span>
        </div>
        <div class="match-card-teams">${m.label}</div>
        <div class="match-card-games">
          <div class="game-badge">
            <span class="game-badge-label">Low Net</span>
            <span class="game-badge-value ${lnCls}">${lnTotal >= 0 ? '+' : ''}$${lnTotal}</span>
          </div>
          <div class="game-badge">
            <span class="game-badge-label">Aggregate</span>
            <span class="game-badge-value ${agCls}">${agTotal >= 0 ? '+' : ''}$${agTotal}</span>
          </div>
        </div>`;

    if (activeLinesList.length) {
      html += `<div class="active-lines">`;
      activeLinesList.forEach(al => {
        const sCls = al.status.includes('UP') ? 'up' : al.status.includes('DN') ? 'down' : 'as';
        html += `
          <div class="active-line">
            <span class="line-name">${al.name}${al.kind === 'press' ? ` ($${al.value})` : ''}</span>
            <span class="line-status ${sCls}">${al.status}</span>
          </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.match-card').forEach(card => {
    card.addEventListener('click', () => {
      state.activeMatch = +card.dataset.match;
      save(); switchTab('detail');
    });
  });
}

// ── Detail Tab ────────────────────────────────────────────────────

function renderDetail() {
  renderMatchPills();
  renderGamePills();
  renderDetailLines();
}

function renderMatchPills() {
  const container = document.getElementById('matchPills');
  const matches = getMatchups();
  let html = '';
  matches.forEach((m, i) => {
    html += `<button class="pill ${i === +state.activeMatch ? 'active' : ''}" data-value="${i}">Match ${i+1}</button>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      state.activeMatch = +p.dataset.value;
      save(); renderDetail();
    });
  });
}

function renderGamePills() {
  document.querySelectorAll('#gamePills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === state.activeGame);
    p.onclick = () => { state.activeGame = p.dataset.value; save(); renderDetail(); };
  });
}

function renderDetailLines() {
  const container = document.getElementById('detailLines');
  const lines = buildLines(state.activeGame, +state.activeMatch);

  let html = '';
  let pressDepth = 0;
  lines.forEach((line, li) => {
    if (line.kind === 'press') pressDepth = Math.min(pressDepth + 1, 2);
    else pressDepth = 0;

    const depthCls = pressDepth === 1 ? 'press' : pressDepth >= 2 ? 'press-deep' : '';
    const lastHole = Math.max(...Object.keys(line.status).map(Number), 0);
    const currentVal = lastHole ? (line.status[lastHole] ?? 0) : 0;
    const statusStr = st(currentVal);
    const statusCls = statusStr.includes('UP') ? 'positive' : statusStr.includes('DN') ? 'negative' : 'zero';

    // Build sparkline data
    let sparkHtml = '<div class="sparkline">';
    for (let h = line.start; h <= Math.min(line.end, findLastScoredHole()); h++) {
      const v = line.status[h];
      if (v === undefined) continue;
      const barH = Math.min(Math.abs(v) * 4 + 2, 18);
      const barCls = v > 0 ? 'up' : v < 0 ? 'down' : 'even';
      sparkHtml += `<div class="spark-bar ${barCls}" style="height:${barH}px"></div>`;
    }
    sparkHtml += '</div>';

    // Settlement line
    let settlementHtml = '';
    if (line.final) {
      const amt = line.final.amount;
      const fCls = amt > 0 ? 'positive' : amt < 0 ? 'negative' : '';
      settlementHtml = `<div class="detail-settlement ${fCls}">${line.final.state}: ${amt !== 0 ? (amt > 0 ? '+' : '') + '$' + amt : 'even'}</div>`;
    }

    // Expanded hole-by-hole
    let holesHtml = '';
    for (let h = line.start; h <= Math.min(line.end, findLastScoredHole()); h++) {
      const r = resultForHole(h-1, state.activeGame, +state.activeMatch);
      const running = line.status[h];
      if (running === undefined) continue;
      const rCls = r > 0 ? 'win' : r < 0 ? 'loss' : 'push';
      const runCls = running > 0 ? 'positive' : running < 0 ? 'negative' : '';
      holesHtml += `
        <div class="detail-hole-row">
          <span class="detail-hole-num">Hole ${h}</span>
          <span class="detail-hole-result ${rCls}"></span>
          <span class="detail-hole-running ${runCls}">${st(running)}</span>
        </div>`;
    }

    // Annotation for hole 9/18 rules
    let annotationHtml = '';
    if (line.note) {
      annotationHtml = `<div class="detail-annotation">${line.note.charAt(0).toUpperCase() + line.note.slice(1)}</div>`;
    }

    html += `
      <div class="detail-line-card ${depthCls}" data-line="${li}">
        <div class="detail-line-header">
          <div class="detail-line-info">
            <div class="detail-line-name">${line.name}</div>
            <div class="detail-line-meta">${line.kind} &middot; $${line.value}${line.note ? ' &middot; ' + line.note : ''}</div>
            ${sparkHtml}
          </div>
          <span class="detail-line-status ${statusCls}">${statusStr}</span>
        </div>
        <div class="detail-line-body">
          ${holesHtml}
          ${annotationHtml}
          ${settlementHtml}
        </div>
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.detail-line-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.detail-line-card').classList.toggle('expanded');
    });
  });
}

// ── Settlement Tab ────────────────────────────────────────────────

function renderSettlement() {
  const matches = getMatchups();
  let grand = 0;
  const matchData = [];

  matches.forEach((m, mi) => {
    let matchTotal = 0;
    const games = {};
    ['lowNet','aggregate'].forEach(game => {
      const lines = buildLines(game, mi);
      const settled = lines.filter(l => l.final);
      const total = settled.reduce((s, l) => s + (l.final.amount || 0), 0);
      matchTotal += total;
      games[game] = { lines: settled, total };
    });
    grand += matchTotal;
    matchData.push({ match: m, index: mi, total: matchTotal, games });
  });

  // Grand total
  const sideLabel = +state.gameType === 4
    ? `${pname(0)} + ${pname(1)}`
    : 'Wheel side';
  const gtContainer = document.getElementById('settlementGrandTotal');
  const cls = grand > 0 ? 'positive' : grand < 0 ? 'negative' : 'zero';
  gtContainer.innerHTML = `
    <div class="grand-amount ${cls}">${grand >= 0 ? '+' : ''}$${grand}</div>
    <div class="grand-subtitle">${sideLabel} total</div>`;

  // Match breakdowns
  const container = document.getElementById('settlementMatches');
  let html = '';
  matchData.forEach((md) => {
    const amtCls = md.total > 0 ? 'positive' : md.total < 0 ? 'negative' : '';
    html += `
      <div class="settlement-match" data-match="${md.index}">
        <div class="settlement-match-header">
          <span class="settlement-match-title">Match ${md.index+1}</span>
          <span class="settlement-match-amount ${amtCls}">${md.total >= 0 ? '+' : ''}$${md.total}</span>
        </div>
        <div class="settlement-match-body">
          <div class="settlement-match-teams" style="font-size:13px;color:var(--walnut-light);margin-bottom:10px">${md.match.label}</div>`;

    ['lowNet','aggregate'].forEach(game => {
      const gd = md.games[game];
      const gCls = gd.total > 0 ? 'positive' : gd.total < 0 ? 'negative' : '';
      html += `
        <div class="settlement-game-section">
          <div class="settlement-game-title">${game === 'lowNet' ? 'Low Net' : 'Aggregate'} <span class="${gCls}">${gd.total >= 0 ? '+' : ''}$${gd.total}</span></div>`;
      gd.lines.forEach(l => {
        const wiped = l.final.amount === 0 && l.kind === 'press';
        const doubled = l.note && l.note.includes('doubled');
        const lCls = wiped ? 'wiped' : doubled ? 'doubled' : '';
        const aCls = l.final.amount > 0 ? 'positive' : l.final.amount < 0 ? 'negative' : '';
        html += `
          <div class="settlement-line ${lCls}">
            <span>${l.name}${l.note ? ' (' + l.note + ')' : ''}</span>
            <span class="${aCls}">${l.final.amount !== 0 ? (l.final.amount > 0 ? '+' : '') + '$' + l.final.amount : l.final.state}</span>
          </div>`;
      });
      html += `</div>`;
    });

    const owedText = md.total > 0 ? `Opponents owe $${md.total}` : md.total < 0 ? `${sideLabel} owes $${Math.abs(md.total)}` : 'Push';
    html += `
          <div class="settlement-owed ${md.total > 0 ? 'positive' : md.total < 0 ? 'negative' : ''}">${owedText}</div>
        </div>
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.settlement-match-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.settlement-match').classList.toggle('expanded');
    });
  });

  // Share button
  document.getElementById('shareBtn').onclick = () => {
    const lines = [`Waialae Game — ${new Date().toLocaleDateString()}`];
    lines.push(`${sideLabel}: ${grand >= 0 ? '+' : ''}$${grand}`);
    matchData.forEach(md => {
      lines.push(`Match ${md.index+1} (${md.match.label}): ${md.total >= 0 ? '+' : ''}$${md.total}`);
    });
    const text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('shareBtn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy Summary'; btn.classList.remove('copied'); }, 1500);
      });
    }
  };
}

// ── QR Code Rendering ────────────────────────────────────────────

function renderQRCode(text, container, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  container.innerHTML = '';
  container.appendChild(canvas);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#faf7f2';
    ctx.fillRect(0, 0, size, size);
    const pad = 8;
    ctx.drawImage(img, pad, pad, size - pad*2, size - pad*2);
  };
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=faf7f2&color=1a3a2a&margin=0`;
}

// ── Round Sharing (Go Live) ──────────────────────────────────────

const ROUND_API = 'https://waialae-wheel-feedback.defensebuilders.workers.dev/round';
const SITE_URL = 'https://wheel.defensebuilders.com';

if (state.liveCode === undefined) state.liveCode = null;
if (!state.archivedRounds) state.archivedRounds = [];

let syncDebounce = null;

function suggestRoundCode() {
  const nameIndex = +state.gameType === 4 ? 0 : +state.wheelA;
  const wheelName = pname(nameIndex).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${wheelName}-${mm}${dd}`;
}

function pushRoundToServer() {
  if (!state.liveCode) return;
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(async () => {
    try {
      await fetch(`${ROUND_API}/${state.liveCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } catch (_) {}
  }, 3000);
}

// Patch save() to also push when live
const _origSave = save;
save = function() {
  const json = JSON.stringify(state);
  localStorage.setItem('waialaeWheelTrackerV2', json);
  saveToIDB(json);
  if (state.liveCode && !viewerState) pushRoundToServer();
};

function renderGoLive() {
  const container = document.getElementById('goLiveContent');
  if (!container) return;

  if (state.liveCode) {
    const url = `${SITE_URL}?r=${state.liveCode}`;
    container.innerHTML = `
      <div class="share-card">
        <div><span class="share-live-dot"></span>Live</div>
        <div class="share-code">${state.liveCode}</div>
        <div class="share-qr" id="shareQR"></div>
        <div class="share-actions">
          <button class="share-action-btn" id="copyLinkBtn">Copy Link</button>
          <button class="share-action-btn" id="shareLinkBtn">Share</button>
        </div>
        <button class="share-stop" id="stopSharingBtn">Stop sharing</button>
      </div>`;

    renderQRCode(url, document.getElementById('shareQR'), 180);

    document.getElementById('copyLinkBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyLinkBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Link', 1500);
      });
    });

    document.getElementById('shareLinkBtn').addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({ title: 'Waialae Game', text: `Join my round: ${state.liveCode}`, url });
      } else {
        navigator.clipboard.writeText(url);
      }
    });

    document.getElementById('stopSharingBtn').addEventListener('click', () => {
      state.liveCode = null;
      save(); renderGoLive();
    });
  } else {
    const suggested = suggestRoundCode();
    container.innerHTML = `
      <div class="go-live-setup">
        <div class="go-live-code-row">
          <input class="go-live-code-input" type="text" id="liveCodeInput" value="${suggested}" autocapitalize="characters" autocomplete="off" autocorrect="off">
          <button class="go-live-confirm" id="goLiveBtn">Go Live</button>
        </div>
      </div>`;

    document.getElementById('goLiveBtn').addEventListener('click', async () => {
      const code = document.getElementById('liveCodeInput').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (!code) return;
      state.liveCode = code;
      save();
      try {
        await fetch(`${ROUND_API}/${code}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
      } catch (_) {}
      renderGoLive();
    });
  }
}

// ── Viewer Mode ──────────────────────────────────────────────────

let viewerState = null;
let viewerCode = null;
let viewerPollTimer = null;
let viewerFailCount = 0;

function enterViewerMode(code, data) {
  viewerCode = code.toUpperCase();
  viewerState = data;
  viewerFailCount = 0;
  document.body.classList.add('viewer-mode');
  const banner = document.getElementById('viewerBanner');
  banner.classList.remove('hidden', 'stale', 'offline');
  document.getElementById('viewerBannerText').textContent = `Viewing ${viewerCode} \u00b7 Live`;
  clearInterval(viewerPollTimer);
  viewerPollTimer = setInterval(pollViewer, 10000);
  switchTab('matches');
}

function exitViewerMode() {
  viewerState = null;
  viewerCode = null;
  clearInterval(viewerPollTimer);
  document.body.classList.remove('viewer-mode');
  document.getElementById('viewerBanner').classList.add('hidden');
  if (window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname);
  }
  switchTab('setup');
}

async function pollViewer() {
  if (!viewerCode) return;
  try {
    const res = await fetch(`${ROUND_API}/${viewerCode}`);
    if (res.ok) {
      viewerState = await res.json();
      viewerFailCount = 0;
      const banner = document.getElementById('viewerBanner');
      banner.classList.remove('stale', 'offline');
      document.getElementById('viewerBannerText').textContent = `Viewing ${viewerCode} \u00b7 Live`;
      banner.style.transition = 'none';
      banner.style.opacity = '0.7';
      setTimeout(() => { banner.style.transition = 'opacity 0.3s'; banner.style.opacity = '1'; }, 50);
      const tab = document.querySelector('.nav-tab.active')?.dataset.tab;
      if (tab === 'matches') renderMatches();
      else if (tab === 'detail') renderDetail();
      else if (tab === 'settlement') renderSettlement();
      else if (tab === 'scorecard') renderScorecard();
    } else if (res.status === 404) {
      viewerFailCount = 99;
      document.getElementById('viewerBanner').classList.add('offline');
      document.getElementById('viewerBannerText').textContent = `${viewerCode} \u00b7 Round no longer available`;
    }
  } catch (_) {
    viewerFailCount++;
    if (viewerFailCount >= 3) {
      document.getElementById('viewerBanner').classList.add('stale');
      document.getElementById('viewerBannerText').textContent = `Viewing ${viewerCode} \u00b7 Connection lost`;
    }
  }
}

document.getElementById('viewerExit').addEventListener('click', exitViewerMode);

document.getElementById('joinBtn').addEventListener('click', async () => {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  const status = document.getElementById('joinStatus');
  if (!code) return;
  status.textContent = 'Loading...';
  status.className = 'join-status';
  try {
    const res = await fetch(`${ROUND_API}/${code}`);
    if (res.ok) {
      status.textContent = '';
      enterViewerMode(code, await res.json());
    } else {
      status.textContent = 'Round not found. Check the code.';
      status.className = 'join-status error';
    }
  } catch (_) {
    status.textContent = 'Connection failed. Try again.';
    status.className = 'join-status error';
  }
});

// Viewer-mode renderer wrappers — swap state temporarily
const _renderMatches = renderMatches;
const _renderDetail = renderDetail;
const _renderSettlement = renderSettlement;
const _renderScorecard = renderScorecard;

renderMatches = function() {
  if (viewerState) { const s = state; state = viewerState; _renderMatches(); state = s; }
  else _renderMatches();
};
renderDetail = function() {
  if (viewerState) { const s = state; state = viewerState; _renderDetail(); state = s; }
  else _renderDetail();
};
renderSettlement = function() {
  if (viewerState) { const s = state; state = viewerState; _renderSettlement(); state = s; }
  else _renderSettlement();
};
renderScorecard = function() {
  if (viewerState) {
    const s = state; state = viewerState; _renderScorecard(); state = s;
    document.querySelectorAll('.score-row').forEach(row => {
      row.style.pointerEvents = 'none';
      row.style.cursor = 'default';
    });
  } else _renderScorecard();
};

// ── Round Archive ────────────────────────────────────────────────

function archiveCurrentRound() {
  const hasScores = state.scores.some(hole => hole.some(s => s !== null));
  if (!hasScores) return;
  if (!state.archivedRounds) state.archivedRounds = [];

  let grand = 0;
  const matchSummaries = [];
  try {
    getMatchups().forEach((m, mi) => {
      let matchTotal = 0;
      ['lowNet','aggregate'].forEach(game => {
        matchTotal += buildLines(game, mi).filter(l => l.final).reduce((s, l) => s + (l.final.amount || 0), 0);
      });
      grand += matchTotal;
      matchSummaries.push({ label: m.label, total: matchTotal });
    });
  } catch (_) {}

  state.archivedRounds.push({
    code: state.liveCode || null,
    date: new Date().toISOString().slice(0, 10),
    players: structuredClone(state.players.slice(0, +state.gameType)),
    gameType: state.gameType, wheelA: state.wheelA, wheelB: state.wheelB,
    baseBet: state.baseBet, maxPresses: state.maxPresses,
    scores: structuredClone(state.scores),
    summary: { grand, matches: matchSummaries }
  });
}

function renderPastRounds() {
  const container = document.getElementById('pastRoundsSection');
  const rounds = state.archivedRounds || [];
  if (!rounds.length) { container.innerHTML = ''; return; }

  let html = '<div class="past-rounds-title">Past Rounds</div>';
  [...rounds].reverse().forEach((r, ri) => {
    const idx = rounds.length - 1 - ri;
    const names = r.players.map(p => p.name).join(', ');
    const cls = r.summary.grand > 0 ? 'positive' : r.summary.grand < 0 ? 'negative' : '';
    html += `
      <div class="past-round-card" data-archive="${idx}">
        <div class="past-round-header">
          <span class="past-round-date">${r.date}${r.code ? ' \u00b7 ' + r.code : ''}</span>
          <span class="past-round-total ${cls}">${r.summary.grand >= 0 ? '+' : ''}$${r.summary.grand}</span>
        </div>
        <div class="past-round-players">${names}</div>
      </div>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.past-round-card').forEach(card => {
    card.addEventListener('click', () => {
      const round = rounds[+card.dataset.archive];
      const archivedState = {
        ...structuredClone(defaultState),
        players: structuredClone(round.players),
        gameType: round.gameType, wheelA: round.wheelA, wheelB: round.wheelB,
        baseBet: round.baseBet, maxPresses: round.maxPresses || 0,
        scores: structuredClone(round.scores),
      };
      while (archivedState.players.length < 5) {
        archivedState.players.push({name: `Player ${archivedState.players.length + 1}`, hcp: 18});
      }
      viewerCode = round.code || round.date;
      viewerState = archivedState;
      document.body.classList.add('viewer-mode');
      const banner = document.getElementById('viewerBanner');
      banner.classList.remove('hidden', 'stale', 'offline');
      document.getElementById('viewerBannerText').textContent = `Viewing ${round.date}${round.code ? ' \u00b7 ' + round.code : ''} (archived)`;
      switchTab('matches');
    });
  });
}

// ── Feedback ──────────────────────────────────────────────────────

const FEEDBACK_URL = 'https://waialae-wheel-feedback.defensebuilders.workers.dev/feedback';
let feedbackType = 'feature';

function openFeedback() {
  syncViewportHeight();
  document.body.classList.add('feedback-open');
  document.getElementById('feedbackPanel').classList.remove('feedback-hidden');
  document.getElementById('feedbackBackdrop').classList.remove('feedback-hidden');
  document.getElementById('feedbackFab').classList.add('fb-open');
  document.getElementById('feedbackMessage').value = '';
  document.getElementById('feedbackStatus').textContent = '';
  document.getElementById('feedbackStatus').className = 'feedback-status';
  document.getElementById('feedbackSubmit').disabled = false;
  feedbackType = 'feature';
  renderFeedbackPills();
}

function closeFeedback() {
  document.body.classList.remove('feedback-open');
  document.getElementById('feedbackPanel').classList.add('feedback-hidden');
  document.getElementById('feedbackBackdrop').classList.add('feedback-hidden');
  document.getElementById('feedbackFab').classList.remove('fb-open');
}

function renderFeedbackPills() {
  document.querySelectorAll('#feedbackTypePills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === feedbackType);
  });
}

document.getElementById('feedbackFab').addEventListener('click', openFeedback);
document.getElementById('feedbackBackdrop').addEventListener('click', closeFeedback);

document.querySelectorAll('#feedbackTypePills .pill').forEach(p => {
  p.addEventListener('click', () => {
    feedbackType = p.dataset.value;
    renderFeedbackPills();
  });
});

document.getElementById('feedbackSubmit').addEventListener('click', async () => {
  const message = document.getElementById('feedbackMessage').value.trim();
  if (!message) return;

  const btn = document.getElementById('feedbackSubmit');
  const status = document.getElementById('feedbackStatus');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: feedbackType, message }),
    });
    if (!res.ok) throw new Error('Failed');
    status.textContent = 'Sent! Thanks for the feedback.';
    status.className = 'feedback-status success';
    btn.textContent = 'Send';
    setTimeout(closeFeedback, 1200);
  } catch (e) {
    status.textContent = 'Failed to send. Try again.';
    status.className = 'feedback-status error';
    btn.textContent = 'Send';
    btn.disabled = false;
  }
});

// ── Init ──────────────────────────────────────────────────────────

switchTab(state.activeTab);

// Check URL for ?r=CODE to auto-join a round
(function() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('r');
  if (code) {
    document.getElementById('joinCode').value = code.toUpperCase();
    document.getElementById('joinBtn').click();
  }
})();
