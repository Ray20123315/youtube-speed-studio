(() => {
  'use strict';
  if (globalThis.__YOUTUBE_SPEED_STUDIO_PAGE_CONTEXT_V100__) return;
  Object.defineProperty(globalThis, '__YOUTUBE_SPEED_STUDIO_PAGE_CONTEXT_V100__', { value: true, configurable: false });

  const ATTR = 'data-ytss-page-context';
  const READY_EVENT = 'ytss-page-context-ready';
  const REQUEST_EVENT = 'ytss-request-page-context';
  const DOWNLOAD_ATTR = 'data-ytss-download-studio-info';
  const DOWNLOAD_READY_EVENT = 'ytss-download-studio-info-ready';
  const DOWNLOAD_REQUEST_EVENT = 'ytss-request-download-studio-info';
  let publishTimer = null;
  const observedMediaByItag = new Map();
  const capturedPlayerResponses = [];
  const MAX_OBSERVED_MEDIA = 96;
  const MAX_CAPTURED_RESPONSES = 16;
  const EMBEDDED_CLIENT_FALLBACK_VERSION = '2.20260722.01.00';
  const EMBEDDED_FALLBACK_TTL_MS = 15000;
  const ALT_CLIENTS = [
    { key: 'tv', clientName: 'TVHTML5', clientVersion: '7.20260707.07.00', clientNumber: '7', userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)' },
    { key: 'mweb', clientName: 'MWEB', clientVersion: '2.20260708.05.00', clientNumber: '2', userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)' }
  ];
  const ALT_FALLBACK_TTL_MS = 20000;
  let resourceObserver = null;
  let embeddedFallbackPromise = null;
  let embeddedFallbackVideoId = null;
  let embeddedFallbackAt = 0;
  let embeddedFallbackStatus = null;
  let alternateFallbackPromise = null;
  let alternateFallbackVideoId = null;
  let alternateFallbackAt = 0;
  let alternateFallbackStatuses = [];

  function isGooglevideoUrl(raw) {
    try {
      const url = new URL(String(raw || ''), location.href);
      return url.protocol === 'https:' && (url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com')) && /\/videoplayback(?:$|[/?])/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function normalizeObservedMediaUrl(raw) {
    try {
      const url = new URL(String(raw || ''), location.href);
      if (!isGooglevideoUrl(url.href)) return null;
      if (url.searchParams.get('sabr') === '1') return null;
      const signed = new Set(String(url.searchParams.get('sparams') || '').split(',').map(v => v.trim()).filter(Boolean));
      if ((signed.has('range') && url.searchParams.has('range')) || (signed.has('sq') && url.searchParams.has('sq'))) return null;
      for (const key of ['range', 'rn', 'rbuf', 'sq', 'alr']) {
        if (!signed.has(key)) url.searchParams.delete(key);
      }
      return url.href;
    } catch {
      return null;
    }
  }

  function rememberObservedMediaUrl(raw) {
    const url = normalizeObservedMediaUrl(raw);
    if (!url) return;
    try {
      const parsed = new URL(url);
      const itag = Number(parsed.searchParams.get('itag'));
      if (!Number.isFinite(itag) || itag <= 0) return;
      const item = { url, videoId: currentVideoId(), at: Date.now() };
      observedMediaByItag.delete(itag);
      observedMediaByItag.set(itag, item);
      while (observedMediaByItag.size > MAX_OBSERVED_MEDIA) observedMediaByItag.delete(observedMediaByItag.keys().next().value);
    } catch {
      // Runtime-only best effort. Never persisted.
    }
  }

  function rememberPlayerResponse(value) {
    const response = parseMaybeJson(value);
    if (!response || !response.streamingData) return;
    const id = response?.videoDetails?.videoId || null;
    const current = currentVideoId();
    if (current && id && current !== id) return;
    capturedPlayerResponses.push(response);
    while (capturedPlayerResponses.length > MAX_CAPTURED_RESPONSES) capturedPlayerResponses.shift();
  }

  function scanPerformanceMediaUrls() {
    try {
      for (const entry of performance?.getEntriesByType?.('resource') || []) rememberObservedMediaUrl(entry?.name);
    } catch {
      // Resource timing may be unavailable or restricted.
    }
  }

  function installResourceObserver() {
    if (resourceObserver || typeof PerformanceObserver !== 'function') return;
    try {
      resourceObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) rememberObservedMediaUrl(entry?.name);
      });
      resourceObserver.observe({ type: 'resource', buffered: true });
    } catch {
      try {
        resourceObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) rememberObservedMediaUrl(entry?.name);
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
      } catch {
        resourceObserver = null;
      }
    }
  }

  function installEphemeralNetworkCapture() {
    try {
      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function' && !originalFetch.__ytssCaptureWrapped) {
        const wrappedFetch = function(input, init) {
          const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
          rememberObservedMediaUrl(raw);
          const result = originalFetch.apply(this, arguments);
          if (/\/youtubei\/v1\/player(?:[?]|$)/i.test(String(raw || ''))) {
            Promise.resolve(result).then(response => response?.clone?.().json?.()).then(rememberPlayerResponse).catch(() => {});
          }
          return result;
        };
        try { Object.defineProperty(wrappedFetch, '__ytssCaptureWrapped', { value: true }); } catch {}
        window.fetch = wrappedFetch;
      }
    } catch {
      // Never interfere with YouTube if fetch wrapping is unavailable.
    }

    try {
      const proto = window.XMLHttpRequest?.prototype;
      const originalOpen = proto?.open;
      if (typeof originalOpen === 'function' && !originalOpen.__ytssCaptureWrapped) {
        const wrappedOpen = function(method, url) {
          rememberObservedMediaUrl(url);
          if (/\/youtubei\/v1\/player(?:[?]|$)/i.test(String(url || ''))) {
            try {
              this.addEventListener('load', () => {
                try { rememberPlayerResponse(this.responseType === 'json' ? this.response : this.responseText); } catch {}
              }, { once: true });
            } catch {}
          }
          return originalOpen.apply(this, arguments);
        };
        try { Object.defineProperty(wrappedOpen, '__ytssCaptureWrapped', { value: true }); } catch {}
        proto.open = wrappedOpen;
      }
    } catch {
      // XHR capture is best-effort only.
    }
  }

  function safeObject(value) {
    return value && typeof value === 'object' ? value : null;
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function currentVideoId() {
    const params = new URLSearchParams(location.search);
    if (location.pathname.startsWith('/shorts/')) return location.pathname.split('/')[2] || null;
    return params.get('v') || null;
  }

  function playerResponseCandidates() {
    const activeShort = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]');
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const player = activeShort?.querySelector?.('ytd-player') || document.querySelector('ytd-player');
    const moviePlayer = activeShort?.querySelector?.('#movie_player') || document.querySelector('#movie_player');
    const rawConfig = window.ytplayer?.config?.args?.player_response;
    return [
      moviePlayer?.getPlayerResponse?.(),
      ...capturedPlayerResponses.slice().reverse(),
      activeShort?.data?.playerResponse,
      activeShort?.__data?.data?.playerResponse,
      watchFlexy?.data?.playerResponse,
      watchFlexy?.__data?.data?.playerResponse,
      watchFlexy?.playerData?.playerResponse,
      player?.playerResponse,
      window.ytInitialPlayerResponse,
      parseMaybeJson(rawConfig)
    ].map(parseMaybeJson).filter(Boolean);
  }

  function currentPlayerResponses() {
    const id = currentVideoId();
    const candidates = playerResponseCandidates();
    const matching = id ? candidates.filter(candidate => candidate?.videoDetails?.videoId === id) : candidates;
    const seen = new Set();
    return matching.filter(candidate => {
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      return true;
    });
  }

  function responseFormatCount(response) {
    const streaming = response?.streamingData || {};
    return (Array.isArray(streaming.formats) ? streaming.formats.length : 0) + (Array.isArray(streaming.adaptiveFormats) ? streaming.adaptiveFormats.length : 0);
  }

  function currentPlayerResponse() {
    return currentPlayerResponses().sort((a, b) => responseFormatCount(b) - responseFormatCount(a))[0] || null;
  }

  function currentPlayerVideoData() {
    try {
      const activeShort = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]');
      const moviePlayer = activeShort?.querySelector?.('#movie_player') || document.querySelector('#movie_player');
      const data = moviePlayer?.getVideoData?.();
      if (!data || typeof data !== 'object') return null;
      const currentId = currentVideoId();
      const dataId = data.video_id || data.videoId || null;
      if (currentId && dataId && currentId !== dataId) return null;
      return data;
    } catch {
      return null;
    }
  }

  function activeRendererData() {
    const activeShort = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]');
    const watch = document.querySelector('ytd-watch-flexy');
    return activeShort?.data || activeShort?.__data?.data || watch?.data || watch?.__data?.data || null;
  }

  function findChannelFields(root, maxDepth = 8) {
    const seen = new Set();
    const queue = [{ value: root, depth: 0 }];
    let channelId = null;
    let channelName = null;

    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== 'object' || seen.has(value) || depth > maxDepth) continue;
      seen.add(value);

      if (!channelId) {
        const ids = [value.channelId, value.externalChannelId, value.browseId];
        channelId = ids.find(id => typeof id === 'string' && /^UC[\w-]{10,}$/.test(id)) || null;
      }
      if (!channelName) {
        const textCandidates = [
          value.author,
          value.ownerChannelName,
          value.channelName,
          value.name,
          value.title?.simpleText,
          value.ownerText?.runs?.[0]?.text,
          value.shortBylineText?.runs?.[0]?.text
        ];
        channelName = textCandidates.find(text => typeof text === 'string' && text.trim())?.trim() || null;
      }
      if (channelId && channelName) break;

      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') queue.push({ value: child, depth: depth + 1 });
      }
    }
    return { channelId, channelName };
  }

  function extract() {
    const videoId = currentVideoId();
    const response = currentPlayerResponse();
    const details = safeObject(response?.videoDetails);
    const playerVideoData = currentPlayerVideoData();
    const metaChannelId = document.head?.querySelector('meta[itemprop="channelId"][content]')?.content?.trim() || null;
    const metaAuthor = document.head?.querySelector('meta[itemprop="author"][content], meta[name="author"][content]')?.content?.trim() || null;
    let channelId = typeof details?.channelId === 'string' ? details.channelId : null;
    let channelName = typeof details?.author === 'string' ? details.author.trim() : null;
    let source = channelId ? 'player-response' : null;

    if (!channelName && typeof playerVideoData?.author === 'string' && playerVideoData.author.trim()) {
      channelName = playerVideoData.author.trim();
      source ||= 'player-video-data';
    }

    if (!channelId || !channelName) {
      const fromRenderer = findChannelFields(activeRendererData());
      channelId ||= fromRenderer.channelId;
      channelName ||= fromRenderer.channelName;
      if (channelId && !source) source = 'renderer-data';
    }

    channelId ||= metaChannelId;
    channelName ||= metaAuthor;
    if (channelId && !source) source = 'meta-channel-id';

    return {
      href: location.href,
      videoId,
      channelId: channelId || null,
      channelName: channelName || null,
      source: source || null,
      at: Date.now()
    };
  }


  function activeMoviePlayer() {
    const activeShort = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]');
    return activeShort?.querySelector?.('#movie_player') || document.querySelector('#movie_player');
  }

  function qualityTokenHeight(value) {
    const token = String(value || '').toLowerCase();
    const numeric = Number(token.match(/(\d{3,4})/)?.[1]);
    if (numeric >= 100) return numeric;
    const map = {
      highres: 4320,
      hd4320: 4320,
      hd2880: 2880,
      hd2160: 2160,
      hd1440: 1440,
      hd1080: 1080,
      hd720: 720,
      large: 480,
      medium: 360,
      small: 240,
      tiny: 144,
      auto: 0
    };
    return map[token] || 0;
  }

  function nativePlayerQualityInfo() {
    const player = activeMoviePlayer();
    const rows = [];
    try {
      const data = player?.getAvailableQualityData?.();
      if (Array.isArray(data)) {
        for (const item of data) {
          const label = String(item?.qualityLabel || item?.quality || '').trim();
          const height = Number(item?.height) || qualityTokenHeight(item?.quality) || qualityTokenHeight(label);
          if (height) rows.push({ label: label || `${height}p`, height });
        }
      }
    } catch {}
    if (!rows.length) {
      try {
        const levels = player?.getAvailableQualityLevels?.();
        if (Array.isArray(levels)) {
          for (const level of levels) {
            const height = qualityTokenHeight(level);
            if (height) rows.push({ label: `${height}p`, height });
          }
        }
      } catch {}
    }
    const unique = new Map();
    for (const row of rows) if (!unique.has(row.height)) unique.set(row.height, row);
    const values = [...unique.values()].sort((a, b) => b.height - a.height);
    return {
      maxHeight: values[0]?.height || 0,
      labels: values.map(row => row.label || `${row.height}p`),
      heights: values.map(row => row.height)
    };
  }

  function ytcfgValue(key) {
    try { return window.ytcfg?.get?.(key); } catch { return null; }
  }

  function clonePlain(value) {
    if (!value || typeof value !== 'object') return null;
    try { return structuredClone(value); } catch {
      try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
    }
  }

  function embeddedClientContext(videoId) {
    const base = clonePlain(ytcfgValue('INNERTUBE_CONTEXT')) || {};
    const baseClient = safeObject(base.client) || {};
    const configuredVersion = ytcfgValue('INNERTUBE_CONTEXT_CLIENT_VERSION') || baseClient.clientVersion;
    const configuredName = String(baseClient.clientName || '');
    const clientVersion = configuredName === 'WEB_EMBEDDED_PLAYER' && /^\d+\.\d{8}/.test(String(configuredVersion || ''))
      ? String(configuredVersion)
      : EMBEDDED_CLIENT_FALLBACK_VERSION;
    const visitorData = baseClient.visitorData || ytcfgValue('VISITOR_DATA') || null;
    const client = {
      hl: baseClient.hl || document.documentElement?.lang || 'en',
      gl: baseClient.gl || 'US',
      clientName: 'WEB_EMBEDDED_PLAYER',
      clientVersion,
      clientScreen: 'EMBED',
      platform: 'DESKTOP'
    };
    if (visitorData) client.visitorData = visitorData;
    const context = {
      client,
      thirdParty: { embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` }
    };
    if (safeObject(base.user)) context.user = base.user;
    if (safeObject(base.request)) context.request = base.request;
    return { context, clientVersion, visitorData };
  }

  async function fetchEmbeddedPlayerResponse(videoId) {
    const apiKey = String(ytcfgValue('INNERTUBE_API_KEY') || '').trim();
    if (!videoId || !apiKey) {
      embeddedFallbackStatus = { ok: false, code: 'config-unavailable', at: Date.now() };
      return null;
    }

    const now = Date.now();
    if (embeddedFallbackVideoId === videoId && embeddedFallbackPromise && now - embeddedFallbackAt < EMBEDDED_FALLBACK_TTL_MS) {
      return embeddedFallbackPromise;
    }

    embeddedFallbackVideoId = videoId;
    embeddedFallbackAt = now;
    const { context, clientVersion, visitorData } = embeddedClientContext(videoId);
    const sts = Number(ytcfgValue('STS')) || 0;
    const body = {
      context,
      videoId,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
          ...(sts > 0 ? { signatureTimestamp: sts } : {})
        }
      },
      contentCheckOk: true,
      racyCheckOk: true
    };

    embeddedFallbackPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const headers = {
          'content-type': 'application/json',
          'x-youtube-client-name': '56',
          'x-youtube-client-version': clientVersion
        };
        if (visitorData) headers['x-goog-visitor-id'] = visitorData;
        const response = await fetch(`/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!response.ok) {
          embeddedFallbackStatus = { ok: false, code: `http-${response.status}`, at: Date.now() };
          return null;
        }
        const playerResponse = await response.json();
        const returnedId = playerResponse?.videoDetails?.videoId || null;
        if (returnedId && returnedId !== videoId) {
          embeddedFallbackStatus = { ok: false, code: 'video-mismatch', at: Date.now() };
          return null;
        }
        const status = String(playerResponse?.playabilityStatus?.status || 'UNKNOWN');
        if (!playerResponse?.streamingData) {
          embeddedFallbackStatus = { ok: false, code: `playability-${status.toLowerCase()}`, at: Date.now() };
          return null;
        }
        rememberPlayerResponse(playerResponse);
        embeddedFallbackStatus = { ok: true, code: 'web-embedded', at: Date.now() };
        return playerResponse;
      } catch (error) {
        embeddedFallbackStatus = { ok: false, code: error?.name === 'AbortError' ? 'timeout' : 'request-failed', at: Date.now() };
        return null;
      } finally {
        clearTimeout(timer);
      }
    })();
    return embeddedFallbackPromise;
  }



  function alternateClientContext(spec) {
    const base = clonePlain(ytcfgValue('INNERTUBE_CONTEXT')) || {};
    const baseClient = safeObject(base.client) || {};
    const visitorData = baseClient.visitorData || ytcfgValue('VISITOR_DATA') || null;
    const client = {
      hl: baseClient.hl || document.documentElement?.lang || 'en',
      gl: baseClient.gl || 'US',
      clientName: spec.clientName,
      clientVersion: spec.clientVersion,
      platform: 'DESKTOP'
    };
    if (spec.userAgent) client.userAgent = spec.userAgent;
    if (visitorData) client.visitorData = visitorData;
    const context = { client };
    if (safeObject(base.user)) context.user = base.user;
    if (safeObject(base.request)) context.request = base.request;
    return { context, visitorData };
  }

  async function fetchAlternatePlayerResponses(videoId) {
    const apiKey = String(ytcfgValue('INNERTUBE_API_KEY') || '').trim();
    if (!videoId || !apiKey) return [];
    const now = Date.now();
    if (alternateFallbackVideoId === videoId && alternateFallbackPromise && now - alternateFallbackAt < ALT_FALLBACK_TTL_MS) return alternateFallbackPromise;
    alternateFallbackVideoId = videoId;
    alternateFallbackAt = now;
    alternateFallbackStatuses = [];
    alternateFallbackPromise = (async () => {
      const results = [];
      for (const spec of ALT_CLIENTS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3200);
        try {
          const { context, visitorData } = alternateClientContext(spec);
          const body = { context, videoId, contentCheckOk: true, racyCheckOk: true };
          const headers = {
            'content-type': 'application/json',
            'x-youtube-client-name': spec.clientNumber,
            'x-youtube-client-version': spec.clientVersion
          };
          if (visitorData) headers['x-goog-visitor-id'] = visitorData;
          const response = await fetch(`/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(apiKey)}`, {
            method: 'POST', credentials: 'include', cache: 'no-store', headers, body: JSON.stringify(body), signal: controller.signal
          });
          if (!response.ok) {
            alternateFallbackStatuses.push({ key: spec.key, ok: false, code: `http-${response.status}`, at: Date.now() });
            continue;
          }
          const playerResponse = await response.json();
          const returnedId = playerResponse?.videoDetails?.videoId || null;
          if (returnedId && returnedId !== videoId) {
            alternateFallbackStatuses.push({ key: spec.key, ok: false, code: 'video-mismatch', at: Date.now() });
            continue;
          }
          const count = responseFormatCount(playerResponse);
          if (!playerResponse?.streamingData || !count) {
            alternateFallbackStatuses.push({ key: spec.key, ok: false, code: `no-formats-${String(playerResponse?.playabilityStatus?.status || 'unknown').toLowerCase()}`, at: Date.now() });
            continue;
          }
          rememberPlayerResponse(playerResponse);
          results.push(playerResponse);
          alternateFallbackStatuses.push({ key: spec.key, ok: true, code: `formats-${count}`, at: Date.now() });
        } catch (error) {
          alternateFallbackStatuses.push({ key: spec.key, ok: false, code: error?.name === 'AbortError' ? 'timeout' : 'request-failed', at: Date.now() });
        } finally {
          clearTimeout(timer);
        }
      }
      return results;
    })();
    return alternateFallbackPromise;
  }

  function sanitizeFilenamePart(value) {
    return String(value || '').replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function parseMime(mimeType) {
    const raw = String(mimeType || '');
    const container = (raw.match(/^\s*([^;]+)/)?.[1] || '').toLowerCase();
    const codecs = (raw.match(/codecs="([^"]+)"/i)?.[1] || '').split(',').map(v => v.trim()).filter(Boolean);
    return { raw, container, codecs };
  }

  function rawDirectUrl(format) {
    const url = typeof format?.url === 'string' ? normalizeObservedMediaUrl(format.url) : null;
    return url && isGooglevideoUrl(url) ? url : null;
  }

  function cipherDirectUrl(format) {
    const raw = typeof format?.signatureCipher === 'string' ? format.signatureCipher : (typeof format?.cipher === 'string' ? format.cipher : '');
    if (!raw) return null;
    try {
      const params = new URLSearchParams(raw);
      if (params.get('s')) return null;
      const base = normalizeObservedMediaUrl(params.get('url'));
      if (!base) return null;
      const url = new URL(base);
      const sig = params.get('sig') || params.get('signature');
      const sp = params.get('sp') || 'signature';
      if (sig) url.searchParams.set(sp, sig);
      return isGooglevideoUrl(url.href) ? url.href : null;
    } catch {
      return null;
    }
  }

  function observedUrlForItag(itag) {
    const item = observedMediaByItag.get(Number(itag));
    if (!item) return null;
    const current = currentVideoId();
    if (item.videoId && current && item.videoId !== current) return null;
    return item.url;
  }

  function resolvedUrl(format) {
    const direct = rawDirectUrl(format);
    if (direct) return { url: direct, source: 'player-response' };
    const cipher = cipherDirectUrl(format);
    if (cipher) return { url: cipher, source: 'cipher-direct' };
    const observed = observedUrlForItag(format?.itag);
    if (observed) return { url: observed, source: 'player-observed' };
    return { url: null, source: null };
  }

  function safeDirectUrl(format) {
    return resolvedUrl(format).url;
  }

  function formatMeta(format, kind) {
    const mime = parseMime(format?.mimeType);
    const codec = mime.codecs.join(', ');
    const resolved = resolvedUrl(format);
    return {
      itag: Number(format?.itag) || null,
      kind,
      url: resolved.url,
      urlSource: resolved.source,
      mimeType: mime.raw,
      container: mime.container,
      codec,
      codecs: mime.codecs,
      quality: format?.quality ? String(format.quality) : null,
      qualityLabel: format?.qualityLabel ? String(format.qualityLabel) : null,
      width: Number(format?.width) || null,
      height: Number(format?.height) || null,
      fps: Number(format?.fps) || null,
      bitrate: Number(format?.bitrate) || null,
      averageBitrate: Number(format?.averageBitrate) || null,
      contentLength: Number(format?.contentLength) || null,
      approxDurationMs: Number(format?.approxDurationMs) || null,
      audioQuality: format?.audioQuality ? String(format.audioQuality) : null,
      audioSampleRate: Number(format?.audioSampleRate) || null,
      audioChannels: Number(format?.audioChannels) || null,
      hasCipher: Boolean(format?.signatureCipher || format?.cipher),
      hasDrm: Boolean(format?.drmFamilies?.length || format?.licenseInfos?.length)
    };
  }

  function scoreAudio(format) {
    const codec = String(format.codec || '');
    const aac = /(?:mp4a|aac)/i.test(codec) ? 1 : 0;
    return aac * 1e12 + (format.bitrate || format.averageBitrate || 0);
  }

  function qualityRank(choice) {
    return (choice.height || 0) * 1e9 + (choice.fps || 0) * 1e6 + (choice.bitrate || 0);
  }

  function formatRecordScore(format) {
    return (rawDirectUrl(format) ? 1e12 : 0) + (cipherDirectUrl(format) ? 5e11 : 0) + (Number(format?.contentLength) || 0) + (Number(format?.bitrate) || 0);
  }

  function mergeFormatLists(responses, field) {
    const byKey = new Map();
    for (const response of responses) {
      const list = response?.streamingData?.[field];
      if (!Array.isArray(list)) continue;
      for (const format of list) {
        if (!format || typeof format !== 'object') continue;
        const mime = String(format.mimeType || '');
        const key = `${Number(format.itag) || 0}|${mime}|${format.qualityLabel || ''}|${format.audioQuality || ''}`;
        const current = byKey.get(key);
        if (!current || formatRecordScore(format) > formatRecordScore(current)) byKey.set(key, format);
      }
    }
    return [...byKey.values()];
  }

  function videoCodecFamily(format) {
    const codec = String(format?.codec || format?.codecs?.join?.(',') || '').toLowerCase();
    if (/avc1|avc3|h264/.test(codec)) return 'H.264';
    if (/av01|av1/.test(codec)) return 'AV1';
    if (/vp09|vp9/.test(codec)) return 'VP9';
    if (/hev1|hvc1|hevc|h265/.test(codec)) return 'HEVC';
    return codec ? codec.split(/[., ]/)[0].toUpperCase() : '未知';
  }

  function buildQualityAvailability(adaptive, progressive, choices, nativeQuality) {
    const records = [...progressive, ...adaptive]
      .map(format => formatMeta(format, 'quality-probe'))
      .filter(format => format.height && !format.hasDrm && String(format.container || '').startsWith('video/'));
    const heights = [...new Set([...(nativeQuality?.heights || []), ...records.map(r => r.height), ...choices.map(c => c.height)].filter(Boolean))]
      .sort((a, b) => b - a);
    return heights.map(height => {
      const formats = records.filter(format => format.height === height);
      const matchingChoices = choices.filter(choice => choice.height === height);
      const resolvedStreams = formats.filter(format => Boolean(format.url));
      const containers = [...new Set(formats.map(format => format.container?.replace(/^video\//, '')).filter(Boolean))];
      const codecs = [...new Set(formats.map(videoCodecFamily).filter(Boolean))];
      const mp4Formats = formats.filter(format => format.container === 'video/mp4');
      const mp4Resolved = mp4Formats.filter(format => Boolean(format.url));
      let reason = null;
      if (!matchingChoices.length) {
        if (!formats.length && (nativeQuality?.heights || []).includes(height)) reason = '播放器可選，但目前 player response 尚未提供此畫質的格式資料。';
        else if (formats.length && !resolvedStreams.length) reason = '格式存在，但目前沒有可直接使用的媒體 URL（常見於 SABR / cipher / PO-token 路徑）。';
        else if (!mp4Formats.length && formats.length) reason = `目前只看到 ${containers.join(' / ') || '非 MP4'} · ${codecs.join(' / ') || '其他 codec'}，尚不能由內建 MP4 mux 直接輸出。`;
        else if (mp4Formats.length && !mp4Resolved.length) reason = 'MP4 影像格式存在，但其媒體 URL 尚未解析。';
        else if (mp4Resolved.length) reason = 'MP4 影像可讀，但尚未取得可配對的 AAC / M4A 音訊。';
      }
      return {
        height,
        label: `${height}p`,
        native: (nativeQuality?.heights || []).includes(height),
        advertised: Boolean(formats.length),
        resolvedStream: Boolean(resolvedStreams.length),
        downloadable: Boolean(matchingChoices.length),
        containers,
        codecs,
        choiceIds: matchingChoices.map(choice => choice.id),
        reason
      };
    });
  }

  function qualityCoverage(adaptive, progressive, choices, nativeQuality) {
    const advertisedVideos = [...progressive, ...adaptive]
      .map(format => formatMeta(format, 'advertised-video'))
      .filter(format => format.height && !format.hasDrm && String(format.container || '').startsWith('video/'));
    const mp4Advertised = advertisedVideos.filter(format => format.container === 'video/mp4');
    const resolvedVideoStreams = advertisedVideos.filter(format => Boolean(format.url));
    const advertisedMaxHeight = Math.max(0, ...advertisedVideos.map(format => format.height || 0));
    const mp4AdvertisedMaxHeight = Math.max(0, ...mp4Advertised.map(format => format.height || 0));
    const resolvedStreamMaxHeight = Math.max(0, ...resolvedVideoStreams.map(format => format.height || 0));
    const resolvedMaxHeight = Math.max(0, ...choices.map(choice => choice.height || 0));
    const advertisedLabels = [...new Set(advertisedVideos.map(format => format.qualityLabel || `${format.height}p`).filter(Boolean))]
      .sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
    const resolvedLabels = [...new Set(choices.map(choice => choice.qualityLabel || `${choice.height}p`).filter(Boolean))]
      .sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
    const nativeMaxHeight = nativeQuality?.maxHeight || 0;
    return {
      nativeMaxHeight,
      nativeLabels: nativeQuality?.labels || [],
      advertisedMaxHeight,
      mp4AdvertisedMaxHeight,
      resolvedStreamMaxHeight,
      resolvedMaxHeight,
      expectedMaxHeight: Math.max(nativeMaxHeight, advertisedMaxHeight),
      advertisedLabels,
      resolvedLabels
    };
  }

  function buildDownloadStudioInfo(responses, nativeQuality = nativePlayerQualityInfo()) {
    scanPerformanceMediaUrls();
    const response = responses.slice().sort((a, b) => responseFormatCount(b) - responseFormatCount(a))[0] || null;
    const details = safeObject(response?.videoDetails);
    const regular = mergeFormatLists(responses, 'formats');
    const adaptive = mergeFormatLists(responses, 'adaptiveFormats');
    const all = [...regular, ...adaptive];

    const progressive = regular
      .map(format => formatMeta(format, 'progressive'))
      .filter(format => format.url && format.container === 'video/mp4' && (format.audioChannels || format.audioQuality) && !format.hasDrm)
      .map(format => ({
        id: `p-${format.itag}`,
        mode: 'progressive',
        qualityLabel: format.qualityLabel || (format.height ? `${format.height}p` : 'MP4'),
        height: format.height,
        fps: format.fps,
        bitrate: format.bitrate,
        contentLength: format.contentLength,
        codec: format.codec,
        progressive: format
      }));

    const videos = adaptive
      .map(format => formatMeta(format, 'video'))
      .filter(format => format.url && format.container === 'video/mp4' && format.height && !format.audioChannels && !format.audioQuality && !format.hasDrm)
      .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.fps || 0) - (a.fps || 0) || (b.bitrate || 0) - (a.bitrate || 0));

    const audios = adaptive
      .map(format => formatMeta(format, 'audio'))
      .filter(format => format.url && format.container === 'audio/mp4' && (format.audioChannels || format.audioQuality) && /(?:mp4a|aac)/i.test(format.codec) && !format.hasDrm)
      .sort((a, b) => scoreAudio(b) - scoreAudio(a));

    const bestAudio = audios[0] || null;
    const adaptiveChoices = bestAudio ? videos.map(video => ({
      id: `a-${video.itag}-${bestAudio.itag}`,
      mode: 'adaptive',
      qualityLabel: video.qualityLabel || `${video.height || '?'}p`,
      height: video.height,
      fps: video.fps,
      bitrate: video.bitrate,
      contentLength: (video.contentLength || 0) + (bestAudio.contentLength || 0) || null,
      codec: `${video.codec || 'video'} + ${bestAudio.codec || 'audio'}`,
      video,
      audio: bestAudio
    })) : [];

    const choices = [...progressive, ...adaptiveChoices]
      .sort((a, b) => qualityRank(b) - qualityRank(a) || (a.mode === 'progressive' ? -1 : 1));

    const coverage = qualityCoverage(adaptive, regular, choices, nativeQuality);
    const qualityAvailability = buildQualityAvailability(adaptive, regular, choices, nativeQuality);
    const cipheredFormatCount = all.filter(format => !safeDirectUrl(format) && Boolean(format?.signatureCipher || format?.cipher)).length;
    const directGooglevideoCount = all.filter(format => Boolean(rawDirectUrl(format) || cipherDirectUrl(format))).length;
    const observedResolvedCount = all.filter(format => !rawDirectUrl(format) && !cipherDirectUrl(format) && Boolean(observedUrlForItag(format?.itag))).length;
    const resolvedGooglevideoCount = all.filter(format => Boolean(safeDirectUrl(format))).length;
    const protectedFormatCount = all.filter(format => Boolean(format?.drmFamilies?.length || format?.licenseInfos?.length)).length;
    const unresolvedFormatCount = Math.max(0, all.length - resolvedGooglevideoCount);

    let unavailableReason = null;
    if (!choices.length) {
      if (details?.isLive || response?.videoDetails?.isLiveContent) unavailableReason = '目前影片是 Live / DVR 或使用分段串流，沒有可直接組成 MP4 的 URL。';
      else if (cipheredFormatCount) unavailableReason = '目前播放器只提供需要額外簽章解析的格式；此版本不破解 signature cipher。';
      else unavailableReason = '目前播放器沒有暴露可直接讀取的 MP4 progressive / adaptive 格式。';
    }

    return {
      schema: 3,
      videoId: details?.videoId || currentVideoId() || null,
      title: sanitizeFilenamePart(details?.title || document.title.replace(/\s*-\s*YouTube\s*$/i, '')) || 'YouTube video',
      author: sanitizeFilenamePart(details?.author || ''),
      lengthSeconds: Number(details?.lengthSeconds) || null,
      isLive: Boolean(details?.isLive || details?.isLiveContent),
      choices,
      counts: {
        total: all.length,
        progressive: progressive.length,
        adaptiveVideo: videos.length,
        adaptiveAudio: audios.length,
        responses: responses.length,
        directGooglevideo: directGooglevideoCount,
        observedResolved: observedResolvedCount,
        resolvedGooglevideo: resolvedGooglevideoCount,
        observedCache: observedMediaByItag.size,
        ciphered: cipheredFormatCount,
        protected: protectedFormatCount,
        unresolved: unresolvedFormatCount
      },
      qualityCoverage: coverage,
      qualityAvailability,
      resolutionNotice: coverage.expectedMaxHeight > coverage.resolvedMaxHeight
        ? `YouTube 播放器可選最高 ${coverage.expectedMaxHeight}p，但目前可下載解析到 ${coverage.resolvedMaxHeight || 0}p。已合併所有 player response、播放器實際解析 URL，並依缺口嘗試 Embedded / TV / MWEB fallback；若仍不足，通常是 SABR / cipher / PO-token 或目前只有非 MP4 codec/container。`
        : null,
      fallback: embeddedFallbackStatus ? { ...embeddedFallbackStatus } : null,
      fallbackAttempts: [embeddedFallbackStatus ? { key: 'web-embedded', ...embeddedFallbackStatus } : null, ...alternateFallbackStatuses].filter(Boolean),
      unavailableReason,
      at: Date.now()
    };
  }


  async function downloadStudioInfo() {
    scanPerformanceMediaUrls();
    const nativeQuality = nativePlayerQualityInfo();
    let responses = currentPlayerResponses();
    let info = buildDownloadStudioInfo(responses, nativeQuality);
    const needsMoreCoverage = current => {
      const expected = current?.qualityCoverage?.expectedMaxHeight || 0;
      const resolved = current?.qualityCoverage?.resolvedMaxHeight || 0;
      return Boolean(currentVideoId()) && (expected > resolved || !current?.choices?.some(choice => choice.mode === 'adaptive'));
    };
    if (needsMoreCoverage(info)) {
      await fetchEmbeddedPlayerResponse(currentVideoId());
      scanPerformanceMediaUrls();
      responses = currentPlayerResponses();
      info = buildDownloadStudioInfo(responses, nativeQuality);
    }
    if (needsMoreCoverage(info)) {
      await fetchAlternatePlayerResponses(currentVideoId());
      scanPerformanceMediaUrls();
      responses = currentPlayerResponses();
      info = buildDownloadStudioInfo(responses, nativeQuality);
    }
    return info;
  }

  async function publishDownloadStudioInfo() {
    try {
      const root = document.documentElement;
      if (!root) return;
      const info = await downloadStudioInfo();
      root.setAttribute(DOWNLOAD_ATTR, JSON.stringify(info));
      document.dispatchEvent(new Event(DOWNLOAD_READY_EVENT));
      setTimeout(() => root.removeAttribute(DOWNLOAD_ATTR), 800);
    } catch {
      // Signed URLs and player API responses stay ephemeral and are never persisted.
    }
  }

  function publish() {
    clearTimeout(publishTimer);
    publishTimer = null;
    try {
      document.documentElement?.setAttribute(ATTR, JSON.stringify(extract()));
      document.dispatchEvent(new Event(READY_EVENT));
    } catch {
      // Page-world bridge is best-effort; the isolated content script has DOM fallbacks.
    }
  }

  function schedule(delay = 0) {
    clearTimeout(publishTimer);
    publishTimer = setTimeout(publish, delay);
  }

  installEphemeralNetworkCapture();
  installResourceObserver();
  scanPerformanceMediaUrls();

  document.addEventListener(REQUEST_EVENT, publish, true);
  document.addEventListener(DOWNLOAD_REQUEST_EVENT, publishDownloadStudioInfo, true);
  document.addEventListener('yt-navigate-finish', () => schedule(40), true);
  document.addEventListener('yt-page-data-updated', () => schedule(80), true);
  window.addEventListener('popstate', () => schedule(40));

  schedule(0);
  setTimeout(publish, 450);
  setTimeout(publish, 1400);
})();
