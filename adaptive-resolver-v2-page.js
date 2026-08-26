(() => {
  'use strict';
  const KEY='__YTSS_ADAPTIVE_RESOLVER_V2_1055__';
  if(globalThis[KEY]) return; globalThis[KEY]=true;
  const CAPTURE_ATTR='data-ytss-adaptive-v2-capture', CAPTURE_EVENT='ytss-adaptive-v2-capture', RESET='ytss-adaptive-v2-reset';
  const INFO_ATTR='data-ytss-download-studio-info', INFO_READY='ytss-download-studio-info-ready', INFO_REQUEST='ytss-request-download-studio-info';
  const captures=[]; const clientResponses=[]; let videoSnapshot=null; let prefetchPromise=null;
  const now=()=>Date.now();
  const currentVideoId=()=>{const u=new URL(location.href);return u.pathname.startsWith('/shorts/')?u.pathname.split('/')[2]||null:u.searchParams.get('v')};
  const ytcfg=k=>{try{return window.ytcfg?.get?.(k)}catch{return null}};
  const parseJson=v=>{if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v)}catch{return null}};
  const isGvs=raw=>{try{const u=new URL(String(raw||''),location.href);return u.protocol==='https:'&&(u.hostname==='googlevideo.com'||u.hostname.endsWith('.googlevideo.com'))&&/\/videoplayback(?:$|[/?])/i.test(u.pathname)}catch{return false}};
  function resetIfChanged(){const id=currentVideoId();if(videoSnapshot!==null&&id!==videoSnapshot){captures.length=0;clientResponses.length=0;prefetchPromise=null;}videoSnapshot=id;}
  function normalizeUrl(raw){
    try{
      const u=new URL(String(raw||''),location.href); if(!isGvs(u.href))return {url:null,reason:'not-gvs'};
      if(u.searchParams.get('sabr')==='1')return {url:null,reason:'sabr'};
      const signed=new Set(String(u.searchParams.get('sparams')||'').split(',').map(x=>x.trim()).filter(Boolean));
      if((signed.has('range')&&u.searchParams.has('range'))||(signed.has('sq')&&u.searchParams.has('sq')))return {url:null,reason:'signed-partial'};
      for(const k of ['range','rn','rbuf','sq','alr']) if(!signed.has(k))u.searchParams.delete(k);
      const exp=Number(u.searchParams.get('expire'))||null; if(exp&&exp*1000<now()+30000)return {url:null,reason:'expired',expire:exp};
      return {url:u.href,reason:null,expire:exp};
    }catch{return {url:null,reason:'invalid'}}
  }
  function remember(payload){resetIfChanged();const current=currentVideoId();if(payload?.videoId&&current&&payload.videoId!==current)return;const n=normalizeUrl(payload?.url);let itag=null;try{itag=Number(new URL(payload.url).searchParams.get('itag'))||null}catch{};captures.push({itag,url:n.url,reason:n.reason,expire:n.expire,at:Number(payload?.at)||now(),videoId:payload?.videoId||current});if(captures.length>220)captures.splice(0,captures.length-220);}
  function playerResponses(){
    const active=document.querySelector('ytd-reel-video-renderer[is-active],ytd-reel-video-renderer[active]'),watch=document.querySelector('ytd-watch-flexy'),movie=active?.querySelector?.('#movie_player')||document.querySelector('#movie_player'),player=active?.querySelector?.('ytd-player')||document.querySelector('ytd-player');
    const vals=[movie?.getPlayerResponse?.(),active?.data?.playerResponse,active?.__data?.data?.playerResponse,watch?.data?.playerResponse,watch?.__data?.data?.playerResponse,watch?.playerData?.playerResponse,player?.playerResponse,window.ytInitialPlayerResponse,window.ytplayer?.config?.args?.player_response,...clientResponses];
    const id=currentVideoId(),seen=new Set();return vals.map(parseJson).filter(v=>{if(!v||seen.has(v))return false;seen.add(v);const x=v?.videoDetails?.videoId;return !id||!x||x===id});
  }
  function parseMime(raw){const s=String(raw||''),parts=s.split(';').map(x=>x.trim()),container=(parts[0]||'').toLowerCase(),codecs=parts.join(';').match(/codecs="([^"]+)"/i)?.[1]?.split(',').map(x=>x.trim()).filter(Boolean)||[];return{container,codecs,raw:s}}
  function directFromFormat(f){
    if(typeof f?.url==='string'){const n=normalizeUrl(f.url);if(n.url)return{url:n.url,source:'client-direct'}}
    const raw=typeof f?.signatureCipher==='string'?f.signatureCipher:typeof f?.cipher==='string'?f.cipher:'';
    if(raw){const p=new URLSearchParams(raw);if(!p.get('s')){const n=normalizeUrl(p.get('url'));if(n.url)return{url:n.url,source:'cipher-no-s'}}}
    return null;
  }
  function formatMap(){const map=new Map();for(const r of playerResponses())for(const key of ['formats','adaptiveFormats'])for(const f of r?.streamingData?.[key]||[]){const it=Number(f?.itag);if(!it)continue;const old=map.get(it);if(!old||Number(f?.contentLength||0)>Number(old?.contentLength||0))map.set(it,f);}return map;}
  function bestObserved(){resetIfChanged();const map=new Map();for(const c of captures){if(!c.itag||!c.url)continue;const old=map.get(c.itag);if(!old||(c.expire||0)>(old.expire||0)||c.at>old.at)map.set(c.itag,c);}return map;}
  function meta(f,kind,url,source){const m=parseMime(f?.mimeType);return{itag:Number(f?.itag)||null,kind,url,urlSource:source,mimeType:m.raw,container:m.container,codec:m.codecs.join(', '),codecs:m.codecs,qualityLabel:f?.qualityLabel||null,height:Number(f?.height)||null,fps:Number(f?.fps)||null,bitrate:Number(f?.bitrate)||null,averageBitrate:Number(f?.averageBitrate)||null,contentLength:Number(f?.contentLength)||null,approxDurationMs:Number(f?.approxDurationMs)||null,audioQuality:f?.audioQuality||null,audioSampleRate:Number(f?.audioSampleRate)||null,audioChannels:Number(f?.audioChannels)||null,hasDrm:Boolean(f?.drmFamilies?.length||f?.licenseInfos?.length)}}
  function build(){
    const formats=formatMap(), observed=bestObserved(), metas=[]; let clientDirect=0;
    for(const [itag,f] of formats){let resolved=observed.get(itag)?{url:observed.get(itag).url,source:'webrequest-observed'}:directFromFormat(f);if(!resolved)continue;if(resolved.source!=='webrequest-observed')clientDirect++;const m=parseMime(f?.mimeType),hasAudio=Boolean(f?.audioChannels||f?.audioQuality),kind=m.container.startsWith('audio/')?'audio':m.container.startsWith('video/')&&hasAudio?'progressive':'video';metas.push(meta(f,kind,resolved.url,resolved.source));}
    const progressive=metas.filter(x=>x.url&&x.container==='video/mp4'&&(x.audioChannels||x.audioQuality)&&!x.hasDrm).map(x=>({id:`p-${x.itag}`,mode:'progressive',qualityLabel:x.qualityLabel||(x.height?`${x.height}p`:'MP4'),height:x.height,fps:x.fps,bitrate:x.bitrate,contentLength:x.contentLength,codec:x.codec,progressive:x}));
    const videos=metas.filter(x=>x.url&&x.container==='video/mp4'&&x.height&&!x.audioChannels&&!x.audioQuality&&!x.hasDrm).sort((a,b)=>(b.height||0)-(a.height||0)||(b.bitrate||0)-(a.bitrate||0));
    const audios=metas.filter(x=>x.url&&x.container==='audio/mp4'&&(x.audioChannels||x.audioQuality)&&/(?:mp4a|aac)/i.test(x.codec)&&!x.hasDrm).sort((a,b)=>(b.bitrate||b.averageBitrate||0)-(a.bitrate||a.averageBitrate||0));
    const audio=audios[0]||null, adaptive=audio?videos.map(v=>({id:`a-${v.itag}-${audio.itag}`,mode:'adaptive',qualityLabel:v.qualityLabel||`${v.height||'?'}p`,height:v.height,fps:v.fps,bitrate:v.bitrate,contentLength:(v.contentLength||0)+(audio.contentLength||0)||null,codec:`${v.codec||'video'} + ${audio.codec||'audio'}`,video:v,audio})) : [];
    const rejected={sabr:captures.filter(c=>c.reason==='sabr').length,signedPartial:captures.filter(c=>c.reason==='signed-partial').length,expired:captures.filter(c=>c.reason==='expired').length};
    const webmVideo=metas.filter(x=>x.container==='video/webm'&&x.kind==='video').length, opusAudio=metas.filter(x=>x.container==='audio/webm'&&/(opus|vorbis)/i.test(x.codec)).length;
    return{choices:[...progressive,...adaptive].sort((a,b)=>(b.height||0)-(a.height||0)),stats:{captured:captures.length,usableObserved:observed.size,matchedFormats:metas.length,mp4Video:videos.length,aacAudio:audios.length,webmVideo,opusAudio,clientDirect,addedChoices:progressive.length+adaptive.length,...rejected}};
  }
  function enrich(info){if(!info||typeof info!=='object')return info;const s=build();const merged=new Map();for(const c of [...(Array.isArray(info.choices)?info.choices:[]),...s.choices])if(c?.id)merged.set(c.id,c);info.choices=[...merged.values()];info.adaptiveResolverV2={source:'browser-observed+cookie-free-client',...s.stats};if(s.choices.length){info.unavailableReason=null;const max=Math.max(0,...info.choices.map(c=>Number(c.height)||0));if(Array.isArray(info.qualityAvailability))info.qualityAvailability=info.qualityAvailability.map(r=>{const m=info.choices.filter(c=>Number(c.height)===Number(r.height));return m.length?{...r,resolvedStream:true,downloadable:true,choiceIds:[...new Set([...(r.choiceIds||[]),...m.map(c=>c.id)])],reason:null}:r});if(info.qualityCoverage){info.qualityCoverage.resolvedMaxHeight=Math.max(Number(info.qualityCoverage.resolvedMaxHeight)||0,max);}}
    if (!s.choices.length) {
      const d = `Adaptive觀測：request ${s.stats.captured} · 可重用 ${s.stats.usableObserved} · MP4影像 ${s.stats.mp4Video} · AAC音訊 ${s.stats.aacAudio} · WebM影像 ${s.stats.webmVideo} · Opus音訊 ${s.stats.opusAudio} · client-direct ${s.stats.clientDirect} · SABR ${s.stats.sabr} · signed-partial ${s.stats.signedPartial}`;
      info.unavailableReason = `${info.unavailableReason || '目前尚未取得可組合的媒體 URL。'} ${d}`;
    } else {
      info.resolutionNotice = `${info.resolutionNotice ? `${info.resolutionNotice} ` : ''}Adaptive Resolver 已加入 ${s.stats.addedChoices} 個可下載選項。`;
    }
    return info;}
  async function fetchClient(key,name,version,number,extra={}){const api=ytcfg('INNERTUBE_API_KEY');if(!api)return null;const base=structuredClone(ytcfg('INNERTUBE_CONTEXT')||{}),bc=base.client||{},visitor=bc.visitorData||ytcfg('VISITOR_DATA')||null;const client={hl:bc.hl||'en',gl:bc.gl||'US',clientName:name,clientVersion:version,platform:extra.platform||'DESKTOP',...(extra.clientScreen?{clientScreen:extra.clientScreen}:{})};if(visitor)client.visitorData=visitor;const context={...base,client};delete context.user;const headers={'content-type':'application/json','x-youtube-client-name':String(number),'x-youtube-client-version':version};if(visitor)headers['x-goog-visitor-id']=visitor;const response=await fetch(`/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(api)}`,{method:'POST',credentials:'omit',cache:'no-store',headers,body:JSON.stringify({context,videoId:currentVideoId(),contentCheckOk:true,racyCheckOk:true})});if(!response.ok)return null;const json=await response.json();json.__ytssClient=key;return json;}
  function prefetch(){resetIfChanged();if(prefetchPromise)return prefetchPromise;prefetchPromise=Promise.allSettled([fetchClient('web-embedded-omit','WEB_EMBEDDED_PLAYER','2.20260722.01.00',56,{clientScreen:'EMBED'}),fetchClient('tv-omit','TVHTML5','7.20260707.07.00',7,{platform:'TV'})]).then(rows=>{for(const r of rows)if(r.status==='fulfilled'&&r.value)clientResponses.push(r.value);return clientResponses;}).catch(()=>clientResponses);return prefetchPromise;}
  document.addEventListener(CAPTURE_EVENT,()=>{const raw=document.documentElement.getAttribute(CAPTURE_ATTR);if(raw)try{remember(JSON.parse(raw))}catch{}},true);
  document.addEventListener(RESET,()=>{captures.length=0;clientResponses.length=0;prefetchPromise=null;videoSnapshot=currentVideoId();},true);
  document.addEventListener(INFO_REQUEST,()=>{prefetch();},true);
  document.addEventListener(INFO_READY,()=>{const raw=document.documentElement.getAttribute(INFO_ATTR);if(!raw)return;try{const parsed=JSON.parse(raw);if(parsed?.info&&typeof parsed.info==='object')parsed.info=enrich(parsed.info);else enrich(parsed);document.documentElement.setAttribute(INFO_ATTR,JSON.stringify(parsed));}catch{}},true);
  videoSnapshot=currentVideoId();setTimeout(prefetch,500);
})();
