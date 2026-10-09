/* Observations keep the original reading language and connect evidence to companies. */
(function(){
  'use strict';
  const H=window.RadarHistory,esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const link=(route,query={})=>'#'+route+(Object.keys(query).length?'?'+new URLSearchParams(query):'');
  const labels={tracking:'持续观察',resolved:'阶段结论',archived:'已归档'};
  const roles=[['local_potential','杭州潜力','优先发现新的成长'],['local_benchmark','杭州标杆','观察成熟企业的新变化'],['unresolved','归属待确认','保留解读，等待地域与阶段核实'],['external_reference','外部对标','国内外企业提供比较参照']];
  let pending=null,data=null,version='',visible=20,updateTimer,updatePending=null,nextManifest=null,lastCheck=Date.now();
  const params=()=>Router.getQueryParams(),nameKey=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  function reviewedTime(value){
    if(!value||!Number.isFinite(new Date(value).getTime()))return '';
    return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  }
  function agentStatus(value){
    const when=reviewedTime(value.research?.reviewed_at);
    return when?'<p class="radar-agent-observer"><span>自主研判</span><time datetime="'+esc(value.research.reviewed_at)+'">'+esc(when)+'</time></p>':'';
  }
  function loading(){
    return '<section class="radar-observation-loading" role="status"><span class="radar-ai-orbit" aria-hidden="true"><i></i><i></i><i></i></span><strong>读取观察与研判记录</strong><p>正在同步已完成的研究</p></section>';
  }
  function unseen(topic){
    try{return topic.revision>1&&Number(sessionStorage.getItem('radar-topic-seen-'+topic.topic_id)||0)<topic.revision;}catch{return false;}
  }
  const updateNotice=()=>'<div class="radar-research-update" data-research-update role="status" '+(nextManifest?'':'hidden')+'><span>观察已更新</span><button type="button" data-observation-refresh>查看新内容 →</button></div>';
  function showUpdate(){const notice=document.querySelector?.('[data-research-update]');if(notice)notice.hidden=!nextManifest;}
  function checkForUpdate(){
    if(updatePending)return updatePending;
    lastCheck=Date.now();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    updatePending=fetch('./data/manifest.json?research='+lastCheck,{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(m=>{
      const entry=m?.observations;
      if(entry?.path==='data/observations.json'&&/^[a-f0-9]{64}$/.test(entry.version||'')&&entry.version!==window.RadarData.manifest?.observations?.version){nextManifest=m;showUpdate();return true;}
      return false;
    }).catch(()=>false).finally(()=>{clearTimeout(timeout);updatePending=null;});
    return updatePending;
  }
  function watchUpdates(immediate=false){
    clearTimeout(updateTimer);
    if(document.visibilityState!=='visible'||!['/observations','/topic'].includes(Router.getRoute()))return;
    if(immediate&&Date.now()-lastCheck>=60000)checkForUpdate();
    updateTimer=setTimeout(()=>{checkForUpdate().finally(()=>watchUpdates());},60000);
  }
  function read(){
    const entry=window.RadarData.manifest?.observations;
    if(!entry)return Promise.resolve({companies:[],topics:[]});
    if(entry.path!=='data/observations.json'||!/^[a-f0-9]{64}$/.test(entry.version||''))return Promise.reject(Error('观察内容版本不正确'));
    if(version!==entry.version){version=entry.version;pending=null;data=null;}
    if(!pending)pending=fetch('./'+entry.path+'?v='+version).then(r=>{if(!r.ok)throw Error('观察内容暂时无法读取');return r.json();}).then(value=>{
      if(value.schema!=='radar-observations-v1'||!Array.isArray(value.companies)||!Array.isArray(value.topics))throw Error('观察内容暂时无法读取');
      data=value;watchUpdates();return data;
    }).catch(error=>{pending=null;throw error;});
    return pending;
  }
  function companyHref(name,back=location.hash.slice(1),reading=window.RadarInterpretation.hasReading(name)){
    return link('/company',{name:H.canonical(name),...(reading?{reading:'1'}:{}),back});
  }
  const hasReading=company=>company.has_reading!==false&&window.RadarInterpretation.hasReading(company.company);
  const publishedCompany=company=>hasReading(company)||(company.has_reading===false&&company.role==='local_potential'&&typeof company.progress==='string'&&company.progress.trim());
  const shortDate=value=>String(value||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,(_,year,month,day)=>(year===String(new Date().getFullYear())?'':year+'/')+Number(month)+'/'+Number(day));
  const dateMarkup=value=>'<time datetime="'+esc(value)+'" title="'+esc(value)+'">'+esc(shortDate(value))+'</time>';
  function progressText(company,field){
    const text=String(company[field]||'');
    const names=[company.company,company.display_name].filter(Boolean).sort((a,b)=>b.length-a.length);
    for(const name of names){
      if(text.startsWith(name)&&/^[\s\u3400-\u9fff，,：:]/.test(text.slice(name.length))){
        return text.slice(name.length).replace(/^[\s，,：:]+/,'').replace(/^的/,'');
      }
    }
    return text;
  }
  function companyCard(company){
    return '<a class="radar-observation-card radar-company-observation" data-role="'+esc(company.role||'unresolved')+'" aria-label="阅读'+esc(company.company)+'的企业解读" href="'+esc(companyHref(company.company,location.hash.slice(1),true))+'"><div class="radar-observation-card-title"><h3 title="'+esc(company.company)+'">'+esc(company.display_name||company.company)+'</h3><p class="radar-observation-sector"><span class="radar-observation-field">'+esc(company.sector_label||company.sector||company.location||'企业进展')+'</span>'+(company.is_new_discovery?'<span class="radar-new-discovery">近期发现</span>':'')+'</p></div><p class="radar-observation-thesis">'+esc(progressText(company,'thesis'))+'</p><div class="radar-observation-footer"><span>材料 '+dateMarkup(company.as_of)+(company.updating?' · 待更新':'')+'</span><span class="radar-observation-action">完整解读 →</span></div></a>';
  }
  function leadCard(company){
    return '<a class="radar-observation-lead" aria-label="查看'+esc(company.company)+'的已收录进展" href="'+esc(companyHref(company.company,location.hash.slice(1),false))+'"><div class="radar-observation-lead-heading"><h4 title="'+esc(company.company)+'">'+esc(company.display_name||company.company)+'</h4><span class="radar-observation-field">'+esc(company.sector_label||company.sector||'企业进展')+'</span></div><p>'+esc(progressText(company,'progress'))+'</p><div class="radar-observation-lead-footer"><span>收录 '+dateMarkup(company.as_of)+'</span><span class="radar-observation-action">查看进展 →</span></div></a>';
  }
  function expanded(key){try{return sessionStorage.getItem('radar-observation-open-'+key)==='1';}catch{return false;}}
  function readingStack(items,role,query){
    const limit=query?items.length:(role==='local_potential'?2:3);
    return items.slice(0,limit).map(companyCard).join('')+(items.length>limit?'<details class="radar-observation-more" data-observation-expand="'+role+'-reading" '+(expanded(role+'-reading')?'open':'')+'><summary>展开其余 '+(items.length-limit)+' 家解读</summary>'+items.slice(limit).map(companyCard).join('')+'</details>':'');
  }
  function leadList(items,query){
    if(!items.length)return '';
    const limit=query?items.length:5,key='local_potential-lead';
    return '<section class="radar-observation-leads"><h4>进展线索 <small>尚未解读 · '+items.length+'</small></h4>'+items.slice(0,limit).map(leadCard).join('')+(items.length>limit?'<details class="radar-observation-more" data-observation-expand="'+key+'" '+(expanded(key)?'open':'')+'><summary>展开其余 '+(items.length-limit)+' 家线索</summary>'+items.slice(limit).map(leadCard).join('')+'</details>':'')+'</section>';
  }
  function topicCard(topic){
    return '<a class="radar-observation-card radar-topic-card'+(unseen(topic)?' radar-new-research':'')+'" href="'+esc(link('/topic',{id:topic.topic_id,back:location.hash.slice(1)}))+'"><p class="radar-observation-sector">'+esc(topic.sector)+'<span class="radar-topic-state">'+esc(labels[topic.status]||'持续观察')+'</span></p><h3>'+esc(topic.question)+'</h3><p class="radar-observation-thesis">'+esc(topic.thesis.text)+'</p><div class="radar-observation-footer"><span>'+topic.companies.length+' 家企业 · 第 '+Number(topic.revision||1)+' 次研判</span><span class="radar-observation-action">查看观察 →</span></div></a>';
  }
  function matches(item,query,isTopic=false){
    const terms=nameKey(query).split(/\s+/).filter(Boolean);
    const names=isTopic?item.companies.flatMap(name=>[name,...((window.RadarData.manifest?.reading_entities||[]).find(e=>e.name===H.canonical(name))?.aliases||[])]):item.aliases||[];
    const value=nameKey([isTopic?item.question:item.company,item.display_name,item.sector,isTopic?item.thesis.text:(item.thesis||item.progress),...names].join(' '));
    return terms.every(term=>value.includes(term));
  }
  function listing(value,p){
    const topics=p.view==='topics',query=p.q||'',items=(topics?value.topics.filter(t=>t.status!=='archived'):value.companies.filter(publishedCompany)).filter(item=>matches(item,query,topics));
    const shown=items.slice(0,visible);
    const cards=topics?shown.map(topicCard).join(''):roles.map(([role,label,caption])=>{
      const group=items.filter(c=>(c.role||'unresolved')===role),readings=group.filter(hasReading),leads=group.filter(c=>!hasReading(c));
      return group.length?'<section class="radar-observation-group" data-group="'+role+'"><div class="radar-observation-group-heading"><h3>'+label+' <small>'+group.length+'</small></h3>'+(role==='local_potential'&&readings.length?'<h4 class="radar-observation-subheading">已有解读 <small>'+readings.length+'</small></h4>':'')+'</div>'+(readings.length?'<div class="radar-observation-readings">'+readingStack(readings,role,query)+'</div>':'')+leadList(leads,query)+'</section>':'';
    }).join('');
    return '<div id="radar-observation-results">'+(cards||'<p class="radar-empty">'+(query?'没有符合关键词的'+(topics?'专题。':'企业。'):topics?'暂未形成专题判断。':'暂未形成企业观察。')+'</p>')+'</div><div class="radar-observation-list-footer"><span role="status">'+items.length+' '+(topics?'个专题':'家企业 · '+items.filter(hasReading).length+' 家已有解读')+'</span>'+(topics&&items.length>visible?'<button class="radar-more" type="button" data-observation-more>再显示20个</button>':'')+'<a href="#/weekly?back=%2Fobservations">收录分布 →</a></div>';
  }
  function hub(value,p){
    value={...value,companies:value.companies.filter(publishedCompany)};
    const topics=p.view==='topics',count=value.topics.filter(t=>t.status!=='archived').length;
    return '<section class="radar-observation-view animate-fade-in"><div class="radar-page-heading"><h2>观察</h2></div>'+updateNotice()+'<div class="radar-observation-controls">'+agentStatus(value)+'<form id="radar-observation-search" class="radar-filter" role="search" aria-label="搜索观察"><label class="radar-sr-only" for="radar-observation-input">'+(topics?'搜索专题、企业或领域':'搜索企业、英文名或领域')+'</label><div class="radar-search-bar"><input type="search" id="radar-observation-input" value="'+esc(p.q||'')+'" placeholder="'+(topics?'搜索专题、企业或领域':'搜索企业、领域')+'"><button type="submit">搜索</button></div></form></div><nav class="radar-observation-tabs" aria-label="观察内容"><a href="#/observations" '+(!topics?'aria-current="page"':'')+'>企业 <small>'+value.companies.length+'</small></a><a href="#/observations?view=topics" '+(topics?'aria-current="page"':'')+'>专题 <small>'+count+'</small></a></nav>'+listing(value,p)+'</section>';
  }
  function related(name){
    const topics=window.RadarData.manifest?.company_observations?.[H.canonical(name)]||[];
    return topics.length?'<div class="radar-related-observations"><span>相关观察</span>'+topics.map(t=>'<a href="'+esc(link('/topic',{id:t.id,back:location.hash.slice(1)}))+'">'+esc(t.question)+' →</a>').join('')+'</div>':'';
  }
  function researchBody(item,refs){
    const research=item.research;if(!research)return '';
    const dateLabels={event:'发生',published:'报道',collected:'收录'};
    const timeline=research.timeline?.length?'<section class="radar-research-section"><h3>进展脉络</h3><ol class="radar-research-timeline">'+research.timeline.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(node=>'<li><div class="radar-research-time"><time datetime="'+esc(node.date)+'">'+esc(node.date)+'</time><span>'+esc(dateLabels[node.date_basis]||'收录')+'</span></div><h4>'+esc(node.company)+'</h4><p>'+esc(node.text)+refs(node)+'</p></li>').join('')+'</ol></section>':'';
    const comparison=research.comparison;
    const table=comparison?'<section class="radar-research-section"><h3>企业比较</h3><div class="radar-research-comparison">'+comparison.rows.map(row=>'<article><h4><a href="'+esc(companyHref(row.company))+'">'+esc(row.company)+' →</a></h4><dl>'+row.cells.map((cell,i)=>'<div><dt>'+esc(comparison.columns[i])+'</dt><dd>'+esc(cell.text)+refs(cell)+'</dd></div>').join('')+'</dl></article>').join('')+'</div></section>':'';
    return timeline+table+(research.sections||[]).map(section=>'<section class="radar-research-section"><h3>'+esc(section.heading)+'</h3>'+section.paragraphs.map(paragraph=>'<p>'+esc(paragraph.text)+refs(paragraph)+'</p>').join('')+'</section>').join('');
  }
  function researchHistory(item){
    if(!item.research_history?.length)return '';
    return '<details class="radar-research-history"><summary>研判记录 · 第 '+Number(item.revision)+' 次</summary><ol>'+item.research_history.slice().reverse().map(entry=>'<li><span>第 '+Number(entry.revision)+' 次 · '+esc(reviewedTime(entry.updated_at))+'</span><p>'+esc(entry.thesis.text)+'</p><small>'+esc(entry.changed_reason)+'</small></li>').join('')+'</ol></details>';
  }
  function topic(value,p){
    const item=value.topics.find(t=>t.topic_id===p.id);
    if(!item)throw Error('该专题暂未发布，或正在重新核查依据');
    const byID=new Map(item.sources.map((s,i)=>[s.id,{...s,number:i+1}]));
    const refs=b=>'<span class="radar-ai-refs">'+(b.evidence_ids||[]).map(id=>byID.get(id)).filter(s=>s&&H.safeURL(s.link)).map(s=>'<a class="radar-ai-citation" href="'+esc(H.safeURL(s.link))+'" target="_blank" rel="noopener noreferrer" aria-label="依据'+s.number+'：'+esc(s.article_title||s.event_headline)+'">['+s.number+']</a>').join('')+'</span>';
    const back=/^\/(?:observations|company)(?:\?|$)/.test(p.back||'')?p.back:'/observations?view=topics';
    const note=item.note?.text?'<p class="radar-ai-note">'+esc(item.note.text)+refs(item.note)+'</p>':'';
    const fresh=unseen(item);try{sessionStorage.setItem('radar-topic-seen-'+item.topic_id,String(item.revision));}catch{}
    return '<section class="radar-topic-view animate-fade-in"><div class="radar-page-heading"><h2>专题观察</h2><a class="radar-text-link radar-back-button" href="#'+esc(back)+'">← 返回</a></div>'+updateNotice()+'<article class="radar-topic-reading" data-research-revision="'+Number(item.revision||1)+'"><p class="radar-observation-sector">'+esc(item.sector)+'<span class="radar-topic-state">'+esc(labels[item.status]||'持续观察')+'</span></p><h2>'+esc(item.question)+'</h2><p class="radar-topic-meta">材料截至 '+esc(item.as_of)+'</p><div class="radar-topic-verdict"><span>当前判断</span><h3 class="radar-ai-verdict">'+esc(item.thesis.text)+refs(item.thesis)+'</h3></div><div class="radar-topic-agent-record"><span>自主研判</span><time>'+esc(reviewedTime(item.reviewed_at||item.updated_at))+'</time><span>第 '+Number(item.revision||1)+' 次</span></div>'+(item.revision>1?'<p class="radar-topic-change'+(fresh?' radar-new-research':'')+'"><strong>本次变化</strong>'+esc(item.changed_reason)+'</p>':'')+'<ul class="radar-ai-points radar-topic-points">'+item.points.map(point=>'<li><p><strong class="radar-ai-point-label">'+esc(point.label)+'</strong>'+esc(point.text)+refs(point)+'</p></li>').join('')+'</ul>'+researchBody(item,refs)+'<section class="radar-research-section"><h3>这意味着什么</h3><p>'+esc(item.assessment.text)+refs(item.assessment)+'</p></section><section class="radar-ai-paragraph radar-ai-watch radar-topic-watch"><h4>下一步看什么</h4><p class="radar-ai-lead"><strong>'+esc(item.watch.lead)+'</strong></p><p>'+esc(item.watch.text)+refs(item.watch)+'</p></section><section class="radar-topic-companies"><h4>涉及企业</h4>'+item.companies.map(name=>'<a href="'+esc(companyHref(name))+'">'+esc(name)+'<span>'+(window.RadarInterpretation.hasReading(name)?'企业解读':'完整历史')+' →</span></a>').join('')+'</section>'+researchHistory(item)+'<details class="radar-ai-sources"><summary>观察依据 · '+item.sources.length+' 条</summary>'+note+'<ol>'+item.sources.map(s=>'<li>'+(H.safeURL(s.link)?'<a href="'+esc(H.safeURL(s.link))+'" target="_blank" rel="noopener noreferrer">'+esc(s.article_title||s.event_headline||'一手材料')+'</a>':esc(s.article_title||s.event_headline))+'<small>'+esc(s.source||'原始来源')+' · '+esc(s.collected_date)+'</small></li>').join('')+'</ol></details></article></section>';
  }
  function sharePayload(){
    if(Router.getRoute()==='/observations'){
      const topics=params().view==='topics';
      return {title:(topics?'专题观察':'企业观察')+'｜寻龙雷达',text:topics?'从企业进展看产业变化':'杭州潜力企业、标杆与外部对标',url:location.href.split('#')[0]+link('/observations',topics?{view:'topics'}:{})};
    }
    if(Router.getRoute()!=='/topic'||!data)return null;
    const item=data.topics.find(t=>t.topic_id===params().id);if(!item)return null;
    return {title:item.question+'｜寻龙雷达',text:item.thesis.text+'\n材料截至 '+item.as_of,url:location.href.split('#')[0]+link('/topic',{id:item.topic_id})};
  }
  document.addEventListener('submit',event=>{if(event.target.id==='radar-observation-search'){event.preventDefault();const query=document.getElementById('radar-observation-input').value.trim();Router.navigate(link('/observations',{...(params().view==='topics'?{view:'topics'}:{}),...(query?{q:query}:{})}).slice(1));}});
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-observation-refresh]')&&nextManifest){location.reload();return;}
    if(event.target.closest('[data-observation-more]')&&data){visible+=20;const box=document.querySelector('.radar-observation-view');const previous=document.getElementById('radar-observation-results');const footer=document.querySelector('.radar-observation-list-footer');if(box&&previous&&footer){previous.insertAdjacentHTML('beforebegin',listing(data,params()));previous.remove();footer.remove();}}
  });
  document.addEventListener('visibilitychange',()=>watchUpdates(true));
  document.addEventListener('toggle',event=>{const key=event.target.getAttribute?.('data-observation-expand');if(key){try{sessionStorage.setItem('radar-observation-open-'+key,event.target.open?'1':'0');}catch{}}},true);
  window.addEventListener('hashchange',()=>{visible=20;watchUpdates(true);showUpdate();});
  window.RadarObservations={read,hub,topic,related,companyHref,sharePayload,companyCard,leadCard,topicCard,matches,loading,agentStatus,checkForUpdate};
})();
