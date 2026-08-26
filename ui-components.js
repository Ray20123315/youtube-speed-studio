(() => {
  'use strict';
  if (globalThis.YTSSUI) return;

  function ensureSharedAccentTheme() {
    if (!document?.head || document.querySelector('link[data-ytss-accent-theme="1"]')) return;
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('accent-theme.css');
      link.dataset.ytssAccentTheme = '1';
      document.head.appendChild(link);
    } catch {}
  }
  ensureSharedAccentTheme();

  function validYoutubeSource(raw) {
    try {
      const url = new URL(String(raw || ''));
      if (url.protocol !== 'https:') return null;
      const host = url.hostname.toLowerCase();
      if (!(host === 'youtube.com' || host.endsWith('.youtube.com'))) return null;
      if (url.pathname !== '/watch' && !url.pathname.startsWith('/shorts/')) return null;
      const videoId = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.split('/')[2] || null;
      return { url, videoId };
    } catch {
      return null;
    }
  }

  function renderDownloadSourceHint() {
    const status = document.getElementById('downloadProviderStatus');
    if (!status || document.getElementById('ytssDownloadSourceContext')) return;
    const params = new URLSearchParams(location.search);
    const source = validYoutubeSource(params.get('sourceUrl'));
    if (!source) return;
    const wrap = document.createElement('div');
    wrap.id = 'ytssDownloadSourceContext';
    wrap.className = 'ytss-source-context';
    wrap.style.cssText = 'display:flex;align-items:center;gap:7px;min-width:0;margin-top:1px';
    const link = document.createElement('a');
    link.className = 'ytss-source-link';
    link.style.cssText = 'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--accent2);font-size:9px;font-weight:750;text-decoration:none';
    link.href = source.url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = source.url.href;
    link.textContent = `來源影片 · ${source.videoId || 'YouTube'}`;
    const tabId = Number(params.get('sourceTabId'));
    if (Number.isInteger(tabId) && tabId > 0) {
      const badge = document.createElement('span');
      badge.textContent = `TAB ${tabId}`;
      badge.style.cssText = 'flex:0 0 auto;border:1px solid var(--ytss-accent-border);border-radius:999px;padding:2px 5px;background:var(--ytss-accent-soft-2);color:var(--accent2);font:750 7px/1 ui-monospace,SFMono-Regular,Consolas,monospace';
      wrap.append(link, badge);
    } else wrap.append(link);
    status.insertAdjacentElement('afterend', wrap);
  }
  renderDownloadSourceHint();

  const closeFns = new Set();
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function enhanceSelect(select) {
    if (!select || select.classList.contains('visually-hidden')) return null; if (select.dataset.customReady === '1') return select.__ytssCustomSelect || null;
    select.dataset.customReady='1'; select.classList.add('ytss-native-select');
    const root=document.createElement('div'); root.className='ytss-select';
    const trigger=document.createElement('button'); trigger.type='button'; trigger.className='ytss-select-trigger'; trigger.setAttribute('aria-haspopup','listbox');
    const panel=document.createElement('div'); panel.className='ytss-select-popover'; panel.hidden=true;
    let search=null;
    if (select.dataset.searchable==='true') { search=document.createElement('input'); search.className='ytss-select-search'; search.type='search'; search.autocomplete='off'; search.placeholder=select.dataset.searchPlaceholder||'Search'; panel.appendChild(search); }
    const list=document.createElement('div'); list.className='ytss-select-list'; list.setAttribute('role','listbox'); panel.appendChild(list);
    select.after(root); root.append(trigger,panel);
    const label=()=>select.selectedOptions[0]?.textContent||'—';
    function render(filter='') { list.textContent=''; const q=filter.trim().toLocaleLowerCase(); [...select.options].forEach(opt=>{ if(q && !`${opt.textContent} ${opt.value}`.toLocaleLowerCase().includes(q)) return; const b=document.createElement('button'); b.type='button'; b.className='ytss-select-option'; b.dataset.value=opt.value; b.setAttribute('role','option'); b.setAttribute('aria-selected',String(opt.selected)); b.innerHTML=`<span>${esc(opt.textContent)}</span>${opt.selected?'<b>✓</b>':''}`; b.addEventListener('click',()=>{ select.value=opt.value; select.dispatchEvent(new Event('change',{bubbles:true})); sync(); close(); }); list.appendChild(b); }); }
    function sync(){ trigger.innerHTML=`<span>${esc(label())}</span><b>⌄</b>`; render(search?.value||''); }
    function open(){ for(const fn of closeFns) if(fn!==close) fn(); panel.hidden=false; root.classList.add('open'); trigger.setAttribute('aria-expanded','true'); render(search?.value||''); if(search){search.focus();search.select();} }
    function close(){ panel.hidden=true; root.classList.remove('open'); trigger.setAttribute('aria-expanded','false'); }
    const api={root,trigger,panel,sync,close}; select.__ytssCustomSelect=api; closeFns.add(close); trigger.addEventListener('click',()=>panel.hidden?open():close()); search?.addEventListener('input',()=>render(search.value)); select.addEventListener('change',sync);
    document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();},{capture:true});
    sync(); return api;
  }
  function enhanceAll(root=document){ root.querySelectorAll('select').forEach(select=>{const api=enhanceSelect(select);api?.sync?.();}); }
  function modalShell(title, body) {
    const overlay=document.createElement('div'); overlay.className='ytss-modal-layer';
    overlay.innerHTML=`<section class="ytss-modal" role="dialog" aria-modal="true"><header><div><small>youtube-speed-studio</small><h2>${esc(title)}</h2></div><button class="ytss-modal-x" type="button" aria-label="Close">×</button></header><div class="ytss-modal-body"></div><footer></footer></section>`;
    const modal=overlay.querySelector('.ytss-modal'); modal.querySelector('.ytss-modal-body').append(body); document.body.appendChild(overlay); return {overlay,modal,footer:modal.querySelector('footer')};
  }
  function confirmDestructive({title='危險操作',description='',requiredText='RESET YOUTUBE-SPEED-STUDIO'}) {
    return new Promise(resolve=>{
      let stage=1;
      const body=document.createElement('div'); body.innerHTML=`<div class="ytss-danger-symbol">!</div><p class="ytss-modal-copy">${esc(description)}</p><div class="ytss-confirm-stage"><b>步驟 1 / 2</b><span>先確認你了解這個操作會覆蓋目前設定。</span></div>`;
      const {overlay,modal,footer}=modalShell(title,body);
      const cancel=document.createElement('button'); cancel.type='button'; cancel.className='ytss-modal-secondary'; cancel.textContent='取消';
      const next=document.createElement('button'); next.type='button'; next.className='ytss-modal-danger'; next.textContent='我了解，繼續'; footer.append(cancel,next);
      let onKey=null; const finish=value=>{if(onKey)document.removeEventListener('keydown',onKey,true);overlay.remove();resolve(value)}; cancel.onclick=()=>finish(false); modal.querySelector('.ytss-modal-x').onclick=()=>finish(false);
      next.onclick=()=>{
        if(stage!==1)return; stage=2; const wrap=body.querySelector('.ytss-confirm-stage'); wrap.innerHTML=`<b>步驟 2 / 2</b><span>請完整輸入下列確認文字：</span><code>${esc(requiredText)}</code><input class="ytss-confirm-input" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(requiredText)}" />`;
        next.textContent='永久重設設定'; next.disabled=true; stage=2; const input=wrap.querySelector('input'); input.addEventListener('input',()=>next.disabled=input.value.trim()!==requiredText); input.focus();
        next.onclick=()=>{ if(!next.disabled)finish(true); };
      };
      overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)finish(false)});
      onKey=e=>{if(e.key==='Escape')finish(false)}; document.addEventListener('keydown',onKey,true);
    });
  }
  function toast(message,kind='info'){ let host=document.querySelector('.ytss-toast-host'); if(!host){host=document.createElement('div');host.className='ytss-toast-host';document.body.appendChild(host)} const el=document.createElement('div');el.className=`ytss-toast ${kind}`;el.textContent=message;host.appendChild(el);setTimeout(()=>el.remove(),2600); }
  globalThis.YTSSUI=Object.freeze({enhanceSelect,enhanceAll,confirmDestructive,toast,renderDownloadSourceHint});
})();

