(() => {
  'use strict';
  if (globalThis.__YTSS_ADAPTIVE_RESOLVER_PAGE__) return;
  Object.defineProperty(globalThis, '__YTSS_ADAPTIVE_RESOLVER_PAGE__', { value: true, configurable: false });

  const CAPTURE_ATTR = 'data-ytss-adaptive-capture';
  const CAPTURE_EVENT = 'ytss-adaptive-capture';
  const RESET_EVENT = 'ytss-adaptive-reset';
  const INFO_ATTR = 'data-ytss-download-studio-info';
  const INFO_READY_EVENT = 'ytss-download-studio-info-ready';
  const MAX_CAPTURES = 128;
  const captures = [];
  let videoIdSnapshot = null;

  function currentVideoId() {
    const params = new URLSearchParams(location.search);
    if (location.pathname.startsWith('/shorts/')) return location.pathname.split('/')[2] || null;
    return params.get('v') || null;
  }

  function resetIfVideoChanged() {
    const current = currentVideoId();
    if (videoIdSnapshot !== null && current !== videoIdSnapshot) captures.length = 0;
    videoIdSnapshot = current;
  }

  function normalizeCapture(raw) {
    try {
      const url = new URL(String(raw || ''));
      if (url.protocol !== 'https:' || !(url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com'))) return null;
      if (!/\/videoplayback(?:$|[/?])/i.test(url.pathname)) return null;
      const itag = Number(url.searchParams.get('itag'));
      if (!Number.isFinite(itag) || itag <= 0) return null;
      const sabr = url.searchParams.get('sabr') === '1';
      const signed = new Set(String(url.searchParams.get('sparams') || '').split(',').map(v => v.trim()).filter(Boolean));
      const signedPartial = (signed.has('range') && url.searchParams.has('range')) || (signed.has('sq') && url.searchParams.has('sq'));
      if (sabr || signedPartial) return { itag, url: null, sabr, signedPartial, expire: Number(url.searchParams.get('expire')) || null };
      for (const key of ['range', 'rn', 'rbuf', 'sq', 'alr']) {
        if (!signed.has(key)) url.searchParams.delete(key);
      }
      const expire = Number(url.searchParams.get('expire')) || null;
      if (expire && expire * 1000 < Date.now() + 30000) return { itag, url: null, sabr: false, signedPartial: false, expire, expired: true };
      return { itag, url: url.href, sabr: false, signedPartial: false, expire };
    } catch {
      return null;
    }
  }

  function rememberCapture(payload) {
    resetIfVideoChanged();
    const current = currentVideoId();
    if (payload?.videoId && current && payload.videoId !== current) return;
    const normalized = normalizeCapture(payload?.url);
    if (!normalized) return;
    captures.push({ ...normalized, at: Number(payload?.at) || Date.now(), videoId: payload?.videoId || current });
    if (captures.length > MAX_CAPTURES) captures.splice(0, captures.length - MAX_CAPTURES);
  }

  function responseCandidates() {
    const activeShort = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]');
    const watch = document.querySelector('ytd-watch-flexy');
    const moviePlayer = activeShort?.querySelector?.('#movie_player') || document.querySelector('#movie_player');
    const player = activeShort?.querySelector?.('ytd-player') || document.querySelector('ytd-player');
    const rawConfig = window.ytplayer?.config?.args?.player_response;
    const values = [
      moviePlayer?.getPlayerResponse?.(),
      activeShort?.data?.playerResponse,
      activeShort?.__data?.data?.playerResponse,
      watch?.data?.playerResponse,
      watch?.__data?.data?.playerResponse,
      watch?.playerData?.playerResponse,
      player?.playerResponse,
      window.ytInitialPlayerResponse,
      rawConfig
    ];
    const current = currentVideoId();
    const seen = new Set();
    return values.map(value => {
      if (!value) return null;
      if (typeof value === 'object') return value;
      try { return JSON.parse(value); } catch { return null; }
    }).filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      const id = value?.videoDetails?.videoId;
      return !current || !id || id === current;
    });
  }

  function formatMap() {
    const map = new Map();
    for (const response of responseCandidates()) {
      for (const key of ['formats', 'adaptiveFormats']) {
        for (const format of response?.streamingData?.[key] || []) {
          const itag = Number(format?.itag);
          if (!Number.isFinite(itag) || itag <= 0) continue;
          const previous = map.get(itag);
          if (!previous || Number(format?.contentLength || 0) > Number(previous?.contentLength || 0)) map.set(itag, format);
        }
      }
    }
    return map;
  }

  function parseMime(raw) {
    const value = String(raw || '');
    const [container = '', ...params] = value.split(';').map(v => v.trim());
    const codecs = params.join(';').match(/codecs="([^"]+)"/i)?.[1]?.split(',').map(v => v.trim()).filter(Boolean) || [];
    return { raw: value, container: container.toLowerCase(), codecs };
  }

  function bestCapturedUrls() {
    resetIfVideoChanged();
    const current = currentVideoId();
    const best = new Map();
    for (const capture of captures) {
      if (capture.videoId && current && capture.videoId !== current) continue;
      if (!capture.url) continue;
      const score = (capture.expire || 0) + (capture.at || 0) / 1e6;
      const previous = best.get(capture.itag);
      if (!previous || score > previous.score) best.set(capture.itag, { ...capture, score });
    }
    return best;
  }

  function formatMeta(format, kind, capture) {
    const mime = parseMime(format?.mimeType);
    return {
      itag: Number(format?.itag) || null,
      kind,
      url: capture?.url || null,
      urlSource: 'webrequest-observed',
      mimeType: mime.raw,
      container: mime.container,
      codec: mime.codecs.join(', '),
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
    return (format?.bitrate || format?.averageBitrate || 0) + (format?.audioSampleRate || 0) * 2 + (format?.audioChannels || 0) * 10000;
  }

  function choiceRank(choice) {
    return (choice?.height || 0) * 100000 + (choice?.fps || 0) * 1000 + (choice?.bitrate || 0);
  }

  function buildCaptureChoices() {
    const formats = formatMap();
    const observed = bestCapturedUrls();
    const metas = [];
    for (const [itag, capture] of observed) {
      const format = formats.get(itag);
      if (!format) continue;
      const mime = parseMime(format?.mimeType);
      const hasAudio = Boolean(format?.audioChannels || format?.audioQuality);
      const kind = mime.container.startsWith('audio/') ? 'audio' : mime.container.startsWith('video/') && hasAudio ? 'progressive' : 'video';
      metas.push(formatMeta(format, kind, capture));
    }

    const progressive = metas
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

    const videos = metas
      .filter(format => format.url && format.container === 'video/mp4' && format.height && !format.audioChannels && !format.audioQuality && !format.hasDrm)
      .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.fps || 0) - (a.fps || 0) || (b.bitrate || 0) - (a.bitrate || 0));

    const audios = metas
      .filter(format => format.url && format.container === 'audio/mp4' && (format.audioChannels || format.audioQuality) && /(?:mp4a|aac)/i.test(format.codec) && !format.hasDrm)
      .sort((a, b) => scoreAudio(b) - scoreAudio(a));

    const bestAudio = audios[0] || null;
    const adaptive = bestAudio ? videos.map(video => ({
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

    return {
      choices: [...progressive, ...adaptive].sort((a, b) => choiceRank(b) - choiceRank(a) || (a.mode === 'progressive' ? -1 : 1)),
      videos,
      audios,
      progressive,
      observedCount: observed.size,
      capturedCount: captures.length
    };
  }

  function enrichInfo(info) {
    if (!info || typeof info !== 'object') return info;
    const supplement = buildCaptureChoices();
    if (!supplement.choices.length) {
      info.adaptiveResolver = {
        source: 'webrequest-observed',
        captured: supplement.capturedCount,
        usableItags: supplement.observedCount,
        adaptiveVideos: supplement.videos.length,
        adaptiveAudios: supplement.audios.length,
        addedChoices: 0
      };
      return info;
    }

    const merged = new Map();
    for (const choice of [...(Array.isArray(info.choices) ? info.choices : []), ...supplement.choices]) {
      if (choice?.id) merged.set(choice.id, choice);
    }
    info.choices = [...merged.values()].sort((a, b) => choiceRank(b) - choiceRank(a) || (a.mode === 'progressive' ? -1 : 1));
    const maxHeight = Math.max(0, ...info.choices.map(choice => Number(choice?.height) || 0));
    info.counts = {
      ...(info.counts || {}),
      adaptiveVideo: Math.max(Number(info.counts?.adaptiveVideo) || 0, supplement.videos.length),
      adaptiveAudio: Math.max(Number(info.counts?.adaptiveAudio) || 0, supplement.audios.length),
      progressive: Math.max(Number(info.counts?.progressive) || 0, supplement.progressive.length),
      observedResolved: Math.max(Number(info.counts?.observedResolved) || 0, supplement.observedCount),
      resolvedGooglevideo: Math.max(Number(info.counts?.resolvedGooglevideo) || 0, supplement.observedCount),
      unresolved: Math.max(0, (Number(info.counts?.total) || 0) - supplement.observedCount)
    };
    if (info.qualityCoverage && typeof info.qualityCoverage === 'object') {
      info.qualityCoverage.resolvedMaxHeight = Math.max(Number(info.qualityCoverage.resolvedMaxHeight) || 0, maxHeight);
      if (Array.isArray(info.qualityCoverage.resolvedLabels)) {
        info.qualityCoverage.resolvedLabels = [...new Set([...info.qualityCoverage.resolvedLabels, ...info.choices.map(c => c.qualityLabel).filter(Boolean)])];
      }
    }
    if (Array.isArray(info.qualityAvailability)) {
      info.qualityAvailability = info.qualityAvailability.map(row => {
        const matches = info.choices.filter(choice => Number(choice?.height) === Number(row?.height));
        if (!matches.length) return row;
        return {
          ...row,
          resolvedStream: true,
          downloadable: true,
          choiceIds: [...new Set([...(row.choiceIds || []), ...matches.map(choice => choice.id)])],
          reason: null
        };
      });
    }
    info.unavailableReason = null;
    if (Number(info.qualityCoverage?.expectedMaxHeight) > maxHeight) {
      info.resolutionNotice = `播放器可選最高 ${info.qualityCoverage.expectedMaxHeight}p；目前從瀏覽器已使用的媒體請求解析到 ${maxHeight || 0}p，可下載項目已加入 Video + AAC 本機合併。`;
    } else {
      info.resolutionNotice = null;
    }
    info.adaptiveResolver = {
      source: 'webrequest-observed',
      captured: supplement.capturedCount,
      usableItags: supplement.observedCount,
      adaptiveVideos: supplement.videos.length,
      adaptiveAudios: supplement.audios.length,
      addedChoices: supplement.choices.length
    };
    return info;
  }

  document.addEventListener(CAPTURE_EVENT, () => {
    const raw = document.documentElement.getAttribute(CAPTURE_ATTR);
    if (!raw) return;
    try { rememberCapture(JSON.parse(raw)); } catch {}
  }, true);

  document.addEventListener(RESET_EVENT, () => {
    captures.length = 0;
    videoIdSnapshot = currentVideoId();
  }, true);

  document.addEventListener(INFO_READY_EVENT, () => {
    const raw = document.documentElement.getAttribute(INFO_ATTR);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const info = parsed?.info && typeof parsed.info === 'object' ? parsed.info : parsed;
      enrichInfo(info);
      if (parsed?.info && typeof parsed.info === 'object') parsed.info = info;
      document.documentElement.setAttribute(INFO_ATTR, JSON.stringify(parsed));
    } catch {}
  }, true);

  videoIdSnapshot = currentVideoId();
})();
