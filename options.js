const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const RUNTIME_PROTOCOL = 7;
const DEFAULTS = { enabled: true, floatingEnabled: true, hoverExpand: true, hideFloatingOnSearch: true, rememberLast: true, generalSpeed: 1.5, shortsSpeed: 1, step: .25, minSpeed: .25, maxSpeed: 8, extremeMode: true, showPresets: true, presets: [1, 1.25, 1.5, 2, 3], panelOpacity: 90, compactOnStart: false, position: { x: null, y: 100 }, lockSpeed: false, resetSpeed: 1, preservePitch: true, decreaseKey: 'BracketLeft', increaseKey: 'BracketRight', boostKey: 'Backquote', pauseKey: 'Backslash', boostSpeed: 3, themeMode: 'auto', profilesEnabled: true, profiles: { channels: {}, playlists: {} }, diagnosticsEnabled: false, downloadSaveAs: true, downloadDefaultQuality: 'best', bilibiliEnabled: true, uiLanguage: 'auto', accentColor: 'violet', uiBackground: 'auto', updateCheckEnabled: true };
const $ = id => document.getElementById(id);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const roundRate = n => Math.round((n + Number.EPSILON) * 100) / 100;
let settings = structuredClone(DEFAULTS), saveTimer = null, saveStateTimer = null, capturingSetting = null, activeContext = null, activeTabId = null, downloadInfo = null, downloadInfoExpiryTimer = null, latestDiagnostics = null, downloadJob = null, downloadScanToken = 0;
const settingKeys = Object.keys(DEFAULTS);
const MIB = 1024 * 1024;
const DEFAULT_ADAPTIVE_LIMIT = 192 * MIB;
const ABSOLUTE_ADAPTIVE_LIMIT = 384 * MIB;
function parseNumber(value, fallback) { const n = Number(String(value).trim().replace(',', '.')); return Number.isFinite(n) ? n : fallback; }
function formatRate(n) { return Number(n).toFixed(2).replace(/\.00$/, '').replace(/0$/, ''); }
function normalizeProfiles(v) { const p = v && typeof v === 'object' ? v : {}; return { channels: p.channels && typeof p.channels === 'object' ? p.channels : {}, playlists: p.playlists && typeof p.playlists === 'object' ? p.playlists : {} }; }
function normalizeOpacity(v) { const n = parseNumber(v, 90); return Math.round(clamp(n <= 1 ? n * 100 : n, 0, 100)); }
function ceiling() { return settings.extremeMode ? 16 : 4; }
function bounds() { const min = clamp(parseNumber(settings.minSpeed, .25), .1, ceiling()); let raw = parseNumber(settings.maxSpeed, 8); if (settings.extremeMode && raw >= 15.75)
    raw = 16; return { min, max: clamp(raw, min, ceiling()) }; }
function normalizeRate(v, fallback = 1) { const { min, max } = bounds(); return roundRate(clamp(parseNumber(v, fallback), min, max)); }
function shortcutLabel(code) { const m = { BracketLeft: '[', BracketRight: ']', Backquote: '`', Backslash: '\\', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }; if (m[code])
    return m[code]; if (code?.startsWith('Key'))
    return code.slice(3); if (code?.startsWith('Digit'))
    return code.slice(5); return code || '—'; }
function setSaved(text = '設定已儲存') { const el = $('saveState'); el.textContent = text; clearTimeout(saveStateTimer); saveStateTimer = setTimeout(() => el.textContent = '設定自動儲存', 1300); }
function applyTheme(last) { const siteTheme = settings.themeMode === 'auto' ? (last || document.body.dataset.lastYoutubeTheme || 'dark') : settings.themeMode; const uiTheme = settings.uiBackground === 'auto' ? siteTheme : settings.uiBackground; document.body.dataset.theme = uiTheme; document.body.dataset.accent = settings.accentColor || 'violet'; }
function setNumber(id, value) { $(id).value = formatRate(value); $(id).setAttribute('aria-valuenow', String(value)); }
function syncUI() {
    ['enabled', 'floatingEnabled', 'hoverExpand', 'hideFloatingOnSearch', 'rememberLast', 'showPresets', 'compactOnStart', 'lockSpeed', 'preservePitch', 'extremeMode', 'profilesEnabled', 'diagnosticsEnabled', 'downloadSaveAs', 'bilibiliEnabled'].forEach(id => $(id).checked = !!settings[id]);
    ['generalSpeed', 'shortsSpeed', 'step', 'minSpeed', 'maxSpeed', 'boostSpeed'].forEach(id => setNumber(id, settings[id]));
    $('presets').value = (settings.presets || []).join(', ');
    $('themeMode').value = settings.themeMode;
    $('panelOpacity').value = String(settings.panelOpacity);
    $('panelOpacityNumber').value = String(settings.panelOpacity);
    $('panelOpacityNumber').setAttribute('aria-valuenow', String(settings.panelOpacity));
    $('opacityValue').textContent = `${settings.panelOpacity}%`;
    $('downloadDefaultQuality').value = settings.downloadDefaultQuality || 'best';
    if ($('uiLanguage')) $('uiLanguage').value = settings.uiLanguage || 'auto';
    renderAppearance();
    updateKeyLabels();
    renderProfiles();
    updateContextUI();
}
function normalizeAll() { settings.panelOpacity = normalizeOpacity(settings.panelOpacity); settings.profiles = normalizeProfiles(settings.profiles); settings.step = clamp(parseNumber(settings.step, .25), .01, 1); settings.minSpeed = clamp(parseNumber(settings.minSpeed, .25), .1, ceiling()); settings.maxSpeed = bounds().max; settings.generalSpeed = normalizeRate(settings.generalSpeed, 1.5); settings.shortsSpeed = normalizeRate(settings.shortsSpeed, 1); settings.boostSpeed = normalizeRate(settings.boostSpeed, 3); if (!['auto', 'dark', 'light', 'graphite', 'midnight', 'warm'].includes(settings.themeMode))
    settings.themeMode = 'auto'; if (!['auto','dark','light','graphite','midnight','warm'].includes(settings.uiBackground)) settings.uiBackground='auto'; if (!['violet','blue','cyan','green','amber','orange','rose','magenta'].includes(settings.accentColor)) settings.accentColor='violet'; if (typeof settings.uiLanguage !== 'string') settings.uiLanguage='auto'; settings.bilibiliEnabled = settings.bilibiliEnabled !== false; if (!['best', 'smallest'].includes(settings.downloadDefaultQuality))
    settings.downloadDefaultQuality = 'best'; }
