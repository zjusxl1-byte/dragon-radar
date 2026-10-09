/* Company reading: immediate cached text, then a material-version check. */
(function () {
  'use strict';
  const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cached=new Map(),inflight=new Map();
  let sequence=0;
  const manifest=()=>window.RadarData.manifest;
  const metadata=name=>manifest().company_interpretations?.[name];
  function control(name){return metadata(name)?'<button class="radar-ai-button" type="button" data-ai-reading="'+esc(name)+'" aria-expanded="false" aria-controls="radar-ai-panel">AI 解读 <span aria-hidden="true">⌄</span></button>':'';}
  function panel(name){return metadata(name)?'<section class="radar-ai-panel" id="radar-ai-panel" aria-label="企业 AI 解读" hidden><div class="radar-ai-working" id="radar-ai-working" aria-hidden="true" hidden><span class="radar-ai-orbit"><i></i><i></i><i></i></span><div class="radar-ai-skeleton"><span></span><span></span><span></span></div></div><div class="radar-ai-content" id="radar-ai-content" tabindex="-1"></div><p class="radar-ai-status" id="radar-ai-status" role="status" aria-live="polite"></p></section>':'';}
  function markup(reading,expanded=false){
    if(!reading||!Array.isArray(reading.sources))throw Error('解读暂时无法读取');
    const byID=new Map(reading.sources.map((source,i)=>[source.id,{...source,number:i+1}]));
    const refs=block=>(block.evidence_ids||[]).map(id=>byID.get(id)).filter(Boolean).map(source=>{
      const link=window.RadarHistory.safeURL(source.link);
      return link?'<a class="radar-ai-citation" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer" aria-label="依据'+source.number+'：'+esc(source.article_title||source.event_headline)+'">['+source.number+']</a>':'';
    }).join('');
    const evidence=block=>{const links=refs(block);return links?'<span class="radar-ai-refs">'+links+'</span>':'';};
    const block=(key,label)=>{
      const part=reading[key]||{},points=key==='progress'&&Array.isArray(part.points)?part.points:null;
      const body=points?'<ul class="radar-ai-points">'+points.map(point=>'<li><p><strong class="radar-ai-point-label">'+esc(point.label)+'</strong>'+esc(point.text)+evidence(point)+'</p></li>').join('')+'</ul>':
        (part.lead?'<p class="radar-ai-lead"><strong>'+esc(part.lead)+'</strong></p>':'')+'<p>'+esc(part.text||'')+evidence(part)+'</p>';
      return '<section class="radar-ai-paragraph'+(key==='watch'?' radar-ai-watch':'')+'"><h4>'+label+'</h4>'+body+'</section>';
    };
    return '<h3 class="radar-ai-verdict">'+esc(reading.verdict?.text||'')+evidence(reading.verdict||{})+'</h3><details class="radar-ai-detail" data-ai-details'+(expanded?' open':'')+'><summary><span class="radar-ai-detail-open">展开完整解读</span><span class="radar-ai-detail-close">收起完整解读</span><span class="radar-ai-as-of">材料截至 '+esc(reading.as_of)+'</span></summary><div class="radar-ai-analysis">'+block('progress','关键进展')+block('assessment','解读')+block('watch','下一步看什么')+
      '<details class="radar-ai-sources"><summary>解读依据 · '+reading.sources.length+' 条</summary>'+(reading.note?.text?'<p class="radar-ai-note">'+esc(reading.note.text)+evidence(reading.note)+'</p>':'')+'<ol>'+reading.sources.map(source=>{
        const link=window.RadarHistory.safeURL(source.link),text=esc(source.article_title||source.event_headline||'已收录报道');
        return '<li>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+text+'</a>':text)+'<small>'+esc(source.source||'原始来源')+' · 收录 '+esc(source.collected_date)+'</small></li>';
      }).join('')+'</ol></details><div class="radar-ai-detail-footer"><button type="button" data-ai-detail-close>收起完整解读 ↑</button></div></div></details>';
  }
  function reuse(key,load){
    if(inflight.has(key))return inflight.get(key);
    const request=Promise.resolve().then(load).finally(()=>inflight.delete(key));inflight.set(key,request);return request;
  }
  async function request(url,options){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch(url,{...options,signal:controller.signal});return {ok:response.ok,status:response.status,data:await response.json()};}
    catch(error){if(error.name==='AbortError')throw Error('网络响应较慢，请稍后重试');throw Error(error.name==='SyntaxError'?'解读数据暂时无法读取':'网络暂时无法连接');}
    finally{clearTimeout(timer);}
  }
  async function staticReading(name,entry){
    const previous=cached.get(name);
    if(previous&&(previous.source_version===entry.source_version||previous.source_version===entry.cached_source_version))return previous;
    if(!entry.path||!/^data\/interpretations\/[a-f0-9]{20}\.json$/.test(entry.path)||!/^[a-f0-9]{64}$/.test(entry.version||''))return null;
    return reuse('static:'+entry.version,()=>request('./'+entry.path+'?v='+entry.version).then(response=>{if(!response.ok)throw Error('缓存解读暂时无法读取');return response.data;}).then(reading=>{
      if(reading.company!==name)throw Error('解读主体不匹配');
      if(reading.source_version!==entry.source_version&&reading.source_version!==entry.cached_source_version)throw Error('材料版本已更新');
      cached.set(name,reading);return reading;
    }));
  }
  function apiConfig(){
    const api=manifest().interpretation_api;
    if(!api||!/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/radar-reading$/.test(api.url||''))return null;
    return api;
  }
  function check(name,version){
    const api=apiConfig();if(!api)return Promise.reject(Error('更新服务暂时未连接'));
    return reuse('check:'+name+':'+version,()=>request(api.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+api.app_key},body:JSON.stringify({company:name,source_version:version})}).then(response=>{
      const data=response.data;
      if(data.reading&&data.reading.company!==name)throw Error('解读主体不匹配');
      if(response.status===409&&data.status==='version_changed'&&/^[a-f0-9]{64}$/.test(data.source_version||''))return data;
      if(!response.ok)throw Error('解读更新服务暂时不可用');return data;
    }));
  }
  function current(name,run){return sequence===run&&document.getElementById('radar-ai-panel')&&!document.getElementById('radar-ai-panel').hidden&&document.querySelector('[data-ai-reading]')?.dataset.aiReading===name;}
  function status(text,phase='idle'){
    const field=document.getElementById('radar-ai-status'),box=document.getElementById('radar-ai-panel'),content=document.getElementById('radar-ai-content'),working=document.getElementById('radar-ai-working');
    if(field){field.textContent=text;field.setAttribute?.('data-complete',String(text==='已包含当前收录信息'));}
    if(box){box.dataset.phase=phase;box.setAttribute('aria-busy',String(phase!=='idle'));}
    if(working)working.hidden=phase==='idle'||!!content?.innerHTML;
  }
  function paint(reading){const content=document.getElementById('radar-ai-content'),expanded=!!content.querySelector?.('[data-ai-details]')?.open;content.innerHTML=markup(reading,expanded);}
  async function open(name){
    const entry=metadata(name),box=document.getElementById('radar-ai-panel');if(!entry||!box)return;
    const run=++sequence,button=document.querySelector('[data-ai-reading]');box.hidden=false;button?.setAttribute('aria-expanded','true');document.getElementById('radar-ai-content').textContent='';status('正在读取解读…','reading');
    let shown=false,version=entry.source_version;
    try{const reading=await staticReading(name,entry);if(!current(name,run))return;if(reading){paint(reading);shown=true;status(reading.source_version===version?'正在检查是否有新信息…':'已收录新信息，正在更新解读…','checking');}}
    catch{if(!current(name,run))return;}
    if(current(name,run))document.getElementById('radar-ai-content').focus({preventScroll:true});
    try{
      for(let poll=0;poll<90&&current(name,run);poll++){
        if(poll)await new Promise(resolve=>setTimeout(resolve,4000));if(!current(name,run))return;
        const data=await check(name,version);if(!current(name,run))return;
        if(data.status==='version_changed'){
          const revision=data.metadata;
          if(!revision||!Number.isSafeInteger(revision.source_epoch)||revision.source_epoch<(entry.source_epoch||0)||revision.reading_model!==entry.reading_model||revision.prompt_version!==entry.prompt_version){
            status((shown?'已显示有效缓存；':'')+'最新材料正在同步，稍后可重新查看。');return;
          }
          version=data.source_version;
          Object.assign(entry,revision);
          entry.source_version=version;
          if(data.reading){entry.cached_source_version=data.reading.source_version;cached.set(name,data.reading);paint(data.reading);shown=true;}
          else {for(const key of ['path','version','cached_source_version','cached_as_of'])delete entry[key];cached.delete(name);document.getElementById('radar-ai-content').textContent='';shown=false;}
          status('已收录新信息，正在更新解读…','queued');continue;
        }
        if(data.status==='disqualified'){delete manifest().company_interpretations[name];cached.delete(name);document.getElementById('radar-ai-content').textContent='当前材料尚不足以形成有依据的企业解读。';status('');button.hidden=true;return;}
        if(data.reading){cached.set(name,data.reading);paint(data.reading);shown=true;}
        if(data.status==='ready'){status('已包含当前收录信息');return;}
        if(data.status==='failed'){status((shown?'已显示上次解读；':'')+'本次更新暂未完成，后续采集时会再次尝试。');return;}
        status(shown?'有新信息，正在更新解读；下方为上次版本。':data.status==='running'?'正在按时间梳理材料并生成解读…':'已提交解读请求，正在等待生成…',data.status==='running'?'generating':'queued');
      }
      if(current(name,run))status('解读仍在生成，可稍后重新打开。');
    }catch(error){if(current(name,run))status((shown?'已显示缓存解读；':'')+(error.message||'暂时无法更新')+'，可重新打开重试。');}
  }
  function close(){sequence++;status('');const box=document.getElementById('radar-ai-panel');if(box)box.hidden=true;const button=document.querySelector('[data-ai-reading]');button?.setAttribute('aria-expanded','false');button?.focus({preventScroll:true});}
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-ai-reading]');if(button){button.getAttribute('aria-expanded')==='true'?close():open(button.dataset.aiReading);}if(event.target.closest('[data-ai-close]'))close();
    const collapse=event.target.closest('[data-ai-detail-close]');if(collapse){const details=collapse.closest('[data-ai-details]');if(!details)return;details.open=false;const summary=details.querySelector('summary');if(summary.getBoundingClientRect().top<56)(details.closest?.('.radar-ai-content')||summary).scrollIntoView({block:'start',behavior:'auto'});summary.focus({preventScroll:true});}
  });
  window.addEventListener('hashchange',()=>{sequence++;});
  window.RadarInterpretation={control,panel,markup,check,staticReading,open,close};
})();
