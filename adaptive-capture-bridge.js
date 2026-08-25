(() => {
  'use strict';
  if (globalThis.__YTSS_ADAPTIVE_CAPTURE_BRIDGE__) return;
  Object.defineProperty(globalThis, '__YTSS_ADAPTIVE_CAPTURE_BRIDGE__', { value: true, configurable: false });

  const ATTR = 'data-ytss-adaptive-capture';
  const EVENT = 'ytss-adaptive-capture';
  const RESET_EVENT = 'ytss-adaptive-reset';

  function currentVideoId() {
    try {
      const url = new URL(location.href);
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
      return url.searchParams.get('v');
    } catch {
      return null;
    }
  }

  function publish(capture) {
    if (!capture || typeof capture !== 'object' || typeof capture.url !== 'string') return;
    const payload = {
      ...capture,
      pageHref: location.href,
      videoId: currentVideoId(),
      bridgedAt: Date.now()
    };
    try {
      document.documentElement.setAttribute(ATTR, JSON.stringify(payload));
      document.dispatchEvent(new Event(EVENT));
    } finally {
      document.documentElement.removeAttribute(ATTR);
    }
  }

  async function prime() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'YTSS_GET_MEDIA_CAPTURES' });
      for (const capture of response?.captures || []) publish(capture);
    } catch {}
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'YTSS_MEDIA_CAPTURE') publish(message.capture);
    return false;
  });

  document.addEventListener('yt-navigate-start', () => {
    document.dispatchEvent(new Event(RESET_EVENT));
    chrome.runtime.sendMessage({ type: 'YTSS_CLEAR_MEDIA_CAPTURES' }).catch(() => {});
  }, true);

  prime();
})();
