// ── Waialae Wheel Bet Tracker v2 ──────────────────────────────────
// All game logic preserved from original. UI rebuilt for mobile-first tabs.

const HOLES = [...Array(18)].map((_, i) => i + 1);
const WAIALAE_HCP = [7,17,13,1,9,11,3,15,5,6,16,12,18,2,10,14,4,8];
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

// ── Game Logic (unchanged) ────────────────────────────────────────

function dotOnHole(playerIndex, hole) {
  const players = activePlayers();
  const low = Math.min(...players.map(p => +p.hcp || 0));
  const diff = Math.max(0, (+state.players[playerIndex].hcp || 0) - low);
  const holeHcp = WAIALAE_HCP[hole - 1];
  return diff >= holeHcp ? 1 : 0;
}

function net(playerIndex, hidx) {
  const g = state.scores[hidx]?.[playerIndex];
  if (g === null || g === '' || g === undefined) return null;
  return +g - dotOnHole(playerIndex, hidx + 1);
}

function getMatchups() {
  const n = +state.gameType;
  if (n === 4) {
    const wheel = +state.wheelA;
    const others = [0,1,2,3].filter(i => i !== wheel);
    return others.map(partner => {
      const opp = others.filter(i => i !== partner);
      return {
        label: `${pname(wheel)} + ${pname(partner)} vs ${pname(opp[0])} + ${pname(opp[1])}`,
        teamA: [wheel, partner], teamB: opp
      };
    });
  }
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

function runSegment(game, matchIndex, name, start, end, value) {
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
    active.forEach(line => {
      // Only the losing side presses — trigger when 2 down (negative)
      if (line.status[h] !== undefined && line.status[h] <= -2 && h < end) {
        pending.push({h: h+1, from: line.name});
      }
    });
  }
  return lines;
}

