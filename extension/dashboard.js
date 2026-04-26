// dashboard.js — live stats, charts, and controls for FocusLens

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  focusHistory: [],   // rolling 120 samples (~2 min at 1/sec)
  focusBuf: Array(10).fill(85),
  sessionStart: Date.now(),
  interventionCount: 0,
  faceDetected: false,
  lastGaze: { h: 0.5, v: 0.5 },
  signals: { gds: 20, osr: 10, bra: 17, ear: 0.3, h: 0.5, v: 0.5 },
};

// Heatmap grid (64×36 normalized)
const HM_W = 64, HM_H = 36;
const heatGrid = new Float32Array(HM_W * HM_H);

const DEFAULTS = {
  preset: 'general', showSphere: true, showBanner: true,
  edgePulse: false, showGazeDot: true, sensitivity: 5,
  cooldown: 20, spherePos: 'br',
};
let settings = { ...DEFAULTS };

// ── Port connection ───────────────────────────────────────────────────────────

const port = chrome.runtime.connect({ name: 'focuslens-dashboard' });
port.onMessage.addListener((msg) => {
  if (msg.type === 'gazeUpdate') handleGaze(msg.data);
  if (msg.type === 'settingsUpdate') applySettings(msg.settings);
});
port.onDisconnect.addListener(() => {
  setTrackingLabel('Disconnected', false);
});

// ── Gaze handler ─────────────────────────────────────────────────────────────

function handleGaze(data) {
  if (data.error === 'camera_denied') {
    setTrackingLabel('Camera denied', false); return;
  }

  state.faceDetected = !!data.faceDetected;
  setTrackingLabel(data.faceDetected ? 'Tracking' : 'No face', data.faceDetected);

  if (!data.faceDetected) {
    pushFocus(0); return;
  }

  const { horizRatio: h, vertRatio: v, isBlinking, ear, blinksPerMin } = data;
  state.lastGaze = { h, v };
  state.signals.h   = h;
  state.signals.v   = v;
  state.signals.ear = ear ?? state.signals.ear;
  state.signals.bra = blinksPerMin ?? state.signals.bra;

  // Gaze drift = deviation from center
  const driftH = Math.abs(h - 0.5) * 2;
  const driftV = Math.abs(v - 0.5) * 2;
  state.signals.gds = Math.round(Math.max(driftH, driftV) * 100);
  state.signals.osr = h < 0.2 || h > 0.8 || v < 0.15 || v > 0.85 ? 80 : Math.round(state.signals.gds * 0.4);

  const score = Math.round(Math.max(0, Math.min(100,
    100 - state.signals.gds * 0.6 - state.signals.osr * 0.4
  )));
  pushFocus(score);

  // Heatmap: map h/v to grid
  const gx = Math.min(HM_W - 1, Math.max(0, Math.round(h * (HM_W - 1))));
  const gy = Math.min(HM_H - 1, Math.max(0, Math.round(v * (HM_H - 1))));
  heatGrid[gy * HM_W + gx] += 1;

  updateSignalUI();
}

function pushFocus(score) {
  state.focusBuf.shift(); state.focusBuf.push(score);
  const avg = Math.round(state.focusBuf.reduce((a,b)=>a+b,0)/state.focusBuf.length);

  state.focusHistory.push(avg);
  if (state.focusHistory.length > 120) state.focusHistory.shift();

  updateGaugeUI(avg);
  drawHistory();
  drawHeatmap();
  updateHeaderStats();
}

// ── UI updaters ───────────────────────────────────────────────────────────────

function updateGaugeUI(score) {
  const color = score > 70 ? 'var(--green)' : score > 40 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('gauge-num').textContent  = score + '%';
  document.getElementById('gauge-num').style.color  = color;
  document.getElementById('h-focus').textContent    = score + '%';
  document.getElementById('h-focus').style.color    = color;
  drawGauge(score, color);
}

function updateSignalUI() {
  const { gds, osr, bra, ear, h, v } = state.signals;
  const pairs = [
    ['gds', gds, false], ['osr', osr, false],
    ['bra', bra, false], ['ear', Math.round(ear * 100), false],
    ['h',   Math.round(h  * 100), true],
    ['v',   Math.round(v  * 100), true],
  ];
  pairs.forEach(([k, val, isPurple]) => {
    const fill = document.getElementById('sf-' + k);
    const valEl= document.getElementById('sv-' + k);
    if (!fill || !valEl) return;
    fill.style.width = val + '%';
    if (!isPurple) {
      fill.style.background = val > 65 ? 'var(--red)' : val > 40 ? 'var(--amber)' : 'var(--green)';
    }
    valEl.textContent = k === 'ear' ? (ear).toFixed(2) : k === 'h' || k === 'v' ? h.toFixed(2) : val;
  });
  document.getElementById('sv-h').textContent = state.signals.h.toFixed(2);
  document.getElementById('sv-v').textContent = state.signals.v.toFixed(2);
}

