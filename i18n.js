(() => {
  'use strict';
  if (globalThis.YTSSI18n) return;

  const LANGUAGES = [
    ['auto','自動 / Auto'],['zh-Hant','繁體中文'],['zh-Hans','简体中文'],['en','English'],
    ['ja','日本語'],['ko','한국어'],['es','Español'],['es-419','Español (Latinoamérica)'],['fr','Français'],['de','Deutsch'],['it','Italiano'],
    ['pt-BR','Português (Brasil)'],['pt-PT','Português'],['ru','Русский'],['uk','Українська'],['pl','Polski'],['nl','Nederlands'],['sv','Svenska'],
    ['da','Dansk'],['fi','Suomi'],['no','Norsk'],['is','Íslenska'],['cs','Čeština'],['sk','Slovenčina'],['sl','Slovenščina'],['hr','Hrvatski'],
    ['sr','Српски'],['bs','Bosanski'],['mk','Македонски'],['bg','Български'],['ro','Română'],['hu','Magyar'],['el','Ελληνικά'],['tr','Türkçe'],
    ['ar','العربية'],['he','עברית'],['fa','فارسی'],['ur','اردو'],['hi','हिन्दी'],['bn','বাংলা'],['ta','தமிழ்'],['te','తెలుగు'],['mr','मराठी'],
    ['gu','ગુજરાતી'],['kn','ಕನ್ನಡ'],['ml','മലയാളം'],['pa','ਪੰਜਾਬੀ'],['ne','नेपाली'],['si','සිංහල'],['th','ไทย'],['vi','Tiếng Việt'],
    ['id','Bahasa Indonesia'],['ms','Bahasa Melayu'],['fil','Filipino'],['my','မြန်မာ'],['km','ខ្មែរ'],['lo','ລາວ'],['mn','Монгол'],
    ['ka','ქართული'],['hy','Հայերեն'],['az','Azərbaycanca'],['kk','Қазақша'],['uz','Oʻzbekcha'],['et','Eesti'],['lv','Latviešu'],['lt','Lietuvių'],
    ['sq','Shqip'],['ca','Català'],['eu','Euskara'],['gl','Galego'],['cy','Cymraeg'],['ga','Gaeilge'],['af','Afrikaans'],['sw','Kiswahili'],
    ['zu','isiZulu'],['am','አማርኛ'],['so','Soomaali'],['eo','Esperanto']
  ];

  const EN = {
    '播放':'Playback','快捷鍵':'Shortcuts','智慧 Profile':'Smart Profiles','懸浮窗':'Overlay','下載':'Downloads','診斷與資料':'Diagnostics & Data','外觀與語言':'Appearance & Language',
    '播放設定':'Playback settings','一般影片':'Regular video','速度引擎':'Speed engine','平台支援':'Platform support','完整':'Full','啟用':'Enabled','記住最後倍速':'Remember last speed','鎖定倍速':'Lock playback speed','保持原音調':'Preserve pitch','極速模式':'Extreme mode','快速倍速':'Speed presets',
    '減速':'Slow down','加速':'Speed up','按住暫時加速':'Hold to boost','按住暫停加速':'Hold for 1×','放開恢復':'Release to restore','按住為 1×':'Hold = 1×',
    '目前偵測來源':'Runtime source','重新偵測':'Reconnect','目前頻道':'Current channel','目前播放清單':'Current playlist','儲存目前設定':'Save current settings','刪除':'Delete','尚未偵測':'Not detected','未建立 Profile':'No profile','無':'None','已儲存 Profiles':'Saved profiles',
    '懸浮控制器':'Floating controller','顯示懸浮控制器':'Show floating controller','滑鼠懸停才展開':'Expand on hover','搜尋頁隱藏懸浮窗':'Hide on search pages','顯示快速倍速':'Show presets','啟動時收合':'Start collapsed','主題':'Theme','透明度':'Opacity','重設懸浮窗位置':'Reset overlay position',
    '重新掃描':'Rescan','播放器可選最高':'Player maximum','格式資料最高':'Advertised maximum','目前可下載最高':'Downloadable maximum','解析狀態':'Resolver state','畫質可用性':'Quality availability','可下載 MP4':'Downloadable MP4','下載選取的 MP4':'Download selected MP4','取消工作':'Cancel job','大檔案記憶體防護':'Large-file memory guard','工作狀態':'Job status','每次詢問儲存位置':'Ask where to save','預設畫質':'Default quality','最高可下載畫質':'Best available','最小檔案 / 最低畫質':'Smallest file / lowest quality',
    '診斷':'Diagnostics','匯出診斷 JSON':'Export diagnostics JSON','匯出設定 JSON':'Export settings JSON','匯入設定 JSON':'Import settings JSON','重設':'Reset','恢復全部預設值':'Reset all settings','設定自動儲存':'Settings save automatically','設定會自動儲存':'Settings save automatically',
    '尚未掃描':'Not scanned','尚未掃描影片。':'Video not scanned.','尚未找到可下載選項。':'No downloadable option found.','等待下載':'Waiting','目前來源 · YouTube':'Current source · YouTube','尚未檢查':'Not checked','尚無診斷資料':'No diagnostics yet','待掃描':'Pending scan','等待驗證':'Waiting for verification','正在估算安全上限…':'Estimating safe limit…','正在尋找 YouTube 分頁…':'Looking for a YouTube tab…','正在連線目前影片分頁…':'Connecting to the current video tab…',
    '語言':'Language','強調色':'Accent color','背景風格':'Background style','更新':'Updates','官方版本':'Official build','檢查更新':'Check for updates','已是最新版本':'You are up to date','更新可用':'Update available','前往官方 Release':'Open official Release','完整性驗證':'Integrity verification','驗證官方 Build':'Verify official build',
    '常用控制':'Quick controls','懸浮控制':'Floating controls','完整設定':'Full settings','開啟 Download Studio':'Open Download Studio','顯示 youtube-speed-studio':'Show youtube-speed-studio','Hover 展開':'Hover expand','移入顯示完整控制':'Show full controls on hover','YouTube 頻道 / 清單':'YouTube channel / playlist',
    '每次增減':'Step size','最低倍速':'Minimum speed','最高倍速':'Maximum speed','Boost 倍速':'Boost speed','每次 -Step':'Each -Step','每次 +Step':'Each +Step','快捷鍵與懸浮窗的步進':'Step used by shortcuts and overlay','允許 4× 以上，最高 16×':'Allow speeds above 4×, up to 16×','允許的播放下限':'Allowed playback minimum','極速模式最高可精準到 16×':'Extreme mode reaches exactly 16×','所有數值控制均為自製元件，不使用瀏覽器原生 spinner。':'All numeric controls use custom UI; browser-native number spinners are not used.',
    '依目前 Profile 或全域設定保存':'Save using the active Profile or global settings','網站播放器改動速度時自動拉回':'Restore the configured speed if the site player changes it','使用 HTMLMediaElement.preservesPitch':'Use HTMLMediaElement.preservesPitch','逗號分隔，最多 8 個':'Comma-separated, up to 8 entries','防止播放器改回':'Prevent the player from overriding the speed','按住 Boost 快捷鍵':'Hold the Boost shortcut','按住快捷鍵時':'While the shortcut is held','點選按鍵卡後直接按新按鍵；輸入框、搜尋框與留言框中不攔截。':'Select a key card, then press the new key. Inputs, search fields and comment boxes are never intercepted.',
    '播放清單優先於頻道，未設定時使用全域設定；會保存一般 / Shorts、Boost、鎖定與原音調。':'Playlist Profiles override channel Profiles; global settings are used when no Profile exists. Profiles store regular/Shorts speed, Boost, lock and pitch settings.','可直接清理不再使用的頻道或播放清單設定。':'Remove channel or playlist Profiles you no longer use.','可拖曳並記住位置':'Drag and remember position','控制顯示、Hover 收合、主題與透明度。':'Control visibility, hover collapse, theme and opacity.','收合時保留 S / youtube-speed-studio / 模式 / 快捷鍵 / 倍速':'Collapsed mode keeps S / youtube-speed-studio / mode / shortcuts / speed','YouTube /results 不顯示':'Hide on YouTube /results','完整懸浮窗顯示 Preset':'Show presets in the expanded overlay','Hover 模式關閉時使用':'Used when Hover mode is disabled','可跟隨目前影片網站':'Can follow the current video website','預設 90；可拖曳滑桿或直接輸入 0–100':'Default 90; drag the slider or enter 0–100 directly',
    '看得懂「有什麼」也看得懂「為什麼不能下載」':'See what is available and why some formats cannot be downloaded','不再把 240p 當成影片最高畫質。播放器可選、player response 有宣告、已解析媒體 URL、最終可輸出 MP4，四層狀態會分開顯示。':'240p is no longer presented as the video maximum. Player availability, advertised player data, resolved media URLs and final MP4 output are shown as separate layers.','保持一個已載入此版本的 YouTube 影片分頁，再按「重新掃描」。':'Keep a YouTube video tab loaded with this version, then press Rescan.','即使某畫質尚未能輸出 MP4，也會保留在這裡並標示原因。':'Qualities that cannot currently be exported as MP4 remain visible with the reason.','選擇單檔直載，或 Video + AAC 在本機合併。':'Choose a direct single-file download or locally merge Video + AAC.','選取一個可下載畫質後，這裡會顯示 codec、模式、大小與記憶體風險。':'Select a downloadable quality to see codec, mode, size and memory risk.','Progressive 由 Chrome 直接寫入檔案；Adaptive 才會把 Video / Audio 送進本機 mux。超過裝置估算上限時會在下載前或串流途中中止。':'Progressive files are written directly by Chrome. Adaptive Video / Audio is sent to the local muxer. Jobs stop before or during transfer if the estimated device memory limit is exceeded.','媒體 signed URL 只存在目前頁面與 Download Studio 記憶體；掃描逾時、下載完成、取消或離頁就清除，不寫入 storage、診斷 JSON、專案資料或 log。':'Signed media URLs exist only in the current page and Download Studio memory. They are cleared on timeout, completion, cancellation or navigation and are not written to storage, diagnostics, project data or logs.','每次詢問儲存位置':'Ask where to save each time','關閉時使用 Chrome 預設下載資料夾':'When disabled, use Chrome’s default Downloads folder','掃描完成後自動選擇':'Automatically select after scanning','改用 YouTube 官方離線下載':'Use YouTube official offline download instead','影像 Video':'Video','音訊 Audio':'Audio','本機合併 Mux':'Local mux','檔案完成 Finalizing':'Finalizing file',
    '診斷匯出不包含直接 MP4 媒體 URL。':'Diagnostic exports do not contain direct MP4 media URLs.','懸浮窗顯示 Debug':'Show Debug in overlay','顯示 resolver、Profile、暫時狀態與套用來源':'Show resolver, Profile, temporary state and applied source','這是重大操作。按下後會先要求確認，再要求輸入確認文字；不會直接執行。':'This is a destructive operation. You must acknowledge the risk and then type the confirmation text before it runs.','所有下拉選單與彈窗使用 youtube-speed-studio 自製元件，不使用瀏覽器原生選單視覺。':'All in-extension dropdowns and modals use youtube-speed-studio custom components instead of browser-native menu visuals.','可搜尋；繁中、簡中、英文完整內建，其餘語言使用英文回退。':'Searchable. Traditional Chinese, Simplified Chinese and English are fully bundled; other locales currently fall back to English.','按鈕、Focus、Badge 與品牌亮色':'Buttons, focus rings, badges and brand highlights','不只黑／白；可選石墨、午夜、暖紙等背景。':'More than black and white: choose Graphite, Midnight, Warm Paper and other backgrounds.','跟隨目前網站':'Follow current site','固定黑色':'Fixed dark','固定白色':'Fixed light','石墨灰':'Graphite','午夜藍':'Midnight','暖色紙張':'Warm paper',
    'GitHub 版本不做不可靠的靜默覆蓋；會定期檢查官方 Releases，顯示更新 Badge 與官方連結。':'GitHub builds do not attempt unreliable silent replacement. Official Releases are checked periodically and an update badge/link is shown.','官方 Build 使用 SHA-256 檔案清單與 Build Fingerprint 做防偽。這是 tamper-evident 驗證，不宣稱瀏覽器端程式能技術上絕對禁止修改。':'Official builds use a SHA-256 file manifest and Build Fingerprint for tamper evidence. Client-side code cannot technically make modification impossible.','Build Fingerprint':'Build Fingerprint','YOUTUBE DOWNLOAD STUDIO':'YOUTUBE DOWNLOAD STUDIO','YOUTUBE SPEED STUDIO':'YOUTUBE SPEED STUDIO','本機合併 Mux':'Local mux','檔案完成 Finalizing':'Finalizing','畫質可用性、adaptive Video + Audio、本機 MP4 合併、進度與取消集中在完整頁面。':'Quality availability, adaptive Video + Audio, local MP4 muxing, progress and cancellation live in the full page.','Popup 不再直接持有或顯示媒體 URL；掃描與下載只在 Download Studio 執行。':'The Popup never holds or displays media URLs; scanning and downloading happen only in Download Studio.','同一套播放核心使用 Provider Adapter；YouTube 完整支援，bilibili 先提供 HTML5 播放控制、快捷鍵與懸浮窗。':'The playback core uses Provider Adapters. YouTube has full support; bilibili currently provides HTML5 playback control, shortcuts and overlay support.','倍速 · 快捷鍵 · 懸浮控制 · 位置記憶':'Speed · shortcuts · overlay · position memory','倍速 · Shorts · Profile · Download Studio':'Speed · Shorts · Profiles · Download Studio','播放 · 快捷鍵 · Profile · 懸浮窗 · 下載 · 診斷':'Playback · shortcuts · Profiles · overlay · downloads · diagnostics','YouTube · bilibili 快速播放控制':'Fast playback controls for YouTube · bilibili'
  };

  const ZH_HANS = {
    '快捷鍵':'快捷键','智慧 Profile':'智能 Profile','懸浮窗':'悬浮窗','下載':'下载','診斷與資料':'诊断与数据','外觀與語言':'外观与语言','播放設定':'播放设置','一般影片':'一般视频','平台支援':'平台支持','啟用':'启用','記住最後倍速':'记住最后倍速','鎖定倍速':'锁定倍速','保持原音調':'保持原音调','極速模式':'极速模式','目前偵測來源':'当前检测来源','重新偵測':'重新检测','目前頻道':'当前频道','目前播放清單':'当前播放列表','儲存目前設定':'保存当前设置','刪除':'删除','尚未偵測':'尚未检测','無':'无','已儲存 Profiles':'已保存 Profiles','懸浮控制器':'悬浮控制器','顯示懸浮控制器':'显示悬浮控制器','滑鼠懸停才展開':'鼠标悬停时展开','搜尋頁隱藏懸浮窗':'搜索页隐藏悬浮窗','顯示快速倍速':'显示快速倍速','啟動時收合':'启动时收起','主題':'主题','重設懸浮窗位置':'重置悬浮窗位置','重新掃描':'重新扫描','播放器可選最高':'播放器可选最高','格式資料最高':'格式数据最高','目前可下載最高':'当前可下载最高','解析狀態':'解析状态','畫質可用性':'画质可用性','可下載 MP4':'可下载 MP4','下載選取的 MP4':'下载选中的 MP4','取消工作':'取消任务','大檔案記憶體防護':'大文件内存防护','工作狀態':'任务状态','每次詢問儲存位置':'每次询问保存位置','預設畫質':'默认画质','最高可下載畫質':'最高可下载画质','最小檔案 / 最低畫質':'最小文件 / 最低画质','診斷':'诊断','匯出診斷 JSON':'导出诊断 JSON','匯出設定 JSON':'导出设置 JSON','匯入設定 JSON':'导入设置 JSON','重設':'重置','恢復全部預設值':'恢复全部默认值','設定自動儲存':'设置自动保存','設定會自動儲存':'设置会自动保存','尚未掃描':'尚未扫描','尚未掃描影片。':'尚未扫描视频。','尚未找到可下載選項。':'尚未找到可下载选项。','等待下載':'等待下载','語言':'语言','強調色':'强调色','背景風格':'背景风格','更新':'更新','官方版本':'官方版本','檢查更新':'检查更新','已是最新版本':'已是最新版本','更新可用':'有可用更新','前往官方 Release':'前往官方 Release','完整性驗證':'完整性验证','驗證官方 Build':'验证官方 Build'
  };

  // Explicit conversion is intentionally phrase-first; common characters below cover remaining UI text.
  const SIMPLE_CHARS = {'體':'体','鍵':'键','載':'载','斷':'断','與':'与','據':'据','觀':'观','設':'设','頻':'频','鎖':'锁','調':'调','極':'极','啟':'启','記':'记','偵':'侦','測':'测','當':'当','單':'单','儲':'储','刪':'删','懸':'悬','顯':'显','搜':'搜','尋':'寻','頁':'页','隱':'隐','開':'开','題':'题','重':'重','掃':'扫','選':'选','資':'资','態':'态','畫':'画','質':'质','檔':'档','詢':'询','預':'预','匯':'汇','診':'诊','語':'语','強':'强','顏':'颜','樣':'样','復':'复','這':'这','會':'会','輸':'输','確':'确','認':'认','階':'阶','驟':'骤','風':'风','險':'险','寫':'写','繼':'继','續':'续','終':'终','讀':'读','驗':'验','證':'证','擴':'扩','廣':'广','應':'应','過':'过','離':'离','處':'处','進':'进','數':'数','值':'值','範':'范','圍':'围','時':'时','網':'网','線':'线','萬':'万','億':'亿','將':'将','於':'于','還':'还','僅':'仅','則':'则','稱':'称','別':'别','無':'无','從':'从','為':'为','並':'并','較':'较','點':'点','擊':'击','裡':'里','發':'发','現':'现','層':'层','碼':'码','劃':'划','權':'权','標':'标','籤':'签','冊':'册','備':'备','份':'份','檢':'检','查':'查','長':'长','寬':'宽','縮':'缩','轉':'转','優':'优','先':'先','據':'据','務':'务','暫':'暂','離':'离','清':'清','除':'除'};

  let requested='auto';
  let resolved='zh-Hant';
  let observer=null;
  let scheduled=false;
  const sourceText=new WeakMap();
  const lastOutput=new WeakMap();
  const sourceAttr=new WeakMap();

  function normalize(locale){
    const l=String(locale||'').replace('_','-');
    if(/^zh-(TW|HK|MO|Hant)/i.test(l)) return 'zh-Hant';
    if(/^zh/i.test(l)) return 'zh-Hans';
    if(/^en/i.test(l)) return 'en';
    return l||'en';
  }
  function resolve(locale){
    const n=normalize(locale==='auto'?(navigator.languages?.[0]||navigator.language||'en'):locale);
    return ['zh-Hant','zh-Hans','en'].includes(n)?n:'en';
  }
  function simplify(text){ return [...String(text)].map(c=>SIMPLE_CHARS[c]||c).join(''); }
  function phrase(text){
    const src=String(text??'');
    if(resolved==='zh-Hant') return src;
    if(resolved==='zh-Hans') return ZH_HANS[src] || simplify(src);
    return EN[src] || src;
  }
  function translateTextNode(node){
    const current=node.nodeValue||'';
    if(!sourceText.has(node) || (lastOutput.has(node) && current!==lastOutput.get(node))){ sourceText.set(node,current); }
    const src=sourceText.get(node)||'';
    const trim=src.trim();
    if(!trim){ lastOutput.set(node,src); return; }
    const translated=phrase(trim);
    const left=src.match(/^\s*/)?.[0]||'';
    const right=src.match(/\s*$/)?.[0]||'';
    const output=left+translated+right;
    if(node.nodeValue!==output) node.nodeValue=output;
    lastOutput.set(node,output);
  }
  function apply(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    for(const node of nodes){ if(node.parentElement?.closest('script,style,code,pre,.no-i18n')) continue; translateTextNode(node); }
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(el=>{
      const base=sourceAttr.get(el)||{};
      for(const attr of ['placeholder','title','aria-label']){
        const current=el.getAttribute(attr);
        if(!base[attr] || (base[`out:${attr}`] && current!==base[`out:${attr}`])) base[attr]=current;
        if(base[attr]){ const output=phrase(base[attr]); if(current!==output) el.setAttribute(attr,output); base[`out:${attr}`]=output; }
      }
      sourceAttr.set(el,base);
    });
    document.documentElement.lang=resolved;
    document.documentElement.dir=/^(ar|he|fa|ur)/i.test(requested)?'rtl':'ltr';
  }
  function scheduleApply(){ if(scheduled) return; scheduled=true; queueMicrotask(()=>{scheduled=false;apply(document);}); }
  function startObserver(){
    if(observer || !document.documentElement) return;
    observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>m.type==='childList'||m.type==='characterData'||m.type==='attributes')) scheduleApply();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
  }
  function setLocale(locale){ requested=locale||'auto'; resolved=resolve(requested); apply(document); startObserver(); document.dispatchEvent(new CustomEvent('ytss-language-changed',{detail:{requested,resolved}})); return resolved; }
  function populate(select){
    select.textContent='';
    for(const [value,label] of LANGUAGES){
      const option=document.createElement('option'); option.value=value;
      option.textContent=label+(value!=='auto'&&!['zh-Hant','zh-Hans','en'].includes(value)?' · English fallback':'');
      select.appendChild(option);
    }
  }
  globalThis.YTSSI18n=Object.freeze({LANGUAGES,populate,setLocale,apply,phrase,get requested(){return requested},get resolved(){return resolved}});
})();