function buildLines(game, matchIndex) {
  const front = runSegment(game, matchIndex, 'Front', 1, 9, state.baseBet);
  const back = runSegment(game, matchIndex, 'Back', 10, 18, state.baseBet);
  const overall = runSegment(game, matchIndex, 'Overall', 1, 18, state.baseBet * 2);

  const h9 = resultForHole(8, game, matchIndex);
  front.forEach(line => {
    if (line.kind !== 'press') return;
    if (h9 === null) return;
    if (h9 < 0) { line.final = {state:'wiped at 9', amount:0}; return; }
    if (h9 > 0) { line.value *= 2; line.note = 'doubled at 9'; }
    else { line.note = 'carried at 9'; }
    let running = line.status[9] ?? 0;
    for (let h = 10; h <= 18; h++) {
      const r = resultForHole(h-1, game, matchIndex);
      if (r === null) break;
      running += r; line.status[h] = running;
    }
    line.end = 18;
  });

  const h18 = resultForHole(17, game, matchIndex);
  [...front, ...back, ...overall].forEach(line => {
    if (line.kind !== 'press' || line.final || line.end !== 18) return;
    if (h18 === null) return;
    if (h18 < 0) { line.final = {state:'wiped at 18', amount:0}; }
    else if (h18 === 0) { line.final = {state:'realized at 18', amount: line.value * Math.sign(line.status[18] || 1)}; }
    else { line.value *= 2; line.final = {state:'doubled & realized at 18', amount: line.value * Math.sign(line.status[18] || 1)}; }
  });

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
      if (state.gameType === 4) { state.wheelB = 1; }
      else if (state.wheelB === state.wheelA) { state.wheelB = (state.wheelA + 1) % 5; }
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
    const isWheel = (i === +state.wheelA) || (n === 5 && i === +state.wheelB);
    html += `
      <div class="player-card">
        <div class="player-crown ${isWheel ? 'active' : ''}" data-player="${i}" title="Wheel player">${isWheel ? '&#9813;' : '&#9813;'}</div>
        <input class="player-name" type="text" value="${state.players[i].name}" data-player="${i}" autocomplete="off" autocorrect="off">
        <div class="hcp-stepper ${state.hcpLocked ? 'disabled' : ''}">
          <button class="hcp-btn" data-player="${i}" data-dir="-1">&minus;</button>
          <span class="hcp-val">${state.players[i].hcp}</span>
          <button class="hcp-btn" data-player="${i}" data-dir="1">+</button>
        </div>
      </div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('.player-name').forEach(input => {
    input.addEventListener('input', (e) => {
      state.players[+e.target.dataset.player].name = e.target.value;
      save();
    });
  });

  container.querySelectorAll('.hcp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pi = +btn.dataset.player;
      const dir = +btn.dataset.dir;
      state.players[pi].hcp = Math.max(0, state.players[pi].hcp + dir);
      save(); renderPlayerCards();
    });
  });

  container.querySelectorAll('.player-crown').forEach(crown => {
    crown.addEventListener('click', () => {
      const pi = +crown.dataset.player;
      if (+state.gameType === 4) {
        state.wheelA = pi;
      } else {
        if (pi === +state.wheelA) {
          state.wheelA = state.wheelB;
          state.wheelB = pi;
        } else if (pi === +state.wheelB) {
          // already wheel, do nothing
        } else {
          state.wheelA = state.wheelB;
          state.wheelB = pi;
        }
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

document.getElementById('startRound').addEventListener('click', () => switchTab('scorecard'));
document.getElementById('exportData').addEventListener('click', exportState);
document.getElementById('importData').addEventListener('change', (e) => {
  if (e.target.files[0]) importState(e.target.files[0]);
});
document.getElementById('resetRound').addEventListener('click', () => {
  if (confirm('Reset the entire round? All scores will be lost.')) {
    const saved = state.savedGroups;
    state = structuredClone(defaultState);
    state.savedGroups = saved;
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
    const hasDot = dotOnHole(i, h);
    const netVal = net(i, idx);
    html += `
      <div class="score-row ${hasScore ? 'has-score' : ''}" data-player="${i}">
        <span class="score-player">${pname(i)}</span>
        <span class="score-dot ${hasDot ? '' : 'no-dot'}"></span>
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

function renderResultsBanner() {
  const banner = document.getElementById('resultsBanner');
  const idx = state.currentHole - 1;
  const n = +state.gameType;
  const allFilled = activePlayers().every((_, pi) => state.scores[idx][pi] !== null);

  if (!allFilled) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const matches = getMatchups();
  let html = '';
  matches.forEach((m, mi) => {
    const ln = resultForHole(idx, 'lowNet', mi);
    const ag = resultForHole(idx, 'aggregate', mi);
    html += `
      <div class="banner-match">
        <span class="banner-label">M${mi+1} Low</span>
        <span class="banner-result ${ln > 0 ? 'win' : ln < 0 ? 'loss' : 'push'}">${ln > 0 ? 'Wheel' : ln < 0 ? 'Opp' : 'Push'}</span>
      </div>
      <div class="banner-match">
        <span class="banner-label">M${mi+1} Agg</span>
        <span class="banner-result ${ag > 0 ? 'win' : ag < 0 ? 'loss' : 'push'}">${ag > 0 ? 'Wheel' : ag < 0 ? 'Opp' : 'Push'}</span>
      </div>`;
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
      banner.innerHTML = `<strong>Hole 9 approaching</strong> &mdash; ${pressCount} front press${pressCount > 1 ? 'es' : ''} at risk.<br>Win = double &amp; carry. Push = carry. Lose = wiped.`;
      return;
    }
  }

  if (h >= 17 && h <= 18) {
    let pressCount = 0;
    matches.forEach((_, mi) => {
      ['lowNet','aggregate'].forEach(game => {
        const lines = buildLines(game, mi);
        pressCount += lines.filter(l => l.kind === 'press' && !l.final).length;
      });
    });
    if (pressCount > 0) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<strong>Hole 18 approaching</strong> &mdash; ${pressCount} press${pressCount > 1 ? 'es' : ''} at risk.<br>Win = double &amp; realize. Push = realize. Lose = wiped.`;
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
  const cls = grand > 0 ? 'positive' : grand < 0 ? 'negative' : 'zero';
  container.innerHTML = `
    <div class="grand-amount ${cls}">${grand >= 0 ? '+' : ''}$${grand}</div>
    <div class="grand-subtitle">Wheel side &middot; Through ${lastScoredHole} hole${lastScoredHole !== 1 ? 's' : ''}</div>`;
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
  const gtContainer = document.getElementById('settlementGrandTotal');
  const cls = grand > 0 ? 'positive' : grand < 0 ? 'negative' : 'zero';
  gtContainer.innerHTML = `
    <div class="grand-amount ${cls}">${grand >= 0 ? '+' : ''}$${grand}</div>
    <div class="grand-subtitle">Wheel side total</div>`;

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

    const owedText = md.total > 0 ? `Opponents owe $${md.total}` : md.total < 0 ? `Wheel side owes $${Math.abs(md.total)}` : 'Push';
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
    const lines = [`Waialae Wheel — ${new Date().toLocaleDateString()}`];
    lines.push(`Wheel side: ${grand >= 0 ? '+' : ''}$${grand}`);
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

// ── Feedback ──────────────────────────────────────────────────────

const FEEDBACK_URL = 'https://waialae-wheel-feedback.defensebuilders.workers.dev/feedback';
let feedbackType = 'feature';

function openFeedback() {
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
