// popup.js — reads/writes chrome.storage.sync, updates UI

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'openDashboard' });
  window.close();
});

const DEFAULTS = {
  preset:      'general',
  showSphere:  true,
  showBanner:  true,
  edgePulse:   false,
  showGazeDot: true,
  sensitivity: 5,
  cooldown:    20,
  spherePos:   'br',
};

// ── Load settings ────────────────────────────────────────────────────────────

chrome.storage.sync.get(DEFAULTS, (s) => {
  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === s.preset);
  });

  // Toggles
  setToggle('toggle-sphere', s.showSphere);
  setToggle('toggle-banner', s.showBanner);
  setToggle('toggle-edge',   s.edgePulse);
  setToggle('toggle-gaze',   s.showGazeDot);

  // Selects / ranges
  document.getElementById('sensitivity').value = s.sensitivity;
  document.getElementById('cooldown').value     = s.cooldown;
  document.getElementById('sphere-pos').value   = s.spherePos;
});

// ── Preset buttons ───────────────────────────────────────────────────────────

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    save({ preset: btn.dataset.preset });
  });
});

// ── Toggles ──────────────────────────────────────────────────────────────────

function setToggle(id, on) {
  document.getElementById(id)?.classList.toggle('on', !!on);
}

function bindToggle(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    save({ [key]: on });
  });
}

bindToggle('toggle-sphere', 'showSphere');
bindToggle('toggle-banner', 'showBanner');
bindToggle('toggle-edge',   'edgePulse');
bindToggle('toggle-gaze',   'showGazeDot');

// ── Range / select ───────────────────────────────────────────────────────────

document.getElementById('sensitivity').addEventListener('input', (e) => {
  save({ sensitivity: Number(e.target.value) });
});

document.getElementById('cooldown').addEventListener('change', (e) => {
  save({ cooldown: Number(e.target.value) });
});

document.getElementById('sphere-pos').addEventListener('change', (e) => {
  save({ spherePos: e.target.value });
});

// ── Save helper — writes to storage, then notifies background ────────────────

function save(changes) {
  chrome.storage.sync.set(changes, () => {
    chrome.runtime.sendMessage({ type: 'settingsUpdate', settings: changes });
  });
}
