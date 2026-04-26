// background.js — service worker
// Manages the offscreen document (camera + MediaPipe) and relays gaze data to active tab.

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

// Ports keyed by tabId — content scripts connect on load
const contentPorts = new Map();

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

// Re-create offscreen doc if service worker restarts and loses state
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    ensureOffscreen();
    sendResponse({ ok: true });
    return true;
  }

  // Forward gaze data from offscreen → active tab's content script
  if (msg.type === 'gazeUpdate') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      const port = contentPorts.get(tabId);
      if (port) {
        try { port.postMessage(msg); } catch (_) {}
      }
    });
  }

  // Forward settings changes to active tab
  if (msg.type === 'settingsUpdate') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      const port = contentPorts.get(tabId);
      if (port) {
        try { port.postMessage(msg); } catch (_) {}
      }
    });
  }
});

// ── Content script port connections ─────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'focuslens') return;
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;

  contentPorts.set(tabId, port);
  port.onDisconnect.addListener(() => contentPorts.delete(tabId));

  // Tell the new content script its current settings
  chrome.storage.sync.get(null, (settings) => {
    try { port.postMessage({ type: 'settingsUpdate', settings }); } catch (_) {}
  });

  // Ensure offscreen is running
  ensureOffscreen();
});
