'use strict';

// Keep the existing background behavior intact, then add a read-only media-request observer.
importScripts('background.js');

(() => {
  const MAX_PER_TAB = 160;
  const TTL_MS = 12 * 60 * 1000;
  const capturesByTab = new Map();

  function isGooglevideo(raw) {
    try {
      const url = new URL(String(raw || ''));
      return url.protocol === 'https:'
        && (url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com'))
        && /\/videoplayback(?:$|[/?])/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function parseCapture(raw, at = Date.now()) {
    if (!isGooglevideo(raw)) return null;
    try {
      const url = new URL(raw);
      const itag = Number(url.searchParams.get('itag'));
      if (!Number.isFinite(itag) || itag <= 0) return null;
      return {
        url: url.href,
        itag,
        at,
        sabr: url.searchParams.get('sabr') === '1',
        range: url.searchParams.get('range') || null,
        sq: url.searchParams.get('sq') || null,
        expire: Number(url.searchParams.get('expire')) || null
      };
    } catch {
      return null;
    }
  }

  function prune(list, now = Date.now()) {
    const fresh = list.filter(item => item && now - item.at <= TTL_MS);
    if (fresh.length > MAX_PER_TAB) fresh.splice(0, fresh.length - MAX_PER_TAB);
    return fresh;
  }

  function remember(tabId, raw) {
    if (!Number.isInteger(tabId) || tabId < 0) return null;
    const item = parseCapture(raw);
    if (!item) return null;
    const list = prune(capturesByTab.get(tabId) || []);
    const duplicate = list.findIndex(entry => entry.url === item.url);
    if (duplicate >= 0) list.splice(duplicate, 1);
    list.push(item);
    capturesByTab.set(tabId, prune(list));
    return item;
  }

  function listFor(tabId) {
    if (!Number.isInteger(tabId) || tabId < 0) return [];
    const list = prune(capturesByTab.get(tabId) || []);
    capturesByTab.set(tabId, list);
    return list.map(item => ({ ...item }));
  }

  chrome.webRequest.onBeforeRequest.addListener(details => {
    const item = remember(details.tabId, details.url);
    if (!item) return;
    chrome.tabs.sendMessage(details.tabId, { type: 'YTSS_MEDIA_CAPTURE', capture: item }).catch(() => {});
  }, {
    urls: ['https://*.googlevideo.com/*'],
    types: ['media', 'xmlhttprequest', 'other']
  });

  chrome.tabs.onRemoved.addListener(tabId => capturesByTab.delete(tabId));

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'YTSS_GET_MEDIA_CAPTURES') {
      const tabId = Number.isInteger(message.tabId) && message.tabId >= 0 ? message.tabId : sender.tab?.id;
      sendResponse({ ok: true, captures: listFor(tabId), at: Date.now() });
      return false;
    }
    if (message.type === 'YTSS_CLEAR_MEDIA_CAPTURES') {
      const tabId = Number.isInteger(message.tabId) && message.tabId >= 0 ? message.tabId : sender.tab?.id;
      if (Number.isInteger(tabId)) capturesByTab.delete(tabId);
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