async function savePatch(patch) { settings = { ...settings, ...patch }; normalizeAll(); const out = {}; for (const key of Object.keys(patch))
    out[key] = settings[key]; if (['extremeMode', 'minSpeed', 'maxSpeed'].some(key => Object.prototype.hasOwnProperty.call(patch, key))) {
    for (const key of ['minSpeed', 'maxSpeed', 'generalSpeed', 'shortsSpeed', 'boostSpeed'])
        out[key] = settings[key];
} await chrome.storage.local.set(out); syncDependent(out); setSaved(); }
function schedulePatch(factory) { clearTimeout(saveTimer); saveTimer = setTimeout(() => savePatch(factory()), 160); }
function syncDependent(patch) { if ('themeMode' in patch || 'uiBackground' in patch || 'accentColor' in patch) { applyTheme(); renderAppearance(); } if ('uiLanguage' in patch) YTSSI18n?.setLocale(settings.uiLanguage); if ('profiles' in patch || 'profilesEnabled' in patch) {
    renderProfiles();
    updateContextUI();
} if ('extremeMode' in patch || 'minSpeed' in patch || 'maxSpeed' in patch) {
    normalizeAll();
    ['generalSpeed', 'shortsSpeed', 'boostSpeed', 'minSpeed', 'maxSpeed'].forEach(id => setNumber(id, settings[id]));
} }
function stepControl(control, direction) { const id = control.dataset.control; const input = $(id); const fixed = parseNumber(control.dataset.fixedStep, NaN); const source = control.dataset.stepSource; const delta = Number.isFinite(fixed) ? fixed : parseNumber(settings[source], settings.step); let min = parseNumber(control.dataset.min, NaN), max = parseNumber(control.dataset.max, NaN); if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const b = bounds();
    if (!Number.isFinite(min))
        min = b.min;
    if (!Number.isFinite(max))
        max = b.max;
} if (id === 'maxSpeed' && !settings.extremeMode)
    max = Math.min(max, 4); let next = roundRate(parseNumber(input.value, settings[id]) + direction * delta); if (direction > 0 && next > max)
    next = max; if (direction < 0 && next < min)
    next = min; next = roundRate(clamp(next, min, max)); setNumber(id, next); savePatch({ [id]: next }); }
function commitNumber(control) { const id = control.dataset.control; let min = parseNumber(control.dataset.min, NaN), max = parseNumber(control.dataset.max, NaN); if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const b = bounds();
    if (!Number.isFinite(min))
        min = b.min;
    if (!Number.isFinite(max))
        max = b.max;
} if (id === 'maxSpeed' && settings.extremeMode && parseNumber($(id).value, settings[id]) >= 15.75)
    $(id).value = '16'; const value = roundRate(clamp(parseNumber($(id).value, settings[id]), min, max)); setNumber(id, value); savePatch({ [id]: value }); }
function parsePresets(v) { return [...new Set(v.split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x >= .1 && x <= 16))].slice(0, 8); }
function updateKeyLabels() { [['decreaseKey', 'decreaseKeyLabel'], ['increaseKey', 'increaseKeyLabel'], ['boostKey', 'boostKeyLabel'], ['pauseKey', 'pauseKeyLabel']].forEach(([k, id]) => $(id).textContent = shortcutLabel(settings[k])); document.querySelectorAll('.key-capture').forEach(b => b.classList.toggle('capturing', b.dataset.setting === capturingSetting)); }
function profileKeys(kind) { if (kind === 'playlist')
    return activeContext?.playlistKey ? [activeContext.playlistKey] : []; return [...new Set([activeContext?.channelKey, ...(activeContext?.channelAliases || [])].filter(Boolean))]; }
function profileMatch(kind) { const bucket = kind === 'playlist' ? settings.profiles.playlists : settings.profiles.channels; for (const key of profileKeys(kind))
    if (bucket[key])
        return { key, entry: bucket[key] }; return null; }
function updateContextUI() { const cp = profileMatch('channel'), pp = profileMatch('playlist'); $('channelContext').textContent = activeContext?.channelLabel || activeContext?.channelKey || '尚未偵測'; $('playlistContext').textContent = activeContext?.playlistLabel || activeContext?.playlistKey || '無'; $('channelProfileState').textContent = cp ? (pp ? '已儲存 · 播放清單優先' : '已儲存 · 自動套用') : '未建立 Profile'; $('playlistProfileState').textContent = pp ? '已儲存 · 最高優先' : '未建立 Profile'; $('saveChannelProfile').disabled = !settings.profilesEnabled || !activeContext?.channelKey; $('removeChannelProfile').disabled = !settings.profilesEnabled || !cp; $('savePlaylistProfile').disabled = !settings.profilesEnabled || !activeContext?.playlistKey; $('removePlaylistProfile').disabled = !settings.profilesEnabled || !pp; }
function renderProfiles() { const list = $('profileList'); list.innerHTML = ''; const rows = []; for (const [k, v] of Object.entries(settings.profiles.channels))
    rows.push(['channel', k, v]); for (const [k, v] of Object.entries(settings.profiles.playlists))
    rows.push(['playlist', k, v]); if (!rows.length) {
    list.innerHTML = '<div class="profile-empty">尚未建立任何 Profile。</div>';
    return;
} rows.sort((a, b) => (b[2].updatedAt || 0) - (a[2].updatedAt || 0)); for (const [kind, key, entry] of rows) {
    const el = document.createElement('div');
    el.className = 'profile-item';
    el.innerHTML = `<span>${kind === 'channel' ? '頻道' : '播放清單'}</span><div><strong></strong><small></small></div><button type="button">刪除</button>`;
    el.querySelector('strong').textContent = entry.label || key;
    el.querySelector('small').textContent = `一般 ${formatRate(entry.generalSpeed || settings.generalSpeed)}× · Shorts ${formatRate(entry.shortsSpeed || settings.shortsSpeed)}× · Boost ${formatRate(entry.boostSpeed || settings.boostSpeed)}×`;
    el.querySelector('button').addEventListener('click', () => deleteProfileByKey(kind, key));
    list.appendChild(el);
} }
async function deleteProfileByKey(kind, key) { const p = normalizeProfiles(settings.profiles); p[kind === 'channel' ? 'channels' : 'playlists'] = { ...p[kind === 'channel' ? 'channels' : 'playlists'] }; delete p[kind === 'channel' ? 'channels' : 'playlists'][key]; settings.profiles = p; await chrome.storage.local.set({ profiles: p }); renderProfiles(); updateContextUI(); setSaved('Profile 已刪除'); }
async function findYoutubeRuntime({ requireVideo = false } = {}) {
  const result = await YTSSRuntimeClient.discover({ platform:'youtube', requireVideo, preferActive:true });
  if (result.response) {
    activeTabId = result.tabId; activeContext = result.response.context; latestDiagnostics = result.response.diagnostics || latestDiagnostics;
    const page = activeContext?.pageType; const recovered = result.reinjected ? ' · 已自動修復 runtime' : '';
    if (result.kind === 'video') $('profileRuntimeStatus').textContent = `已連線 YouTube · ${page === 'shorts' ? 'Shorts' : '一般影片'} · ${activeContext?.channelLabel || '頻道偵測中'}${recovered}`;
    else $('profileRuntimeStatus').textContent = requireVideo ? `YouTube runtime 已連線${recovered}，但目前沒有影片觀看頁` : `YouTube runtime 已連線${recovered} · 目前不是影片觀看頁`;
    updateContextUI(); updateDiagnostics(latestDiagnostics);
    return result.ok ? result.response : null;
  }
  activeTabId=null; activeContext=null; updateContextUI();
  if (result.kind==='stale') $('profileRuntimeStatus').textContent='偵測到舊版 runtime；請關閉舊分頁或重新載入目前版本';
  else $('profileRuntimeStatus').textContent='找不到可恢復的 YouTube runtime；請先開啟 YouTube 影片頁';
  return null;
}
async function sendRuntime(msg, { requireVideo = true } = {}) {
  const runtime=await findYoutubeRuntime({requireVideo}); if(!runtime||!activeTabId) throw new Error(requireVideo?'YouTube runtime 已檢查，但目前沒有可用影片頁':'找不到可用的 YouTube runtime');
  let result=await YTSSRuntimeClient.probe(activeTabId,1); if(!result.ok){const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.id===activeTabId);const ensured=await YTSSRuntimeClient.ensure(tab,{allowInject:true});if(!ensured.ok)throw ensured.error||new Error('runtime recovery failed');}
  return chrome.tabs.sendMessage(activeTabId,msg);
}
async function saveProfile(kind) { await findYoutubeRuntime(); const key = kind === 'playlist' ? activeContext?.playlistKey : activeContext?.channelKey; if (!key)
    return setSaved(kind === 'playlist' ? '目前沒有播放清單' : '尚未偵測頻道'); const bucket = kind === 'playlist' ? 'playlists' : 'channels'; const p = normalizeProfiles(settings.profiles); p[bucket] = { ...p[bucket] }; p[bucket][key] = { generalSpeed: settings.generalSpeed, shortsSpeed: settings.shortsSpeed, boostSpeed: settings.boostSpeed, lockSpeed: settings.lockSpeed, preservePitch: settings.preservePitch, label: kind === 'playlist' ? (activeContext.playlistLabel || key) : (activeContext.channelLabel || key), updatedAt: Date.now() }; if (kind === 'channel')
    for (const alias of profileKeys('channel'))
        if (alias !== key)
            delete p.channels[alias]; settings.profiles = p; await chrome.storage.local.set({ profiles: p }); renderProfiles(); updateContextUI(); setSaved('Profile 已儲存'); }