(() => {
  'use strict';

  const SESSION_KEY = 'ytssDownloadGateUnlockedV1';
  const ITERATIONS = 600000;
  const SALT_B64 = '2xX37IYhZW65PlPtcPMqQw==';
  const VERIFIER_B64 = 'czg57XkZYvuagbC5g1uBEZOSe64oIlbsOEXom07Fdeo=';
  const WRAPPED = Symbol('ytss-download-gate-wrapped');
  let gate = null;

  const fromB64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const unlocked = () => {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  };

  async function verifyAccess(input) {
    const material = new TextEncoder().encode(String(input || ''));
    const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(SALT_B64), iterations: ITERATIONS }, key, 256);
    const actual = new Uint8Array(bits);
    const expected = fromB64(VERIFIER_B64);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
    return diff === 0;
  }

  function installStyles() {
    if (document.getElementById('ytssFeatureGateStyles')) return;
    const style = document.createElement('style');
    style.id = 'ytssFeatureGateStyles';
    style.textContent = `
      [data-ytss-gate-hidden="1"]{display:none!important}
      .ytss-test-gate{border:1px solid var(--ytss-accent-border,rgba(255,255,255,.14));border-radius:24px;padding:28px;background:linear-gradient(145deg,var(--panel,#17171d),color-mix(in srgb,var(--accent,#7658ff) 9%,var(--panel,#17171d)));box-shadow:0 24px 70px rgba(0,0,0,.22);display:grid;gap:18px}
      .ytss-test-gate small{font:800 10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em;color:var(--accent2,#9a83ff)}
      .ytss-test-gate h2{margin:0;font-size:28px;line-height:1.15}.ytss-test-gate p{margin:0;max-width:760px;color:var(--muted,#9ca0ad);line-height:1.75}
      .ytss-test-gate-form{display:flex;gap:10px;align-items:center;max-width:560px}.ytss-test-gate-form input{flex:1;min-width:0;border:1px solid var(--border,rgba(255,255,255,.13));background:var(--input-bg,rgba(255,255,255,.055));color:inherit;border-radius:14px;padding:13px 15px;outline:none}.ytss-test-gate-form input:focus{border-color:var(--accent,#7658ff);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#7658ff) 18%,transparent)}
      .ytss-test-gate-form button{border:0;border-radius:14px;padding:13px 18px;font-weight:850;background:linear-gradient(135deg,var(--accent,#7658ff),var(--accent2,#9a83ff));color:white;cursor:pointer}.ytss-test-gate-form button:disabled{opacity:.55;cursor:wait}
      .ytss-test-gate-status{min-height:20px;font-size:12px;color:var(--muted,#9ca0ad)}.ytss-test-gate-status.error{color:#ff7d8f}.ytss-test-gate-status.ok{color:#6bd4a7}
      .ytss-feature-locked-note{margin-top:8px;font-size:11px;color:var(--muted,#9ca0ad)}
      #presets:disabled,#showPresets:disabled{opacity:.55;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  function lockPresetSettings() {
    const presets = document.getElementById('presets');
    const toggle = document.getElementById('showPresets');
    if (presets) {
      presets.disabled = true;
      presets.setAttribute('aria-disabled', 'true');
      const field = presets.closest('.text-field');
      if (field && !field.querySelector('.ytss-feature-locked-note')) {
        const note = document.createElement('small');
        note.className = 'ytss-feature-locked-note';
        note.textContent = '快速倍速功能暫時鎖定，待修復完成後重新開放。';
        field.appendChild(note);
      }
    }
    if (toggle) {
      toggle.disabled = true;
      toggle.setAttribute('aria-disabled', 'true');
      const row = toggle.closest('label');
      const small = row?.querySelector('small');
      if (small) small.textContent = '快速倍速目前暫時鎖定，待修復後重新開放';
    }
  }

  function downloadPage() {
    return document.querySelector('section.page[data-page="downloads"]');
  }

  function setDownloadVisibility(isUnlocked) {
    const page = downloadPage();
    if (!page) return;
    [...page.children].forEach(child => {
      if (child === gate) return;
      if (isUnlocked) child.removeAttribute('data-ytss-gate-hidden');
      else child.setAttribute('data-ytss-gate-hidden', '1');
    });
    if (gate) gate.hidden = isUnlocked;
  }

  function ensureGate() {
    const page = downloadPage();
    if (!page) return null;
    installStyles();
    if (!gate) {
      gate = document.createElement('section');
      gate.className = 'ytss-test-gate';
      gate.id = 'ytssDownloadTestGate';
      gate.innerHTML = `
        <small>YOUTUBE DOWNLOAD STUDIO · TEST ACCESS</small>
        <h2>下載功能尚未完善，目前仍在測試中</h2>
        <p>此功能仍在進行解析、下載與相容性驗證。待功能完善並完成穩定性測試後，將正式開放使用。目前僅提供測試存取。</p>
        <form class="ytss-test-gate-form" autocomplete="off">
          <input type="password" inputmode="text" autocomplete="off" spellcheck="false" aria-label="Download Studio 測試密碼" placeholder="輸入測試密碼" />
          <button type="submit">解鎖測試功能</button>
        </form>
        <div class="ytss-test-gate-status" role="status" aria-live="polite">密碼只用於本次分頁驗證，不會寫入設定、診斷或紀錄。</div>
      `;
      page.prepend(gate);
      const form = gate.querySelector('form');
      const input = gate.querySelector('input');
      const button = gate.querySelector('button');
      const status = gate.querySelector('.ytss-test-gate-status');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        button.disabled = true;
        status.className = 'ytss-test-gate-status';
        status.textContent = '正在驗證…';
        const candidate = input.value;
        input.value = '';
        let ok = false;
        try { ok = await verifyAccess(candidate); } catch {}
        if (!ok) {
          button.disabled = false;
          status.className = 'ytss-test-gate-status error';
          status.textContent = '密碼不正確，Download Studio 仍保持鎖定。';
          input.focus();
          return;
        }
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
        status.className = 'ytss-test-gate-status ok';
        status.textContent = '已解鎖本次測試工作階段。';
        setDownloadVisibility(true);
        button.disabled = false;
        setTimeout(() => {
          try { globalThis.scanDownloads?.(); } catch {}
        }, 0);
      });
    }
    setDownloadVisibility(unlocked());
    return gate;
  }

  function blocked() {
    if (unlocked()) return false;
    ensureGate();
    gate?.querySelector('input')?.focus();
    return true;
  }

  function wrapFunction(name) {
    const fn = globalThis[name];
    if (typeof fn !== 'function' || fn[WRAPPED]) return false;
    const wrapped = function(...args) {
      if (blocked()) return Promise.resolve(null);
      return fn.apply(this, args);
    };
    Object.defineProperty(wrapped, WRAPPED, { value: true });
    globalThis[name] = wrapped;
    return true;
  }

  function wrapOptionsLifecycle() {
    for (const name of ['scanDownloads', 'downloadMp4', 'nativeDownload', 'cancelDownload']) wrapFunction(name);
    const show = globalThis.showPage;
    if (typeof show === 'function' && !show[WRAPPED]) {
      const wrappedShow = function(name, ...rest) {
        const result = show.call(this, name, ...rest);
        if (name === 'downloads') ensureGate();
        return result;
      };
      Object.defineProperty(wrappedShow, WRAPPED, { value: true });
      globalThis.showPage = wrappedShow;
    }
  }

  document.addEventListener('click', event => {
    if (unlocked()) return;
    const page = downloadPage();
    if (!page || !page.contains(event.target) || gate?.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blocked();
  }, true);

  installStyles();
  lockPresetSettings();
  ensureGate();
  let attempts = 0;
  const timer = setInterval(() => {
    wrapOptionsLifecycle();
    lockPresetSettings();
    ensureGate();
    attempts += 1;
    if (attempts >= 80) clearInterval(timer);
  }, 25);
})();
