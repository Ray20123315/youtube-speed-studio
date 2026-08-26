(() => {
  'use strict';
  const KEY='__YTSS_DIRECT_DOWNLOAD_FALLBACK_V1__';
  if(globalThis[KEY]) return;
  const originalRun=runProgressiveDownload;
  const forbidden=e=>/SERVER_(?:FORBIDDEN|UNAUTHORIZED)|HTTP\s+(?:401|403)/i.test(String(e?.message||e||''));
  const forceMp4=name=>String(name||'youtube-speed-studio.mp4').replace(/\.[^.\\/]+$/i,'')+'.mp4';
  const looksMp4=bytes=>{if(!(bytes instanceof Uint8Array)||bytes.byteLength<12)return false;const lim=Math.min(bytes.byteLength-4,64);for(let i=0;i<=lim;i++){if(bytes[i]===0x66&&bytes[i+1]===0x74&&bytes[i+2]===0x79&&bytes[i+3]===0x70)return true;}return false;};
  async function existingDownload(id){
    if(!Number.isInteger(id)) return null;
    try { const items=await chrome.downloads.search({id}); return items?.[0]||null; } catch { return null; }
  }
  async function eraseFailed(){
    const id=downloadJob?.chromeDownloadId;
    if(!Number.isInteger(id)) return;
    const item=await existingDownload(id);
    if(item){
      if(item.state==='in_progress') { try{await chrome.downloads.cancel(id)}catch{} }
      if(await existingDownload(id)) { try{await chrome.downloads.erase({id})}catch{} }
    }
    if(downloadJob?.chromeDownloadId===id) downloadJob.chromeDownloadId=null;
  }
  async function blobFallback(choice,title,signal,firstError){
    const progressive=choice?.progressive;
    const expected=Number(progressive?.contentLength)||Number(choiceSize(choice))||0;
    const budget=adaptiveBudgetBytes();
    if(expected&&expected>budget) throw new Error(`Chrome 直連被拒（${firstError?.message||'SERVER_FORBIDDEN'}）；此檔約 ${formatBytes(expected)}，超過安全 fetch fallback 上限 ${formatBytes(budget)}。`);
    setStage('video','Chrome 直連被拒；改由擴充取得 Progressive MP4');
    setProgress('video',0,'重新驗證媒體回應');
    let bytes;
    try{bytes=await fetchMediaBytes(progressive,'video',budget,signal)}catch(error){throw new Error(`Chrome 直連被拒；擴充 fetch fallback 也失敗：${error?.message||error}`)}
    if(!looksMp4(bytes)) throw new Error('媒體伺服器回傳內容不是 MP4；已停止寫檔，避免產生 .txt / 錯誤頁。');
    setProgress('audio',1,'內嵌於 MP4');
    setProgress('mux',1,'不需合併');
    setStage('finalizing',`建立 MP4 · ${formatBytes(bytes.byteLength)}`);
    const blob=new Blob([bytes],{type:'video/mp4'});
    await chromeDownloadBlob(blob,forceMp4(outputFilename(choice,title)),signal);
    setProgress('finalize',1,'100%');
  }
  runProgressiveDownload=async function(choice,title,signal){
    try{return await originalRun(choice,title,signal)}catch(error){if(!forbidden(error))throw error;await eraseFailed();return blobFallback(choice,title,signal,error)}
  };
  globalThis[KEY]=Object.freeze({version:2});
})();
