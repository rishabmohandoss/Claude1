// content.js — injected into every page
// Renders the FocusLens overlay (gaze dot, sphere, banner, badge) in a Shadow DOM
// so it never clashes with the host page's CSS.

(function () {
  'use strict';
  if (document.getElementById('focuslens-host')) return;

  // ── Shadow DOM root ────────────────────────────────────────────────────────

  const host = document.createElement('div');
  host.id = 'focuslens-host';
  host.style.cssText = 'all:unset;position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* Gaze dot — crosshair */
  #gaze-dot {
    position: fixed;
    width: 14px; height: 14px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: left 0.06s linear, top 0.06s linear;
    display: none;
  }
  #gaze-dot::before, #gaze-dot::after {
    content: '';
    position: absolute;
    background: rgba(88,166,255,0.75);
  }
  #gaze-dot::before { width: 1px; height: 22px; left: 50%; top: -4px; transform: translateX(-50%); }
  #gaze-dot::after  { width: 22px; height: 1px; top: 50%;  left: -4px; transform: translateY(-50%); }
  #gaze-dot .dot-ring {
    position: absolute; inset: 0;
    border: 1.5px solid rgba(88,166,255,0.8);
    border-radius: 50%;
    box-shadow: 0 0 8px rgba(88,166,255,0.5), inset 0 0 4px rgba(88,166,255,0.2);
  }

  /* Status badge */
  #badge {
    position: fixed;
    top: 14px; right: 14px;
    display: flex; align-items: center; gap: 6px;
    background: rgba(13,17,23,0.88);
    border: 1px solid rgba(48,54,61,0.9);
    border-radius: 20px;
    padding: 5px 12px 5px 8px;
    font: 600 11px/1 'Segoe UI', system-ui, sans-serif;
    color: #e6edf3;
    pointer-events: auto;
    cursor: pointer;
    backdrop-filter: blur(8px);
    user-select: none;
    transition: border-color 0.3s, box-shadow 0.3s;
    letter-spacing: 0.3px;
  }
  #badge:hover { border-color: rgba(88,166,255,0.6); }
  #badge.focused   { box-shadow: 0 0 12px rgba(63,185,80,0.25);  border-color: rgba(63,185,80,0.4); }
  #badge.distracted{ box-shadow: 0 0 12px rgba(210,153,34,0.3);  border-color: rgba(210,153,34,0.5); }
  #badge.lost      { box-shadow: 0 0 12px rgba(248,81,73,0.3);   border-color: rgba(248,81,73,0.5);  }
  #badge.hidden-badge { display: none; }

  #badge-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #3fb950;
    transition: background 0.4s;
    flex-shrink: 0;
  }
  #badge-dot.amber { background: #d29922; }
  #badge-dot.red   { background: #f85149; }
  #badge-dot.gray  { background: #8b949e; }

  #badge-label { font-size: 11px; color: #8b949e; }

  #badge-score {
    font-size: 12px; font-weight: 700;
    min-width: 28px; text-align: right;
    color: #3fb950;
    transition: color 0.4s;
  }
  #badge-score.amber { color: #d29922; }
  #badge-score.red   { color: #f85149; }

  /* Sphere */
  #sphere-wrap {
    position: fixed;
    right: 20px; bottom: 20px;
    display: flex; flex-direction: column; align-items: center;
    opacity: 0;
    transform: scale(0.6) translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
    pointer-events: none;
  }
  #sphere-wrap.visible {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  #sphere-canvas { display: block; }
  #sphere-label {
    font: 700 9px/1 'Segoe UI', monospace;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: rgba(88,166,255,0.75);
    margin-top: 4px;
    text-align: center;
  }

  /* Banner */
  #banner {
    position: fixed;
    top: -60px; left: 50%; transform: translateX(-50%);
    background: rgba(22,27,34,0.95);
    border: 1px solid rgba(210,153,34,0.5);
    border-radius: 10px;
    padding: 9px 18px;
    font: 500 12px/1.4 'Segoe UI', system-ui, sans-serif;
    color: #d29922;
    display: flex; align-items: center; gap: 8px;
    pointer-events: none;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 16px rgba(210,153,34,0.15);
    transition: top 0.4s cubic-bezier(0.34,1.56,0.64,1);
    white-space: nowrap;
    z-index: 1;
  }
  #banner.visible { top: 14px; }

  /* Edge pulse overlay */
  #edge-pulse {
    position: fixed;
    inset: 0;
    border: 3px solid transparent;
    border-radius: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.6s;
  }
  #edge-pulse.active {
    opacity: 1;
    border-color: rgba(210,153,34,0.4);
    box-shadow: inset 0 0 40px rgba(210,153,34,0.15);
    animation: edge-pulse-anim 2s ease-in-out infinite;
  }
  @keyframes edge-pulse-anim {
    0%, 100% { box-shadow: inset 0 0 30px rgba(210,153,34,0.1); }
    50%       { box-shadow: inset 0 0 60px rgba(210,153,34,0.25); }
  }