function updateHeaderStats() {
  const elapsed = Date.now() - state.sessionStart;
  const s = Math.floor(elapsed / 1000);
  const timeStr = String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  document.getElementById('h-timer').textContent = timeStr;
  document.getElementById('s-time').textContent  = timeStr;

  const avg = state.focusHistory.length
    ? Math.round(state.focusHistory.reduce((a,b)=>a+b,0)/state.focusHistory.length) + '%'
    : '—';
  document.getElementById('h-avg').textContent   = avg;
  document.getElementById('s-avg').textContent   = avg;
  document.getElementById('s-nudges').textContent= state.interventionCount;
  document.getElementById('h-interventions').textContent = state.interventionCount;
  document.getElementById('history-range').textContent   = state.focusHistory.length + ' samples';
}

function setTrackingLabel(label, active) {
  document.getElementById('tracking-label').textContent = label;
  const badge = document.getElementById('tracking-badge');
  badge.style.background = active ? 'rgba(63,185,80,0.08)' : 'rgba(210,153,34,0.08)';
  badge.style.borderColor= active ? 'rgba(63,185,80,0.3)'  : 'rgba(210,153,34,0.3)';
  badge.style.color      = active ? 'var(--green)'         : 'var(--amber)';
}

// ── Gauge (canvas donut) ─────────────────────────────────────────────────────

function drawGauge(value, colorVar) {
  const canvas = document.getElementById('gauge-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2, r = W*0.38;
  const start = -Math.PI * 0.75;
  const full  =  Math.PI * 1.5;

  ctx.clearRect(0, 0, W, H);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + full);
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.stroke();

  // Value arc
  if (value > 0) {
    const color = value > 70 ? '#3fb950' : value > 40 ? '#d29922' : '#f85149';
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + full * (value/100));
    ctx.strokeStyle = color;
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.stroke();

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start + full*(value/100) - 0.01, start + full*(value/100));
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Tick marks
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 10; i++) {
    const angle = start + full * (i / 10);
    const inner = r - 14, outer = r - 8;
    ctx.beginPath();
    ctx.moveTo(cx + inner*Math.cos(angle), cy + inner*Math.sin(angle));
    ctx.lineTo(cx + outer*Math.cos(angle), cy + outer*Math.sin(angle));
    ctx.stroke();
  }
}

// ── Focus history line chart ─────────────────────────────────────────────────

function drawHistory() {
  const canvas = document.getElementById('history-canvas');
  if (!canvas) return;
  canvas.width = canvas.parentElement?.clientWidth - 32 || 600;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const data = state.focusHistory;

  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(48,54,61,0.5)'; ctx.lineWidth = 0.5;
  [25, 50, 75].forEach(y => {
    const py = H - (y/100)*H;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    ctx.fillStyle = 'rgba(139,148,158,0.4)'; ctx.font = '9px system-ui';
    ctx.fillText(y, 2, py - 2);
  });

  if (data.length < 2) return;

  const step = W / 119;
  const py = (v) => H - (v/100) * H * 0.9 - H*0.05;

  // Fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(88,166,255,0.25)');
  grad.addColorStop(1, 'rgba(88,166,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  const startX = W - (data.length - 1) * step;
  ctx.moveTo(startX, py(data[0]));
  for (let i = 1; i < data.length; i++) {
    ctx.lineTo(startX + i*step, py(data[i]));
  }
  ctx.lineTo(startX + (data.length-1)*step, H);
  ctx.lineTo(startX, H);
  ctx.closePath(); ctx.fill();

  // Line (color-coded by value)
  for (let i = 1; i < data.length; i++) {
    const v = data[i];
    ctx.strokeStyle = v > 70 ? '#3fb950' : v > 40 ? '#d29922' : '#f85149';
    ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX + (i-1)*step, py(data[i-1]));
    ctx.lineTo(startX + i*step, py(data[i]));
    ctx.stroke();
  }

  // Latest value dot
  const lastX = startX + (data.length-1)*step;
  const lastY = py(data[data.length-1]);
  const v = data[data.length-1];
  ctx.fillStyle = v > 70 ? '#3fb950' : v > 40 ? '#d29922' : '#f85149';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
}

// ── Gaze heatmap ─────────────────────────────────────────────────────────────

