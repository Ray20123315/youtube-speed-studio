(() => {
  'use strict';
  if (globalThis.YouTubeSpeedStudioProvider) return;

  const hostname = location.hostname.toLowerCase();

  const base = {
    id: 'generic',
    label: 'HTML5',
    supportsShorts: false,
    supportsProfiles: false,
    supportsDownloadStudio: false,
    isShorts: () => false,
    isSearchPage: () => false,
    isVideoPage: () => true,
    mode: () => 'general',
    pageType: () => 'video',
    videoSelectors: ['video'],
    scoreBonus(video) {
      return video?.currentSrc ? 12 : 0;
    },
    playerRoot(video) {
      return video?.parentElement || null;
    },
    navigationEvents: [],
    videoId() { return null; },
    context() {
      return {
        platform: this.id,
        platformLabel: this.label,
        href: location.href,
        pageType: this.pageType(),
        mode: this.mode(),
        videoId: this.videoId(),
        channelKey: null,
        channelAliases: [],
        channelLabel: null,
        channelId: null,
        channelSource: null,
        playlistKey: null,
        playlistLabel: null,
        pageTitle: document.title || ''
      };
    }
  };

  const youtube = {
    ...base,
    id: 'youtube',
    label: 'YouTube',
    supportsShorts: true,
    supportsProfiles: true,
    supportsDownloadStudio: true,
    isShorts: () => location.pathname.startsWith('/shorts/'),
    isSearchPage: () => location.pathname === '/results',
    isVideoPage() { return this.isShorts() || location.pathname === '/watch'; },
    mode() { return this.isShorts() ? 'shorts' : 'general'; },
    pageType() { return this.isShorts() ? 'shorts' : location.pathname === '/watch' ? 'watch' : this.isSearchPage() ? 'search' : 'other'; },
    videoSelectors: [
      '#movie_player video.html5-main-video',
      '#movie_player video',
      'ytd-reel-video-renderer[is-active] video',
      'ytd-reel-video-renderer[active] video',
      'ytd-player video',
      'video'
    ],
    scoreBonus(video) {
      let score = 0;
      if (video?.closest?.('#movie_player')) score += 120;
      if (video?.classList?.contains('html5-main-video')) score += 90;
      if (this.isShorts() && video?.closest?.('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]')) score += 120;
      return score;
    },
    playerRoot(video) {
      const activeReel = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]');
      return video?.closest?.('ytd-reel-video-renderer, #movie_player, ytd-player') || activeReel || document.querySelector('#movie_player') || document.querySelector('ytd-player');
    },
    navigationEvents: ['yt-navigate-finish', 'yt-page-data-updated'],
    videoId() {
      const params = new URLSearchParams(location.search);
      return params.get('v') || (this.isShorts() ? location.pathname.split('/')[2] || null : null);
    }
  };

  const bilibili = {
    ...base,
    id: 'bilibili',
    label: 'bilibili',
    isVideoPage: () => /^\/video\//.test(location.pathname) || /^\/bangumi\/play\//.test(location.pathname) || /^\/list\//.test(location.pathname),
    pageType() {
      if (/^\/bangumi\/play\//.test(location.pathname)) return 'bangumi';
      if (/^\/video\//.test(location.pathname)) return 'video';
      if (/^\/list\//.test(location.pathname)) return 'list';
      return 'other';
    },
    videoSelectors: [
      '.bpx-player-video-wrap video',
      'video.bpx-player-video',
      '.bilibili-player-video video',
      '.bpx-player-container video',
      'video'
    ],
    scoreBonus(video) {
      let score = 0;
      if (video?.closest?.('.bpx-player-container, .bpx-player-video-area, .bilibili-player-video')) score += 145;
      if (video?.classList?.contains('bpx-player-video')) score += 90;
      return score;
    },
    playerRoot(video) {
      return video?.closest?.('.bpx-player-container, .bpx-player-video-area, .bilibili-player-video') || video?.parentElement || null;
    },
    navigationEvents: [],
    videoId() {
      const bv = location.pathname.match(/\/(BV[0-9A-Za-z]+)/)?.[1];
      const ep = location.pathname.match(/\/bangumi\/play\/(ep\d+|ss\d+)/)?.[1];
      return bv || ep || null;
    },
    context() {
      const title = document.querySelector('h1.video-title, h1[title], .video-info-title-inner, .media-title')?.textContent?.trim() || document.title || '';
      return {
        platform: this.id,
        platformLabel: this.label,
        href: location.href,
        pageType: this.pageType(),
        mode: 'general',
        videoId: this.videoId(),
        channelKey: null,
        channelAliases: [],
        channelLabel: null,
        channelId: null,
        channelSource: null,
        playlistKey: null,
        playlistLabel: null,
        pageTitle: title
      };
    }
  };

  let provider = base;
  if (hostname === 'www.youtube.com' || hostname.endsWith('.youtube.com')) provider = youtube;
  else if (hostname === 'www.bilibili.com' || hostname.endsWith('.bilibili.com')) provider = bilibili;

  const frozen = Object.freeze(provider);
  Object.defineProperty(globalThis, 'YouTubeSpeedStudioProvider', { value: frozen, configurable: false, enumerable: false, writable: false });
  if (!globalThis.SpeedStudioProvider) Object.defineProperty(globalThis, 'SpeedStudioProvider', { value: frozen, configurable: false, enumerable: false, writable: false });
})();
