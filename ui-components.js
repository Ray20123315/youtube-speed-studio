(() => {
  'use strict';
  if (globalThis.YTSSUI) return;
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
  globalThis.YTSSUI=Object.freeze({enhanceSelect,enhanceAll,confirmDestructive,toast});
})();
