// background.js — service worker
// Manages the offscreen document (camera + MediaPipe) and relays gaze data
// to the active tab's content script and to the dashboard page if open.

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

const contentPorts = new Map(); // tabId → port
let dashboardPort  = null;      // single dashboard page

// ── Offscreen document lifecycle ────────────────────────────────────────────

async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument().catch(() => false);
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Webcam eye tracking for study focus detection'
    });
  }
}

chrome.runtime.onInstalled.addListener(ensureOffscreen);
chrome.runtime.onStartup.addListener(ensureOffscreen);

// ── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    ensureOffscreen();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'gazeUpdate') {
    // → active tab content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const port = contentPorts.get(tabs[0]?.id);
      if (port) try { port.postMessage(msg); } catch (_) {}
    });
    // → dashboard (always, regardless of active tab)
    if (dashboardPort) try { dashboardPort.postMessage(msg); } catch (_) {}
  }

  if (msg.type === 'settingsUpdate') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const port = contentPorts.get(tabs[0]?.id);
      if (port) try { port.postMessage(msg); } catch (_) {}
    });
    if (dashboardPort) try { dashboardPort.postMessage(msg); } catch (_) {}
  }

  if (msg.type === 'openDashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});

// ── Port connections ─────────────────────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  // Dashboard page
  if (port.name === 'focuslens-dashboard') {
    dashboardPort = port;
    port.onDisconnect.addListener(() => { dashboardPort = null; });
    chrome.storage.sync.get(null, (s) => {
      try { port.postMessage({ type: 'settingsUpdate', settings: s }); } catch (_) {}
    });
    ensureOffscreen();
    return;
  }

  // Content scripts
  if (port.name === 'focuslens') {
    const tabId = port.sender?.tab?.id;
    if (!tabId) return;
    contentPorts.set(tabId, port);
    port.onDisconnect.addListener(() => contentPorts.delete(tabId));
    chrome.storage.sync.get(null, (s) => {
      try { port.postMessage({ type: 'settingsUpdate', settings: s }); } catch (_) {}
    });
    ensureOffscreen();
  }
});