async function removeCurrentProfile(kind) { const match = profileMatch(kind); if (!match)
    return; await deleteProfileByKey(kind, match.key); }
function sanitizeFilename(v) { return String(v || 'Video').replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Video'; }
function formatBytes(value) { const n = Number(value); if (!Number.isFinite(n) || n <= 0) return '未知大小'; if (n >= 1024 * MIB) return `${(n / 1024 / MIB).toFixed(2)} GB`; if (n >= MIB) return `${(n / MIB).toFixed(1)} MB`; if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`; return `${n} B`; }
function formatDuration(seconds) { const n = Number(seconds); if (!Number.isFinite(n) || n <= 0) return '時長未知'; const total = Math.round(n); const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const sec = total % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`; }
function codecName(value) { const codec = String(value || '').toLowerCase(); if (/avc1|avc3|h264/.test(codec)) return 'H.264'; if (/hev1|hvc1|hevc|h265/.test(codec)) return 'HEVC'; if (/av01|av1/.test(codec)) return 'AV1'; if (/vp09|vp9/.test(codec)) return 'VP9'; if (/vp08|vp8/.test(codec)) return 'VP8'; if (/mp4a|aac/.test(codec)) return 'AAC'; if (/opus/.test(codec)) return 'Opus'; return value ? String(value).split('.')[0].toUpperCase() : '未知 codec'; }
function adaptiveBudgetBytes() { const deviceMemory = Number(navigator.deviceMemory) || 0; let limit = DEFAULT_ADAPTIVE_LIMIT; if (deviceMemory && deviceMemory <= 2) limit = 64 * MIB; else if (deviceMemory && deviceMemory <= 4) limit = 128 * MIB; else if (deviceMemory >= 8) limit = 256 * MIB; return Math.min(limit, ABSOLUTE_ADAPTIVE_LIMIT); }
function choiceSize(choice) { if (choice?.mode === 'progressive') return Number(choice.progressive?.contentLength || choice.contentLength) || null; const video = Number(choice?.video?.contentLength) || 0, audio = Number(choice?.audio?.contentLength) || 0; return video || audio ? video + audio : Number(choice?.contentLength) || null; }
function choiceCodecLabel(choice) { if (choice?.mode === 'progressive') { const codecs = choice.progressive?.codecs || []; return codecs.length ? codecs.map(codecName).join(' + ') : codecName(choice.codec); } return `${codecName(choice?.video?.codec)} + ${codecName(choice?.audio?.codec)}`; }
function choiceLabel(choice) { const quality = choice?.qualityLabel || `${choice?.height || '?'}p`; const fps = choice?.fps > 30 ? ` · ${choice.fps}fps` : ''; const mode = choice?.mode === 'adaptive' ? '本機合併' : '單檔直載'; const size = choiceSize(choice); return `${quality}${fps} · MP4 · ${choiceCodecLabel(choice)} · ${mode}${size ? ` · ${formatBytes(size)}` : ''}`; }

function qualityText(height) { const n = Number(height) || 0; return n ? `${n}p` : '—'; }
function makeChip(text, kind = '') { const chip = document.createElement('span'); chip.className = `q-chip${kind ? ` ${kind}` : ''}`; chip.textContent = text; return chip; }
function renderQualitySummary(info) {
  const coverage = info?.qualityCoverage || {};
  $('downloadNativeMax').textContent = qualityText(coverage.nativeMaxHeight);
  $('downloadAdvertisedMax').textContent = qualityText(coverage.advertisedMaxHeight);
  $('downloadResolvedMax').textContent = qualityText(coverage.resolvedMaxHeight);
  const expected = Number(coverage.expectedMaxHeight) || 0;
  const resolved = Number(coverage.resolvedMaxHeight) || 0;
  const choices = info?.choices?.length || 0;
  $('downloadCoverageState').textContent = !expected && !choices ? '無資料' : expected > resolved ? '有缺口' : choices ? '已覆蓋' : '無 MP4';
  const attempts = Array.isArray(info?.fallbackAttempts) ? info.fallbackAttempts : [];
  const attempted = attempts.map(item => `${String(item.key || 'fallback').replace('web-embedded', 'Embedded')}${item.ok ? ' ✓' : ''}`).join(' · ');
  $('downloadFallbackStatus').textContent = attempted || 'Resolver';
}
function renderQualityMatrix(info) {
  const root = $('downloadQualityMatrix');
  root.replaceChildren();
  const rows = Array.isArray(info?.qualityAvailability) ? info.qualityAvailability : [];
  if (!rows.length) { const empty = document.createElement('div'); empty.className = 'quality-empty'; empty.textContent = '目前沒有取得播放器畫質資料。'; root.appendChild(empty); return; }
  for (const row of rows) {
    const el = document.createElement('article');
    el.className = `quality-row${row.downloadable ? ' is-downloadable' : ''}`;
    const main = document.createElement('div'); main.className = 'quality-main';
    const strong = document.createElement('strong'); strong.textContent = row.label || qualityText(row.height); main.appendChild(strong);
    if (row.height >= 720) { const hd = document.createElement('small'); hd.textContent = row.height >= 2160 ? '4K' : row.height >= 1440 ? 'QHD' : row.height >= 1080 ? 'FHD' : 'HD'; main.appendChild(hd); }
    const flags = document.createElement('div'); flags.className = 'quality-flags';
    if (row.native) flags.appendChild(makeChip('播放器可選', 'info'));
    if (row.advertised) flags.appendChild(makeChip('格式已宣告', 'info'));
    if (row.resolvedStream) flags.appendChild(makeChip('媒體流已解析', 'ok'));
    if (row.downloadable) flags.appendChild(makeChip('MP4 可下載', 'ok'));
    else flags.appendChild(makeChip('目前不可輸出 MP4', 'warn'));
    const reason = document.createElement('div'); reason.className = 'quality-reason';
    const rb = document.createElement('b'); rb.textContent = row.downloadable ? '可直接選擇下方 MP4 選項' : '此畫質仍保留顯示，不會被隱藏';
    const rs = document.createElement('small'); rs.textContent = row.reason || (row.downloadable ? '已具備可下載的 MP4 路徑。' : '等待更多格式資訊。'); reason.append(rb, rs);
    const codecs = document.createElement('div'); codecs.className = 'quality-codecs'; codecs.textContent = [...(row.containers || []), ...(row.codecs || [])].join(' · ') || '格式未知';
    el.append(main, flags, reason, codecs); root.appendChild(el);
  }
}
function renderChoiceList() {
  const root = $('downloadChoiceList');
  root.replaceChildren();
  const choices = downloadInfo?.choices || [];
  if (!choices.length) { const empty = document.createElement('div'); empty.className = 'quality-empty'; empty.textContent = '目前沒有能輸出成 MP4 的選項；上方畫質可用性會說明缺在哪一層。'; root.appendChild(empty); return; }
  const selectedIndex = Number($('downloadQuality').value);
  choices.forEach((choice, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `download-choice${selectedIndex === index ? ' selected' : ''}`; button.disabled = Boolean(downloadJob);
    const quality = document.createElement('strong'); quality.textContent = choice.qualityLabel || qualityText(choice.height);
    const mode = document.createElement('span'); mode.className = 'choice-mode'; mode.textContent = choice.mode === 'adaptive' ? '本機合併' : '單檔直載';
    const spec = document.createElement('span'); spec.className = 'choice-spec'; spec.textContent = `MP4 · ${choiceCodecLabel(choice)}${choice.fps > 30 ? ` · ${choice.fps}fps` : ''}`;
    const size = document.createElement('span'); size.className = 'choice-size'; size.textContent = choiceSize(choice) ? `估計 ${formatBytes(choiceSize(choice))}` : '大小未知';
    button.append(quality, mode, spec, size);
    button.addEventListener('click', () => { $('downloadQuality').value = String(index); renderChoiceList(); renderSelectedDownload(); });
    root.appendChild(button);
  });
}
function validateMediaUrl(raw) { const url = new URL(String(raw || '')); if (url.protocol !== 'https:' || !(url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com'))) throw new Error('媒體網址不在允許的 googlevideo.com HTTPS 範圍。'); return url.href; }
function selectedChoice() { const index = Number($('downloadQuality').value); return Number.isInteger(index) ? downloadInfo?.choices?.[index] || null : null; }
function setStage(stage, text) { $('downloadStage').textContent = String(stage || 'IDLE').toUpperCase(); $('downloadJobStatus').textContent = text || '等待下載'; }
function setProgress(kind, ratio, text) { const progress = $(`${kind}Progress`), output = $(`${kind}ProgressText`); const value = clamp(Number(ratio) || 0, 0, 1); progress.value = value; output.textContent = text || `${Math.round(value * 100)}%`; }
function resetDownloadProgress() { ['video', 'audio', 'mux', 'finalize'].forEach(kind => setProgress(kind, 0, '0%')); setStage('idle', '等待下載'); }
function setDownloadBusy(busy) { document.querySelector('.download-card')?.classList.toggle('is-busy', busy); $('scanDownloads').disabled = busy; $('downloadQuality').disabled = busy; $('cancelDownload').disabled = !busy; renderSelectedDownload(); }
function renderSelectedDownload() {
  const choice = selectedChoice(), budget = adaptiveBudgetBytes();
  $('downloadMemoryLimit').textContent = `Adaptive 輸入總量上限：${formatBytes(budget)}（依裝置記憶體動態估算）`;
  renderChoiceList();
  if (!choice) {
    $('downloadChoiceDetail').textContent = '掃描後選取一個可下載 MP4；播放器看得到但尚未解析的畫質仍會保留在上方。';
    $('downloadModeBadge').textContent = 'LOCAL MP4';
    $('downloadMp4').disabled = true;
    return;
  }
  const size = choiceSize(choice), adaptive = choice.mode === 'adaptive', tooLarge = adaptive && size && size > budget;
  $('downloadModeBadge').textContent = adaptive ? 'ADAPTIVE · LOCAL MUX' : 'PROGRESSIVE · DIRECT';
  const detail = [choice.qualityLabel || qualityText(choice.height), choiceCodecLabel(choice), size ? `估計 ${formatBytes(size)}` : '大小未知', adaptive ? 'Video + AAC 分流，本機合併成 MP4' : '影像與音訊已在同一 MP4'];
  if (tooLarge) detail.push(`超過 ${formatBytes(budget)} 防護上限`);
  $('downloadChoiceDetail').textContent = detail.join(' · ');
  $('downloadMp4').disabled = Boolean(downloadJob) || tooLarge;
  if (tooLarge) $('downloadHint').textContent = `此 adaptive 選項估計 ${formatBytes(size)}，超過目前 ${formatBytes(budget)} 記憶體防護上限；請改選較低畫質。`;
}
function clearDownloadSecrets(reason = 'cleared') {
  clearTimeout(downloadInfoExpiryTimer); downloadInfoExpiryTimer = null; downloadInfo = null;
  if (!downloadJob) { $('downloadQuality').innerHTML = '<option value="">請重新掃描</option>'; $('downloadMp4').disabled = true; }
  renderQualitySummary(null); renderQualityMatrix(null); renderChoiceList();
  if (reason === 'expired' && !downloadJob) $('downloadHint').textContent = '格式資訊已逾時並從記憶體清除；請重新掃描目前影片。';
}
function armDownloadInfoExpiry() { clearTimeout(downloadInfoExpiryTimer); downloadInfoExpiryTimer = setTimeout(() => clearDownloadSecrets('expired'), 120000); }
function populateDownloadInfo(info) {
  clearTimeout(downloadInfoExpiryTimer); downloadInfo = info;
  $('downloadProviderStatus').textContent = `目前來源 · ${info?.platformLabel || 'YouTube'}`;
  $('downloadTitle').textContent = info?.title || 'YouTube video';
  $('downloadMeta').textContent = [info?.author, formatDuration(info?.lengthSeconds), info?.videoId ? `ID ${info.videoId}` : null].filter(Boolean).join(' · ');
  $('downloadQuality').replaceChildren();
  (info?.choices || []).forEach((choice, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = choiceLabel(choice); $('downloadQuality').appendChild(option); });
  if (!info?.choices?.length) { const option = document.createElement('option'); option.value = ''; option.textContent = '沒有可用 MP4'; $('downloadQuality').appendChild(option); }
  else { $('downloadQuality').value = settings.downloadDefaultQuality === 'smallest' ? String(info.choices.length - 1) : '0'; armDownloadInfoExpiry(); }
  renderQualitySummary(info); renderQualityMatrix(info); renderSelectedDownload();
}
async function scanDownloads() {
  if (downloadJob) return;
  const token = ++downloadScanToken; downloadInfo = null; $('downloadMp4').disabled = true; $('downloadQuality').innerHTML = '<option value="">正在掃描…</option>';
  $('downloadProviderStatus').textContent = '目前來源 · YouTube'; $('downloadTitle').textContent = '正在掃描目前影片…'; $('downloadMeta').textContent = '高畫質 resolver 會合併頁面 response、播放器實際流與 fallback client。';
  $('downloadQualityMatrix').innerHTML = '<div class="quality-empty">正在比對播放器畫質與可下載格式…</div>'; $('downloadChoiceList').innerHTML = '<div class="quality-empty">正在建立 MP4 選項…</div>'; resetDownloadProgress();
  try {
    await findYoutubeRuntime({ requireVideo: true });
    const result = await sendRuntime({ type: 'YTSS_GET_DOWNLOAD_STUDIO' }, { requireVideo: true });
    if (token !== downloadScanToken) return;
    if (!result?.info) throw new Error(result?.message || '目前影片沒有可讀取的下載資訊。');
    populateDownloadInfo({ ...result.info, platformLabel: 'YouTube', choices: Array.isArray(result.info.choices) ? result.info.choices : [] });
    const counts = result.info.counts || {}, coverage = result.info.qualityCoverage || {};
    const unresolved = counts.unresolved ? `尚有 ${counts.unresolved} 個格式未解析。` : '';
    const expectedMax = coverage.expectedMaxHeight || coverage.nativeMaxHeight || coverage.advertisedMaxHeight || 0;
    const resolved = coverage.resolvedMaxHeight || 0;
    const gap = expectedMax > resolved;
    if (!result.info.choices?.length) {
      $('downloadHint').textContent = `${result?.message || result.info.unavailableReason || '目前沒有能輸出 MP4 的選項。'} ${unresolved}`.trim();
      return;
    }
    $('downloadHint').textContent = gap
      ? `${result.info.resolutionNotice || `播放器最高 ${expectedMax}p，目前 MP4 最高 ${resolved}p。`} ${unresolved} 上方仍會保留未解析畫質與原因。`
      : `找到 ${result.info.choices.length} 個 MP4 選項。${unresolved} Signed URL 只留在目前記憶體。`;
  } catch (error) {
    if (token !== downloadScanToken) return;
    downloadInfo = null; $('downloadQuality').innerHTML = '<option value="">掃描失敗</option>'; $('downloadProviderStatus').textContent = '目前來源 · 未連線'; $('downloadTitle').textContent = '無法取得目前 YouTube 影片'; $('downloadMeta').textContent = '請重新載入影片頁，確認該分頁已載入同一版擴充功能。'; $('downloadHint').textContent = error?.message || String(error); renderQualitySummary(null); renderQualityMatrix(null); renderSelectedDownload();
  }
}
function abortError(message = '下載已取消') { try { return new DOMException(message, 'AbortError'); } catch { const error = new Error(message); error.name = 'AbortError'; return error; } }
function delayWithSignal(ms, signal) { return new Promise((resolve, reject) => { if (signal?.aborted) return reject(abortError()); const timer = setTimeout(done, ms); const onAbort = () => { clearTimeout(timer); reject(abortError()); }; function done() { signal?.removeEventListener('abort', onAbort); resolve(); } signal?.addEventListener('abort', onAbort, { once: true }); }); }
async function fetchMediaBytes(format, kind, remainingBudget, signal) {
  const url = validateMediaUrl(format?.url);
  const label = kind === 'video' ? 'Video' : 'Audio';
  const expected = Number(format?.contentLength) || 0;
  if (expected && expected > remainingBudget) throw new Error(`${label} ${formatBytes(expected)} 超過剩餘記憶體防護額度。`);
  const response = await fetch(url, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`${label} 下載失敗：HTTP ${response.status}`);
  const headerLength = Number(response.headers.get('content-length')) || 0;
  const total = expected || headerLength;
  if (total && total > remainingBudget) { await response.body?.cancel(); throw new Error(`${label} 實際大小 ${formatBytes(total)} 超過記憶體防護額度。`); }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > remainingBudget) throw new Error(`${label} 大小超過記憶體防護額度。`);
    setProgress(kind, 1, `100% · ${formatBytes(bytes.byteLength)}`);
    return bytes;
  }

  const reader = response.body.getReader();
  let received = 0;
  let fixed = total ? new Uint8Array(total) : null;
  const chunks = fixed ? null : [];
  while (true) {
    if (signal.aborted) { await reader.cancel(); throw abortError(); }
    const { done, value } = await reader.read();
    if (done) break;
    if (!(value instanceof Uint8Array)) continue;
    const next = received + value.byteLength;
    if (next > remainingBudget) { await reader.cancel(); throw new Error(`${label} 串流已超過 ${formatBytes(remainingBudget)} 記憶體防護額度。`); }
    if (fixed) {
      if (next > fixed.byteLength) { await reader.cancel(); throw new Error(`${label} 實際資料超過宣告大小，為避免額外記憶體配置已中止。`); }
      fixed.set(value, received);
    } else {
      chunks.push(value);
    }
    received = next;
    const ratio = total ? Math.min(received / total, .995) : 0;
    setProgress(kind, ratio, total ? `${Math.round(ratio * 100)}% · ${formatBytes(received)} / ${formatBytes(total)}` : `${formatBytes(received)} · 大小偵測中`);
  }

  let output;
  if (fixed) {
    output = received === fixed.byteLength ? fixed : fixed.slice(0, received);
  } else {
    // Unknown-length responses are bounded before this second allocation; known lengths use preallocation above.
    output = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  }
  setProgress(kind, 1, `100% · ${formatBytes(received)}`);
  return output;
}
function muxWithWorker(videoBytes, audioBytes, signal) { return new Promise((resolve, reject) => { const worker = new Worker(chrome.runtime.getURL('mp4-remux-worker.js')); if (downloadJob) downloadJob.worker = worker; let settled = false; const finish = (fn, value) => { if (settled) return; settled = true; signal.removeEventListener('abort', onAbort); worker.terminate(); if (downloadJob?.worker === worker) downloadJob.worker = null; fn(value); }; const onAbort = () => finish(reject, abortError('合併已取消')); signal.addEventListener('abort', onAbort, { once: true }); worker.onerror = event => finish(reject, new Error(event?.message || 'MP4 mux worker 失敗')); worker.onmessage = event => { const message = event.data || {}; if (message.type === 'progress') { const progress = message.progress || {}; if (progress.stage === 'mux') setProgress('mux', progress.ratio, `${Math.round((progress.ratio || 0) * 100)}% · ${progress.completed || 0}/${progress.total || 0} fragments`); else if (progress.stage === 'finalize') setProgress('mux', 1, '100%'); return; } if (message.type === 'error') { const error = new Error(message.message || 'MP4 合併失敗'); error.code = message.code || 'mux-failed'; finish(reject, error); return; } if (message.type === 'result' && message.buffer instanceof ArrayBuffer) finish(resolve, message.buffer); }; const videoBuffer = videoBytes.byteOffset === 0 && videoBytes.byteLength === videoBytes.buffer.byteLength ? videoBytes.buffer : videoBytes.slice().buffer; const audioBuffer = audioBytes.byteOffset === 0 && audioBytes.byteLength === audioBytes.buffer.byteLength ? audioBytes.buffer : audioBytes.slice().buffer; worker.postMessage({ type: 'mux', video: videoBuffer, audio: audioBuffer }, [videoBuffer, audioBuffer]); }); }
async function monitorChromeDownload(downloadId, kind, signal) { if (downloadJob) downloadJob.chromeDownloadId = downloadId; while (true) { if (signal.aborted) { try { await chrome.downloads.cancel(downloadId); } catch {} throw abortError(); } const items = await chrome.downloads.search({ id: downloadId }); const item = items?.[0]; if (!item) throw new Error('Chrome 找不到下載工作。'); const total = Number(item.totalBytes) > 0 ? Number(item.totalBytes) : 0; const received = Math.max(0, Number(item.bytesReceived) || 0); const ratio = total ? clamp(received / total, 0, 1) : (item.state === 'complete' ? 1 : 0); setProgress(kind, ratio, total ? `${Math.round(ratio * 100)}% · ${formatBytes(received)} / ${formatBytes(total)}` : (item.state === 'complete' ? '100%' : `${formatBytes(received)}`)); if (item.state === 'complete') return item; if (item.state === 'interrupted') throw new Error(`Chrome 下載中斷：${item.error || 'UNKNOWN'}`); await delayWithSignal(300, signal); } }
async function chromeDownloadUrl(url, filename, progressKind, signal) { const downloadId = await chrome.downloads.download({ url, filename, saveAs: !!settings.downloadSaveAs, conflictAction: 'uniquify' }); if (!Number.isInteger(downloadId)) throw new Error('Chrome 沒有建立下載工作。'); return monitorChromeDownload(downloadId, progressKind, signal); }
async function chromeDownloadBlob(blob, filename, signal) { const objectUrl = URL.createObjectURL(blob); try { const downloadId = await chrome.downloads.download({ url: objectUrl, filename, saveAs: !!settings.downloadSaveAs, conflictAction: 'uniquify' }); if (!Number.isInteger(downloadId)) throw new Error('Chrome 沒有建立輸出下載工作。'); return await monitorChromeDownload(downloadId, 'finalize', signal); } finally { setTimeout(() => URL.revokeObjectURL(objectUrl), 1500); } }
function outputFilename(choice, title = downloadInfo?.title) { const quality = (choice?.qualityLabel || `${choice?.height || 'video'}p`).replace(/[^\w.-]+/g, '_'); return `${sanitizeFilename(title)} [${quality}].mp4`; }
async function runProgressiveDownload(choice, title, signal) { setStage('video', 'Progressive MP4 由 Chrome 直接下載'); setProgress('audio', 1, '內嵌於 MP4'); setProgress('mux', 1, '不需合併'); const url = validateMediaUrl(choice.progressive?.url); await chromeDownloadUrl(url, outputFilename(choice, title), 'video', signal); setStage('finalizing', 'Chrome 已完成檔案寫入'); setProgress('finalize', 1, '100%'); }
async function runAdaptiveDownload(choice, title, signal) { const budget = adaptiveBudgetBytes(); const estimated = choiceSize(choice); if (estimated && estimated > budget) throw new Error(`估計輸入 ${formatBytes(estimated)} 超過目前 ${formatBytes(budget)} 記憶體防護上限。`); setStage('video', '下載 adaptive Video'); const video = await fetchMediaBytes(choice.video, 'video', budget, signal); setStage('audio', '下載 adaptive AAC Audio'); const audio = await fetchMediaBytes(choice.audio, 'audio', budget - video.byteLength, signal); if (video.byteLength + audio.byteLength > budget) throw new Error('Adaptive 輸入超過記憶體防護上限。'); setStage('mux', '本機合併 Video + Audio'); setProgress('mux', 0, '準備 fragments'); const outputBuffer = await muxWithWorker(video, audio, signal); if (signal.aborted) throw abortError(); setProgress('mux', 1, '100%'); setStage('finalizing', `建立單一 MP4 · ${formatBytes(outputBuffer.byteLength)}`); const blob = new Blob([outputBuffer], { type: 'video/mp4' }); await chromeDownloadBlob(blob, outputFilename(choice, title), signal); }
async function downloadMp4() { if (downloadJob) return; const selected = selectedChoice(); if (!selected) return setSaved('請先掃描並選擇畫質'); clearTimeout(downloadInfoExpiryTimer); downloadInfoExpiryTimer = null; const choice = structuredClone(selected); const title = downloadInfo?.title || 'YouTube video'; const controller = new AbortController(); downloadJob = { controller, worker: null, chromeDownloadId: null, startedAt: Date.now(), mode: choice.mode }; resetDownloadProgress(); setDownloadBusy(true); try { if (choice.mode === 'adaptive') await runAdaptiveDownload(choice, title, controller.signal); else await runProgressiveDownload(choice, title, controller.signal); setStage('complete', '下載完成'); setProgress('finalize', 1, '100%'); $('downloadHint').textContent = '下載完成。Signed media URL 已從格式清單清除，且未寫入 extension storage / diagnostics / log。'; setSaved('Download Studio 已完成'); } catch (error) { if (error?.name === 'AbortError' || controller.signal.aborted) { setStage('canceled', '已取消下載'); $('downloadHint').textContent = '下載已取消，暫存媒體資料會由瀏覽器回收。'; setSaved('下載已取消'); } else { setStage('error', '下載失敗'); $('downloadHint').textContent = error?.message || String(error); setSaved(`下載失敗：${error?.message || error}`); } } finally { try { downloadJob?.worker?.terminate(); } catch {} downloadJob = null; clearDownloadSecrets('finished'); setDownloadBusy(false); } }
async function cancelDownload() { const job = downloadJob; if (!job) return; setStage('canceling', '正在取消…'); job.controller.abort(); try { job.worker?.terminate(); } catch {} if (Number.isInteger(job.chromeDownloadId)) { try { await chrome.downloads.cancel(job.chromeDownloadId); } catch {} } }
async function nativeDownload() { try {
    const r = await sendRuntime({ type: 'YTSS_NATIVE_DOWNLOAD' });
    setSaved(r?.message || '官方下載目前不可用');
}
catch (e) {
    setSaved(e?.message || String(e));
} }
function updateDiagnostics(d) { $('diagnosticsText').textContent = d ? JSON.stringify(d, null, 2) : '尚無診斷資料'; }
function saveJson(payload, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function exportDiagnostics() { const stored = await chrome.storage.local.get({ ytssLastTheme: null, ytssActiveContext: null, ytssDiagnostics: null }); saveJson({ schemaVersion: 2, exportedAt: new Date().toISOString(), extension: { name: 'youtube-speed-studio', version: EXTENSION_VERSION }, theme: stored.ytssLastTheme, activeContext: stored.ytssActiveContext, diagnostics: stored.ytssDiagnostics, settings: Object.fromEntries(settingKeys.map(k => [k, settings[k]])) }, `youtube-speed-studio-diagnostics-${Date.now()}.json`); setSaved('診斷 JSON 已匯出'); }
function exportSettings() { saveJson({ schemaVersion: 1, exportedAt: new Date().toISOString(), settings: Object.fromEntries(settingKeys.map(k => [k, settings[k]])) }, `yt-speed-studio-settings-${Date.now()}.json`); setSaved('設定 JSON 已匯出'); }
async function importSettings(file) { const data = JSON.parse(await file.text()); const source = data?.settings && typeof data.settings === 'object' ? data.settings : data; const patch = {}; for (const key of settingKeys)
    if (Object.prototype.hasOwnProperty.call(source, key))
        patch[key] = source[key]; settings = { ...settings, ...patch }; normalizeAll(); await chrome.storage.local.set(Object.fromEntries(settingKeys.map(k => [k, settings[k]]))); syncUI(); applyTheme(); setSaved('設定已匯入'); }
const ACCENTS={violet:['#7658ff','#9a83ff'],blue:['#3478f6','#64a2ff'],cyan:['#00a7c7','#54d6e8'],green:['#1f9d68','#55c998'],amber:['#c88713','#f0b84e'],orange:['#e66a2c','#ff9a58'],rose:['#e04e73','#ff86a4'],magenta:['#b84ad8','#e685ff']};
const BACKGROUNDS={auto:'跟隨網站',dark:'深黑',light:'亮白',graphite:'石墨灰',midnight:'午夜藍',warm:'暖色紙張'};
function renderAppearance(){
  const accent=$('accentPalette'); if(accent){accent.textContent='';for(const [key,colors] of Object.entries(ACCENTS)){const b=document.createElement('button');b.type='button';b.className='color-swatch';b.style.setProperty('--swatch-a',colors[0]);b.style.setProperty('--swatch-b',colors[1]);b.classList.toggle('selected',settings.accentColor===key);b.setAttribute('aria-label',key);b.innerHTML=`<i></i><span>${key}</span>`;b.onclick=()=>savePatch({accentColor:key});accent.appendChild(b)}}
  const bg=$('backgroundPalette'); if(bg){bg.textContent='';for(const [key,label] of Object.entries(BACKGROUNDS)){const b=document.createElement('button');b.type='button';b.className=`theme-choice theme-${key}`;b.classList.toggle('selected',settings.uiBackground===key);b.innerHTML=`<i><span></span><span></span></i><b>${label}</b>`;b.onclick=()=>savePatch({uiBackground:key});bg.appendChild(b)}}
}
function renderUpdateState(info){if(!$('updateStatus'))return;const badge=$('updateBadge');if(info?.available){$('updateStatus').textContent=`v${info.latest} 可用 · 目前 v${EXTENSION_VERSION}`;badge.textContent='UPDATE';badge.classList.add('warn')}else if(info?.ok){$('updateStatus').textContent=`已是最新版本 · v${EXTENSION_VERSION}`;badge.textContent='LATEST';badge.classList.remove('warn')}else{$('updateStatus').textContent=info?.error?'暫時無法連線 GitHub':'尚未檢查';badge.textContent='CHECK'}}
function renderIntegrityState(state){if(!$('buildFingerprint'))return;$('buildFingerprint').textContent=state?.fingerprint||'等待驗證';$('integrityBadge').textContent=state?.ok?'OFFICIAL':state?'CHECK FAILED':'VERIFY';$('integrityBadge').classList.toggle('warn',state&&!state.ok)}
function pageTitle(page) { return { playback: ['播放設定', '控制一般影片、Shorts、Boost 與倍速範圍。'], shortcuts: ['快捷鍵', '配置減速、加速、Boost 與暫停加速按鍵。'], profiles: ['智慧 Profile', '管理頻道與播放清單的自動播放設定。'], overlay: ['懸浮窗', '調整顯示、Hover、黑白主題與透明度。'], downloads: ['Download Studio', '分開呈現播放器畫質、格式解析與 MP4 可下載狀態。'], diagnostics: ['診斷與資料', '匯出診斷、備份設定或安全恢復預設值。'], appearance: ['外觀與語言', '語言、強調色、背景、更新與官方 Build 驗證。'] }[page]; }
function showPage(name, updateHash = true) { const valid = ['playback', 'shortcuts', 'profiles', 'overlay', 'downloads', 'diagnostics', 'appearance']; if (!valid.includes(name)) name = 'playback'; document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name)); document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name)); const [t, subtitle] = pageTitle(name); $('pageTitle').textContent = t; $('pageSubtitle').textContent = subtitle; if (updateHash && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`); if (name === 'profiles') findYoutubeRuntime(); if (name === 'downloads' && !downloadInfo && !downloadJob) scanDownloads(); }
async function load() { if ($('uiLanguage') && globalThis.YTSSI18n) YTSSI18n.populate($('uiLanguage')); const stored = await chrome.storage.local.get({ ...DEFAULTS, ytssLastTheme: 'dark', ytssDiagnostics: null, ytssUpdateInfo: null, ytssIntegrityState: null }); settings = { ...structuredClone(DEFAULTS), ...stored }; normalizeAll(); const migration = {}; if (Number(stored.panelOpacity) !== settings.panelOpacity) migration.panelOpacity = settings.panelOpacity; if (Number(stored.maxSpeed) !== settings.maxSpeed) migration.maxSpeed = settings.maxSpeed; if (Object.keys(migration).length) await chrome.storage.local.set(migration); document.body.dataset.lastYoutubeTheme = stored.ytssLastTheme || 'dark'; latestDiagnostics = stored.ytssDiagnostics || null; applyTheme(stored.ytssLastTheme); $('versionLabel').textContent = `v${EXTENSION_VERSION}`; if (globalThis.YTSSI18n) YTSSI18n.setLocale(settings.uiLanguage || 'auto'); syncUI(); YTSSUI?.enhanceAll(document); renderUpdateState(stored.ytssUpdateInfo); renderIntegrityState(stored.ytssIntegrityState); updateDiagnostics(latestDiagnostics); resetDownloadProgress(); renderSelectedDownload(); }
function wire() {
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  ['enabled', 'floatingEnabled', 'hoverExpand', 'hideFloatingOnSearch', 'rememberLast', 'showPresets', 'compactOnStart', 'lockSpeed', 'preservePitch', 'extremeMode', 'profilesEnabled', 'diagnosticsEnabled', 'downloadSaveAs', 'bilibiliEnabled'].forEach(id => $(id).addEventListener('input', () => savePatch({ [id]: $(id).checked })));
  document.querySelectorAll('.number-control').forEach(control => {
    control.querySelectorAll('button').forEach(button => button.addEventListener('click', () => stepControl(control, Number(button.dataset.step))));
    const id = control.dataset.control;
    $(id).addEventListener('change', () => commitNumber(control));
    $(id).addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $(id).blur(); } });
  });
  $('presets').addEventListener('change', () => savePatch({ presets: parsePresets($('presets').value) }));
  $('themeMode').addEventListener('change', () => savePatch({ themeMode: $('themeMode').value }));
  $('uiLanguage')?.addEventListener('change', async () => { await savePatch({uiLanguage:$('uiLanguage').value}); YTSSI18n?.setLocale(settings.uiLanguage); YTSSUI?.enhanceAll(document); });
  $('panelOpacity').addEventListener('input', () => {
    const value = normalizeOpacity($('panelOpacity').value);
    $('panelOpacityNumber').value = String(value);
    $('panelOpacityNumber').setAttribute('aria-valuenow', String(value));
    $('opacityValue').textContent = `${value}%`;
    schedulePatch(() => ({ panelOpacity: value }));
  });
  $('panelOpacityNumber').addEventListener('input', () => {
    const raw = $('panelOpacityNumber').value.replace(/[^0-9]/g, '').slice(0, 3);
    $('panelOpacityNumber').value = raw;
    if (raw !== '') $('opacityValue').textContent = `${normalizeOpacity(raw)}%`;
  });
  const commitOpacityNumber = () => {
    const value = normalizeOpacity($('panelOpacityNumber').value === '' ? settings.panelOpacity : $('panelOpacityNumber').value);
    $('panelOpacity').value = String(value); $('panelOpacityNumber').value = String(value);
    $('panelOpacityNumber').setAttribute('aria-valuenow', String(value)); $('opacityValue').textContent = `${value}%`;
    savePatch({ panelOpacity: value });
  };
  $('panelOpacityNumber').addEventListener('change', commitOpacityNumber);
  $('panelOpacityNumber').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('panelOpacityNumber').blur(); } });
  $('downloadDefaultQuality').addEventListener('change', () => savePatch({ downloadDefaultQuality: $('downloadDefaultQuality').value }));
  document.querySelectorAll('.key-capture').forEach(button => button.addEventListener('click', () => { capturingSetting = button.dataset.setting; updateKeyLabels(); setSaved('請按下新快捷鍵'); }));
  window.addEventListener('keydown', event => {
    if (!capturingSetting) return;
    event.preventDefault(); event.stopPropagation();
    if (['Escape', 'Tab'].includes(event.code)) { capturingSetting = null; updateKeyLabels(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return setSaved('請使用單一按鍵');
    const used = ['decreaseKey', 'increaseKey', 'boostKey', 'pauseKey'].find(key => key !== capturingSetting && settings[key] === event.code);
    if (used) return setSaved('這個按鍵已被使用');
    const key = capturingSetting; capturingSetting = null; savePatch({ [key]: event.code }).then(updateKeyLabels);
  }, true);
  $('refreshContext').addEventListener('click', findYoutubeRuntime);
  $('saveChannelProfile').addEventListener('click', () => saveProfile('channel'));
  $('savePlaylistProfile').addEventListener('click', () => saveProfile('playlist'));
  $('removeChannelProfile').addEventListener('click', () => removeCurrentProfile('channel'));
  $('removePlaylistProfile').addEventListener('click', () => removeCurrentProfile('playlist'));
  $('resetPosition').addEventListener('click', () => savePatch({ position: { x: null, y: 100 } }));
  $('scanDownloads').addEventListener('click', scanDownloads);
  $('downloadQuality').addEventListener('change', renderSelectedDownload);
  $('downloadMp4').addEventListener('click', downloadMp4);
  $('cancelDownload').addEventListener('click', cancelDownload);
  $('nativeDownload').addEventListener('click', nativeDownload);
  $('exportDiagnostics').addEventListener('click', exportDiagnostics);
  $('exportSettings').addEventListener('click', exportSettings);
  $('importSettings').addEventListener('change', async () => { const file = $('importSettings').files?.[0]; if (file) try { await importSettings(file); } catch (error) { setSaved(`匯入失敗：${error?.message || error}`); } $('importSettings').value = ''; });
  $('resetAll').addEventListener('click', async () => { const ok=await YTSSUI.confirmDestructive({title:'恢復全部預設值',description:'這會覆蓋目前倍速、Profile、快捷鍵、外觀、下載偏好與所有 youtube-speed-studio 設定。',requiredText:'RESET YOUTUBE-SPEED-STUDIO'}); if(!ok)return; await chrome.storage.local.set(DEFAULTS); settings=structuredClone(DEFAULTS); syncUI(); YTSSUI?.enhanceAll(document); applyTheme(); YTSSI18n?.setLocale(settings.uiLanguage); setSaved('已恢復預設值'); YTSSUI.toast('設定已安全重設','danger'); });
  $('checkUpdate')?.addEventListener('click', async()=>{ $('updateStatus').textContent='正在檢查…'; const info=await chrome.runtime.sendMessage({type:'YTSS_CHECK_UPDATE'}); renderUpdateState(info); });
  $('openOfficialRelease')?.addEventListener('click',()=>chrome.tabs.create({url:'https://github.com/Ray20123315/youtube-speed-studio/releases/latest'}));
  $('verifyIntegrity')?.addEventListener('click',async()=>{ $('buildFingerprint').textContent='驗證中…'; const state=await chrome.runtime.sendMessage({type:'YTSS_VERIFY_INTEGRITY'}); renderIntegrityState(state); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.ytssLastTheme) { document.body.dataset.lastYoutubeTheme = changes.ytssLastTheme.newValue || 'dark'; applyTheme(changes.ytssLastTheme.newValue); }
    if (changes.ytssDiagnostics) { latestDiagnostics = changes.ytssDiagnostics.newValue; updateDiagnostics(latestDiagnostics); }
    if (changes.ytssUpdateInfo) renderUpdateState(changes.ytssUpdateInfo.newValue);
    if (changes.ytssIntegrityState) renderIntegrityState(changes.ytssIntegrityState.newValue);
    if (changes.profiles) { settings.profiles = normalizeProfiles(changes.profiles.newValue); renderProfiles(); updateContextUI(); }
  });
  window.addEventListener('hashchange', () => showPage(location.hash.slice(1) || 'playback', false));
  window.addEventListener('pagehide', () => { clearDownloadSecrets('pagehide'); if (downloadJob) downloadJob.controller.abort(); });
}
load().then(() => { wire(); const initialPage = location.hash.slice(1) || 'playback'; showPage(initialPage, false); if (initialPage !== 'downloads') findYoutubeRuntime(); }).catch(console.error);
