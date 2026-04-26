// offscreen.js — runs in the hidden offscreen document
// Accesses the webcam, runs MediaPipe FaceMesh with iris landmarks,
// computes gaze ratios and sends them to background.js every frame.

(async () => {
  const video = document.getElementById('video');

  // ── Camera ───────────────────────────────────────────────────────────────

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user', frameRate: { ideal: 20 } },
      audio: false
    });
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'gazeUpdate', data: { error: 'camera_denied' } });
    return;
  }

  video.srcObject = stream;
  await new Promise(res => { video.onloadedmetadata = res; });
  await video.play();

  // ── MediaPipe FaceMesh ───────────────────────────────────────────────────

  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,      // enables iris landmarks 468-477
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  // Rolling blink buffer for blink-rate anomaly detection
  const blinkBuf = [];
  let lastBlink = false;
  let blinkCount = 0;
  let blinkWindowStart = Date.now();

  faceMesh.onResults((results) => {
    if (!results.multiFaceLandmarks?.length) {
      chrome.runtime.sendMessage({ type: 'gazeUpdate', data: { faceDetected: false } });
      return;
    }

    const lm = results.multiFaceLandmarks[0];

    // ── Iris landmarks ──────────────────────────────────────────────────
    // Left eye:  outer corner=33, inner corner=133, top=159, bottom=145
    //            iris center=468
    // Right eye: outer corner=263, inner corner=362, top=386, bottom=374
    //            iris center=473

    const leftIris  = lm[468];
    const rightIris = lm[473];

    const lOuter = lm[33],  lInner = lm[133];
    const rOuter = lm[263], rInner = lm[362];
    const lTop   = lm[159], lBot   = lm[145];
    const rTop   = lm[386], rBot   = lm[374];

    // Horizontal iris ratio within each eye: 0=far outer, 0.5=center, 1=far inner
    const leftH  = safeDivide(leftIris.x  - lOuter.x, lInner.x - lOuter.x);
    const rightH = safeDivide(rightIris.x - rInner.x, rOuter.x - rInner.x);
    // Average both eyes, invert right eye (mirrored)
    const horizRatio = (leftH + (1 - rightH)) / 2;

    // Vertical iris ratio: 0=far up, 0.5=center, 1=far down
    const leftV  = safeDivide(leftIris.y  - lTop.y, lBot.y - lTop.y);
    const rightV = safeDivide(rightIris.y - rTop.y, rBot.y - rTop.y);
    const vertRatio = (leftV + rightV) / 2;

    // ── Eye Aspect Ratio (blink) ────────────────────────────────────────
    const leftEAR  = eyeAR(lm, [33, 160, 158, 133, 153, 144]);
    const rightEAR = eyeAR(lm, [263, 387, 385, 362, 380, 373]);
    const ear = (leftEAR + rightEAR) / 2;
    const isBlinking = ear < 0.18;

    // Count blinks per minute
    if (isBlinking && !lastBlink) blinkCount++;
    lastBlink = isBlinking;
    const elapsed = (Date.now() - blinkWindowStart) / 60000;
    const blinksPerMin = elapsed > 0 ? blinkCount / elapsed : 17;
    if (Date.now() - blinkWindowStart > 60000) {
      blinkCount = 0; blinkWindowStart = Date.now();
    }

    chrome.runtime.sendMessage({
      type: 'gazeUpdate',
      data: {
        faceDetected: true,
        horizRatio: clamp(horizRatio, 0, 1),
        vertRatio:  clamp(vertRatio,  0, 1),
        isBlinking,
        ear: Math.round(ear * 100) / 100,
        blinksPerMin: Math.round(blinksPerMin)
      }
    });
  });

  // ── Frame loop ───────────────────────────────────────────────────────────

  async function processFrame() {
    if (video.readyState >= 2) {
      await faceMesh.send({ image: video });
    }
    setTimeout(processFrame, 50); // ~20fps to balance accuracy vs CPU
  }

  processFrame();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function eyeAR(lm, idx) {
    const p = idx.map(i => lm[i]);
    const vertical1 = dist(p[1], p[5]);
    const vertical2 = dist(p[2], p[4]);
    const horizontal = dist(p[0], p[3]);
    return (vertical1 + vertical2) / (2 * horizontal);
  }

  function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  function safeDivide(num, den) {
    return Math.abs(den) < 0.001 ? 0.5 : num / den;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
})();
