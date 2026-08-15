// CP-Agent Service Worker (Manifest V3)
// Minimal — extension logic lives in popup.js
// Service worker is ephemeral; no state stored in variables.

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[CP-Agent] Extension installed.');
});