</style>

<div id="edge-pulse"></div>

<div id="gaze-dot"><div class="dot-ring"></div></div>

<div id="badge" title="Click to toggle gaze dot">
  <div id="badge-dot"></div>
  <span id="badge-label">FocusLens</span>
  <span id="badge-score">—</span>
</div>

<div id="sphere-wrap">
  <canvas id="sphere-canvas" width="110" height="110"></canvas>
  <div id="sphere-label">REFOCUS</div>
</div>

<div id="banner">
  <span id="banner-icon">⚠</span>
  <span id="banner-text">Gaze drift detected — bring your focus back</span>
</div>
`;

  // ── Element refs ────────────────────────────────────────────────────────────

  const $ = (id) => shadow.getElementById(id);
  const gazeDot     = $('gaze-dot');
  const badge       = $('badge');
  const badgeDot    = $('badge-dot');
  const badgeLabel  = $('badge-label');
  const badgeScore  = $('badge-score');
  const sphereWrap  = $('sphere-wrap');
  const sphereCanvas= $('sphere-canvas');
  const banner      = $('banner');
  const bannerText  = $('banner-text');
  const edgePulse   = $('edge-pulse');

  // ── State ───────────────────────────────────────────────────────────────────

  let settings = {
    preset: 'general',
    showGazeDot: true,
    showSphere: true,
    showBanner: true,
    edgePulse: false,
    sensitivity: 5,
    cooldown: 20,         // seconds
    badgeVisible: true,
  };

  const PRESET_CFG = {
    general: { driftLo: 0.28, driftHi: 0.72, vertLo: 0.22, vertHi: 0.80, offTime: 3000, cooldown: 20000, sphereSpeed: 1.0 },
    adhd:    { driftLo: 0.32, driftHi: 0.68, vertLo: 0.25, vertHi: 0.75, offTime: 2000, cooldown: 10000, sphereSpeed: 1.6 },
    autism:  { driftLo: 0.24, driftHi: 0.76, vertLo: 0.20, vertHi: 0.82, offTime: 4000, cooldown: 30000, sphereSpeed: 0.4 },
  };

  const SPHERE_PAL = {
    general: { main: '#58a6ff', dark: '#0d2540', glow: 'rgba(88,166,255,0.35)',  wire: 'rgba(88,166,255,0.28)',  label: 'rgba(88,166,255,0.75)'  },
    adhd:    { main: '#ff6b9d', dark: '#37101f', glow: 'rgba(255,107,157,0.35)', wire: 'rgba(255,107,157,0.28)', label: 'rgba(255,107,157,0.75)' },
    autism:  { main: '#bc8cff', dark: '#1e0d37', glow: 'rgba(188,140,255,0.35)', wire: 'rgba(188,140,255,0.28)', label: 'rgba(188,140,255,0.75)' },
  };

  // Smoothed gaze position
  let smoothX = window.innerWidth * 0.5;
  let smoothY = window.innerHeight * 0.5;
  const LERP = 0.18;

  // Gaze off-screen timer
  let offScreenSince = null;
  let lastIntervention = 0;

  // Focus score (0-100, rolling)
  const focusBuf = Array(20).fill(85);

  // Sphere animation
  let sphereTime = 0;
  let sphereAnimId = null;
  let sphereVisible = false;

  // ── Port to background ───────────────────────────────────────────────────────

  let port;

  function connectPort() {
    port = chrome.runtime.connect({ name: 'focuslens' });
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      setTimeout(connectPort, 2000);
    });
    // ping to wake background if needed
    chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {});
  }

  connectPort();

  // ── Message handler ──────────────────────────────────────────────────────────

  function onMessage(msg) {
    if (msg.type === 'settingsUpdate') {
      Object.assign(settings, msg.settings || {});
      applySettings();
      return;
    }
    if (msg.type === 'gazeUpdate') {
      handleGaze(msg.data);
    }
  }

  function applySettings() {
    gazeDot.style.display = (settings.showGazeDot && settings.badgeVisible !== false) ? 'block' : 'none';
    badge.classList.toggle('hidden-badge', !settings.badgeVisible);
  }

  // ── Gaze processing ──────────────────────────────────────────────────────────

  function handleGaze(data) {
    if (data.error === 'camera_denied') {
      badgeDot.className = 'gray';
      badgeLabel.textContent = 'Camera blocked';
      badgeScore.textContent = '—';
      return;
    }

    if (!data.faceDetected) {
      updateFocusScore(0);
      checkDistraction('no_face');
      badgeDot.className = 'red';
      return;
    }

    const { horizRatio, vertRatio, isBlinking } = data;
    const cfg = PRESET_CFG[settings.preset] || PRESET_CFG.general;

    // ── Map iris position to estimated screen coordinates ──────────────
    // Gain of 2.8: small iris movements → expressive gaze dot movement
    const gain = 2.8 * (settings.sensitivity / 5);
    const targetX = window.innerWidth  * (0.5 + (horizRatio - 0.5) * gain);
    const targetY = window.innerHeight * (0.5 + (vertRatio  - 0.5) * gain);

    // Lerp for smooth movement
    smoothX += (targetX - smoothX) * LERP;
    smoothY += (targetY - smoothY) * LERP;

    if (settings.showGazeDot) {
      gazeDot.style.display = 'block';
      gazeDot.style.left = smoothX + 'px';
      gazeDot.style.top  = smoothY + 'px';
    }

    // ── Off-screen detection ────────────────────────────────────────────
    const lookingAway = horizRatio < cfg.driftLo || horizRatio > cfg.driftHi
                     || vertRatio  < cfg.vertLo  || vertRatio  > cfg.vertHi;

    if (lookingAway) {
      if (!offScreenSince) offScreenSince = Date.now();
      else if (Date.now() - offScreenSince > cfg.offTime) {
        offScreenSince = null;
        checkDistraction('gaze_away');
      }
    } else {
      offScreenSince = null;
    }

    // ── Focus score ─────────────────────────────────────────────────────
    const centered = 1 - Math.max(
      Math.abs(horizRatio - 0.5) * 2,
      Math.abs(vertRatio  - 0.5) * 2
    );
    const score = Math.round(Math.max(0, Math.min(100, centered * 100)));
    updateFocusScore(score);

    // ── Badge state ─────────────────────────────────────────────────────
    const avg = focusBuf.reduce((a, b) => a + b, 0) / focusBuf.length;
    badgeScore.textContent = Math.round(avg) + '%';

    if (avg > 70) {
      badge.className = 'focused';
      badgeDot.className = '';
      badgeScore.className = '';
    } else if (avg > 40) {
      badge.className = 'distracted';
      badgeDot.className = 'amber';
      badgeScore.className = 'amber';
    } else {
      badge.className = 'lost';
      badgeDot.className = 'red';
      badgeScore.className = 'red';
    }
  }

  function updateFocusScore(score) {
    focusBuf.shift();
    focusBuf.push(score);
  }

  function checkDistraction(reason) {
    const cfg = PRESET_CFG[settings.preset] || PRESET_CFG.general;
    const now = Date.now();
    if (now - lastIntervention < cfg.cooldown) return;
    lastIntervention = now;

    const msgs = {
      gaze_away: 'Eyes drifting — bring your focus back',
      no_face:   'Face not detected — are you still there?',
    };

    if (settings.showSphere) triggerSphere();
    if (settings.showBanner) triggerBanner(msgs[reason] || 'Stay focused');
    if (settings.edgePulse)  triggerEdgePulse();
  }

  // ── Sphere ──────────────────────────────────────────────────────────────────

  function triggerSphere() {
    if (sphereVisible) return;
    sphereVisible = true;
    sphereWrap.classList.add('visible');

    // Position sphere — moves if preset changes
    setSpherePosition();
    startSphereAnim();

    setTimeout(() => {
      sphereWrap.classList.remove('visible');
      sphereVisible = false;
      if (sphereAnimId) { cancelAnimationFrame(sphereAnimId); sphereAnimId = null; }
    }, 7000);
  }

  function setSpherePosition() {
    const pos = settings.spherePos || 'br';
    const m = 20;
    sphereWrap.style.bottom = sphereWrap.style.top = sphereWrap.style.left = sphereWrap.style.right = '';
    sphereWrap.style.transform = '';
    if (pos === 'br')     { sphereWrap.style.bottom = m+'px'; sphereWrap.style.right = m+'px'; }
    else if (pos === 'bl'){ sphereWrap.style.bottom = m+'px'; sphereWrap.style.left  = m+'px'; }
    else if (pos === 'tr'){ sphereWrap.style.top    = m+'px'; sphereWrap.style.right = m+'px'; }
    else /* center */     { sphereWrap.style.top = '50%'; sphereWrap.style.left = '50%'; sphereWrap.style.transform = 'translate(-50%,-50%) scale(1.4)'; }
  }

  function startSphereAnim() {
    if (sphereAnimId) cancelAnimationFrame(sphereAnimId);
    const ctx = sphereCanvas.getContext('2d');
    const W = sphereCanvas.width, H = sphereCanvas.height;

    function frame() {
      if (!sphereVisible) return;
      const preset = settings.preset || 'general';
      const cfg = PRESET_CFG[preset];
      sphereTime += 0.013 * cfg.sphereSpeed;
      drawSphere(ctx, W, H, preset, sphereTime);
      sphereAnimId = requestAnimationFrame(frame);
    }
    frame();
  }

  function drawSphere(ctx, W, H, preset, t) {
    const cx = W / 2, cy = H / 2;
    const r = W * 0.36;
    const pal = SPHERE_PAL[preset] || SPHERE_PAL.general;

    ctx.clearRect(0, 0, W, H);

    // Outer glow
    const glowG = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.75);
    glowG.addColorStop(0, pal.glow);
    glowG.addColorStop(1, 'transparent');
    ctx.fillStyle = glowG;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.75, 0, Math.PI * 2); ctx.fill();

    // Sphere body
    const bodyG = ctx.createRadialGradient(cx - r*0.35, cy - r*0.38, r*0.04, cx + r*0.15, cy + r*0.15, r);
    bodyG.addColorStop(0, 'rgba(255,255,255,0.92)');
    bodyG.addColorStop(0.13, pal.main);
    bodyG.addColorStop(0.62, pal.dark);
    bodyG.addColorStop(1, '#000');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // Grid lines clipped to sphere
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.998, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = pal.wire;
    ctx.lineWidth = 0.7;

    // Latitude lines
    for (let i = -3; i <= 3; i++) {
      const y = cy + r * (i / 3.8);
      if (Math.abs(y - cy) >= r) continue;
      const rx = Math.sqrt(r * r - (y - cy) ** 2);
      ctx.beginPath();
      ctx.ellipse(cx, y, rx, rx * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotating longitude lines
    for (let i = 0; i < 4; i++) {
      const angle = t + i * Math.PI / 4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * Math.abs(Math.cos(angle)), r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Specular highlight
    const specG = ctx.createRadialGradient(cx - r*0.42, cy - r*0.44, 0, cx - r*0.28, cy - r*0.28, r*0.52);
    specG.addColorStop(0, 'rgba(255,255,255,0.55)');
    specG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specG;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // Label color update
    const labelEl = $('sphere-label');
    if (labelEl) labelEl.style.color = pal.label;
  }

  // ── Banner ──────────────────────────────────────────────────────────────────

  let bannerTimer = null;
  function triggerBanner(msg) {
    bannerText.textContent = msg;
    banner.classList.add('visible');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('visible'), 4000);
  }

  // ── Edge pulse ──────────────────────────────────────────────────────────────

  let pulseTimer = null;
  function triggerEdgePulse() {
    edgePulse.classList.add('active');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => edgePulse.classList.remove('active'), 5000);
  }

  // ── Badge click — toggle gaze dot ───────────────────────────────────────────

  badge.addEventListener('click', () => {
    settings.showGazeDot = !settings.showGazeDot;
    gazeDot.style.display = settings.showGazeDot ? 'block' : 'none';
    chrome.storage.sync.set({ showGazeDot: settings.showGazeDot });
  });

  // ── Load initial settings ───────────────────────────────────────────────────

  chrome.storage.sync.get(null, (stored) => {
    if (stored && Object.keys(stored).length) {
      Object.assign(settings, stored);
      applySettings();
    }
  });

  // ── Chrome storage change listener ──────────────────────────────────────────

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
    }
    applySettings();
  });

})();