function drawHeatmap() {
  const canvas = document.getElementById('heatmap-canvas');
  if (!canvas) return;
  canvas.width = canvas.parentElement?.clientWidth - 32 || 600;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // Screen outline
  ctx.strokeStyle = 'rgba(48,54,61,0.6)'; ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, W-2, H-2);

  // Heatmap cells
  const max = Math.max(1, ...heatGrid);
  const cellW = W / HM_W, cellH = H / HM_H;

  for (let gy = 0; gy < HM_H; gy++) {
    for (let gx = 0; gx < HM_W; gx++) {
      const val = heatGrid[gy * HM_W + gx];
      if (val < 0.1) continue;
      const t = Math.pow(val / max, 0.5); // sqrt scale for better visibility
      const r = Math.round(t * 248);
      const g = Math.round(t < 0.5 ? t*2*166 : (1-(t-0.5)*2)*166 + (t-0.5)*2*81);
      const b = Math.round((1-t) * 255);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + t*0.7})`;
      ctx.fillRect(gx*cellW, gy*cellH, cellW+0.5, cellH+0.5);
    }
  }

  // Blur pass (simple box blur approximation by drawing enlarged + transparent)
  // Current gaze position marker
  const { h, v } = state.lastGaze;
  const dotX = h * W, dotY = v * H;
  ctx.strokeStyle = 'rgba(88,166,255,0.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(dotX, dotY, 5, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = 'rgba(88,166,255,0.3)';
  ctx.beginPath(); ctx.arc(dotX, dotY, 5, 0, Math.PI*2); ctx.fill();

  // Crosshair
  ctx.strokeStyle = 'rgba(88,166,255,0.5)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(dotX-10, dotY); ctx.lineTo(dotX+10, dotY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(dotX, dotY-10); ctx.lineTo(dotX, dotY+10); ctx.stroke();

  // Label: "screen center" zone
  ctx.strokeStyle = 'rgba(63,185,80,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.strokeRect(W*0.2, H*0.15, W*0.6, H*0.7);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(63,185,80,0.4)'; ctx.font = '9px system-ui';
  ctx.fillText('focus zone', W*0.2+4, H*0.15+10);
}

// ── Event log ─────────────────────────────────────────────────────────────────

function addLog(msg, type) {
  const log = document.getElementById('event-log');
  const el  = document.createElement('div');
  el.className = 'log-entry';
  const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
  const ts = String(Math.floor(elapsed/60)).padStart(2,'0') + ':' + String(elapsed%60).padStart(2,'0');
  el.innerHTML = `
    <div class="log-dot ${type}"></div>
    <span class="log-time">${ts}</span>
    <span class="log-msg">${msg}</span>
  `;
  log.prepend(el);
  while (log.children.length > 50) log.removeChild(log.lastChild);

  if (type === 'amber' || type === 'red') {
    state.interventionCount++;
    document.getElementById('h-interventions').textContent = state.interventionCount;
    document.getElementById('s-nudges').textContent        = state.interventionCount;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

function applySettings(incoming = {}) {
  Object.assign(settings, incoming);

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === settings.preset);
  });

  // Toggles
  setToggle('t-sphere', settings.showSphere);
  setToggle('t-banner', settings.showBanner);
  setToggle('t-edge',   settings.edgePulse);
  setToggle('t-gaze',   settings.showGazeDot);

  // Controls
  const sens = document.getElementById('sensitivity');
  if (sens) { sens.value = settings.sensitivity; document.getElementById('sens-val').textContent = settings.sensitivity; }
  const cd = document.getElementById('cooldown');
  if (cd) cd.value = settings.cooldown;
  const sp = document.getElementById('sphere-pos');
  if (sp) sp.value = settings.spherePos;
}

function setToggle(id, on) {
  document.getElementById(id)?.classList.toggle('on', !!on);
}

function saveSettings(changes) {
  Object.assign(settings, changes);
  chrome.storage.sync.set(changes);
  chrome.runtime.sendMessage({ type: 'settingsUpdate', settings: changes });
}

// ── Control bindings ──────────────────────────────────────────────────────────

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveSettings({ preset: btn.dataset.preset });
    addLog('Preset → ' + btn.dataset.preset, 'blue');
  });
});

function bindToggle(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    saveSettings({ [key]: on });
  });
}
bindToggle('t-sphere', 'showSphere');
bindToggle('t-banner', 'showBanner');
bindToggle('t-edge',   'edgePulse');
bindToggle('t-gaze',   'showGazeDot');

document.getElementById('sensitivity').addEventListener('input', (e) => {
  document.getElementById('sens-val').textContent = e.target.value;
  saveSettings({ sensitivity: Number(e.target.value) });
});
document.getElementById('cooldown').addEventListener('change', (e) => saveSettings({ cooldown: Number(e.target.value) }));
document.getElementById('sphere-pos').addEventListener('change', (e) => saveSettings({ spherePos: e.target.value }));

document.getElementById('reset-btn').addEventListener('click', () => {
  state.sessionStart = Date.now();
  state.interventionCount = 0;
  state.focusHistory.length = 0;
  heatGrid.fill(0);
  document.getElementById('event-log').innerHTML = '';
  addLog('Session reset', 'blue');
  drawGauge(0, 'var(--green)');
  drawHistory();
  drawHeatmap();
  updateHeaderStats();
});

document.getElementById('clear-log').addEventListener('click', () => {
  document.getElementById('event-log').innerHTML = '';
});
document.getElementById('clear-heatmap').addEventListener('click', () => {
  heatGrid.fill(0); drawHeatmap();
});

// ── Storage listener (settings changed from popup) ────────────────────────────

chrome.storage.onChanged.addListener((changes) => {
  const incoming = {};
  for (const [k, { newValue }] of Object.entries(changes)) incoming[k] = newValue;
  applySettings(incoming);
});

// ── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.sync.get(DEFAULTS, (s) => applySettings(s));
drawGauge(0, '#3fb950');
drawHistory();
drawHeatmap();
addLog('Dashboard opened', 'green');

// Resize observer to redraw charts when window resizes
new ResizeObserver(() => { drawHistory(); drawHeatmap(); })
  .observe(document.getElementById('center'));
