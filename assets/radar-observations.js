/* Observations keep the original reading language and connect evidence to companies. */
(function(){
  'use strict';
  const H=window.RadarHistory,esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const link=(route,query={})=>'#'+route+(Object.keys(query).length?'?'+new URLSearchParams(query):'');
  const labels={tracking:'持续观察',resolved:'阶段结论',archived:'已归档'};
  let pending=null,data=null,version='',visible=20;
  const params=()=>Router.getQueryParams(),nameKey=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  function read(){
    const entry=window.RadarData.manifest?.observations;
    if(!entry)return Promise.resolve({companies:[],topics:[]});
    if(entry.path!=='data/observations.json'||!/^[a-f0-9]{64}$/.test(entry.version||''))return Promise.reject(Error('观察内容版本不正确'));
    if(version!==entry.version){version=entry.version;pending=null;data=null;}
    if(!pending)pending=fetch('./'+entry.path+'?v='+version).then(r=>{if(!r.ok)throw Error('观察内容暂时无法读取');return r.json();}).then(value=>{
      if(value.schema!=='radar-observations-v1'||!Array.isArray(value.companies)||!Array.isArray(value.topics))throw Error('观察内容暂时无法读取');
      data=value;return data;
    }).catch(error=>{pending=null;throw error;});
    return pending;
  }
  function companyHref(name,back=location.hash.slice(1)){
    return link('/company',{name:H.canonical(name),reading:'1',back});
  }
  function companyCard(company){
    return '<a class="radar-observation-card radar-company-observation" href="'+esc(companyHref(company.company))+'"><h3>'+esc(company.company)+'</h3><p class="radar-observation-sector">'+esc(company.sector||company.location||'企业进展')+'</p><p class="radar-observation-thesis">'+esc(company.thesis)+'</p><div class="radar-observation-footer"><span>材料截至 '+esc(company.as_of)+(company.updating?' · 更新中':'')+'</span><span class="radar-observation-action">完整解读 →</span></div></a>';
  }
  function topicCard(topic){
    return '<a class="radar-observation-card" href="'+esc(link('/topic',{id:topic.topic_id,back:location.hash.slice(1)}))+'"><p class="radar-observation-sector">'+esc(topic.sector)+'<span>'+esc(labels[topic.status]||'持续观察')+'</span></p><h3>'+esc(topic.question)+'</h3><p class="radar-observation-thesis">'+esc(topic.thesis.text)+'</p><div class="radar-observation-footer"><span>'+topic.companies.length+' 家企业 · '+esc(topic.as_of)+'</span><span class="radar-observation-action">查看观察 →</span></div></a>';
  }
  function matches(item,query,isTopic=false){
    const terms=nameKey(query).split(/\s+/).filter(Boolean);
    const names=isTopic?item.companies.flatMap(name=>[name,...((window.RadarData.manifest?.reading_entities||[]).find(e=>e.name===H.canonical(name))?.aliases||[])]):item.aliases||[];
    const value=nameKey([isTopic?item.question:item.company,item.sector,isTopic?item.thesis.text:item.thesis,...names].join(' '));
    return terms.every(term=>value.includes(term));
  }
  function listing(value,p){
    const topics=p.view==='topics',query=p.q||'',items=(topics?value.topics.filter(t=>t.status!=='archived'):value.companies.filter(c=>window.RadarInterpretation.hasReading(c.company))).filter(item=>matches(item,query,topics));
    const cards=items.slice(0,visible).map(topics?topicCard:companyCard).join('');
    return '<div id="radar-observation-results">'+(cards||'<p class="radar-empty">'+(query?'没有符合关键词的'+(topics?'专题。':'企业解读。'):topics?'暂未形成专题判断。':'暂未形成企业解读。')+'</p>')+'</div><div class="radar-observation-list-footer"><span role="status">'+items.length+' '+(topics?'个专题':'家企业')+'</span>'+(items.length>visible?'<button class="radar-more" type="button" data-observation-more>再显示20'+(topics?'个':'家')+'</button>':'')+'</div>';
  }
  function hub(value,p){
    value={...value,companies:value.companies.filter(c=>window.RadarInterpretation.hasReading(c.company))};
    const topics=p.view==='topics',count=value.topics.filter(t=>t.status!=='archived').length;
    return '<section class="radar-observation-view"><div class="radar-page-heading"><h2>🧭 观察</h2><a class="radar-text-link" href="#/weekly?back=%2Fobservations">收录分布 →</a></div><nav class="radar-observation-tabs" aria-label="观察内容"><a href="#/observations" '+(!topics?'aria-current="page"':'')+'>企业解读 <small>'+value.companies.length+'</small></a><a href="#/observations?view=topics" '+(topics?'aria-current="page"':'')+'>专题 <small>'+count+'</small></a></nav><form id="radar-observation-search" class="radar-filter" role="search" aria-label="搜索观察"><label class="radar-sr-only" for="radar-observation-input">'+(topics?'搜索专题、企业或领域':'搜索企业、英文名或领域')+'</label><div class="radar-search-bar"><input type="search" id="radar-observation-input" value="'+esc(p.q||'')+'" placeholder="'+(topics?'搜索专题、企业或领域':'搜索企业、英文名或领域')+'"><button type="submit">搜索</button></div></form><p class="radar-observation-caption">'+(topics?'围绕具体问题，持续追踪变化':'按最新材料排列 · 从发展历程看企业变化')+'</p>'+listing(value,p)+'</section>';
  }
  function related(name){
    const topics=window.RadarData.manifest?.company_observations?.[H.canonical(name)]||[];
    return topics.length?'<div class="radar-related-observations"><span>相关观察</span>'+topics.map(t=>'<a href="'+esc(link('/topic',{id:t.id,back:location.hash.slice(1)}))+'">'+esc(t.question)+' →</a>').join('')+'</div>':'';
  }
  function topic(value,p){
    const item=value.topics.find(t=>t.topic_id===p.id);
    if(!item)throw Error('该专题暂未发布，或正在重新核查依据');
    const byID=new Map(item.sources.map((s,i)=>[s.id,{...s,number:i+1}]));
    const refs=b=>'<span class="radar-ai-refs">'+(b.evidence_ids||[]).map(id=>byID.get(id)).filter(s=>s&&H.safeURL(s.link)).map(s=>'<a class="radar-ai-citation" href="'+esc(H.safeURL(s.link))+'" target="_blank" rel="noopener noreferrer" aria-label="依据'+s.number+'：'+esc(s.article_title||s.event_headline)+'">['+s.number+']</a>').join('')+'</span>';
    const back=/^\/(?:observations|company)(?:\?|$)/.test(p.back||'')?p.back:'/observations?view=topics';
    const note=item.note?.text?'<p class="radar-ai-note">'+esc(item.note.text)+refs(item.note)+'</p>':'';
    return '<section class="radar-topic-view"><div class="radar-page-heading"><h2>🧭 专题观察</h2><a class="radar-text-link radar-back-button" href="#'+esc(back)+'">← 返回</a></div><article class="radar-topic-reading"><p class="radar-observation-sector">'+esc(item.sector)+'<span>'+esc(labels[item.status])+'</span></p><h2>'+esc(item.question)+'</h2><p class="radar-topic-meta">材料截至 '+esc(item.as_of)+'</p><h3 class="radar-ai-verdict">'+esc(item.thesis.text)+refs(item.thesis)+'</h3>'+(item.revision>1?'<p class="radar-topic-change"><strong>本次变化</strong>'+esc(item.changed_reason)+'</p>':'')+'<ul class="radar-ai-points radar-topic-points">'+item.points.map(point=>'<li><p><strong class="radar-ai-point-label">'+esc(point.label)+'</strong>'+esc(point.text)+refs(point)+'</p></li>').join('')+'</ul><section class="radar-ai-paragraph"><h4>这意味着什么</h4><p>'+esc(item.assessment.text)+refs(item.assessment)+'</p></section><section class="radar-ai-paragraph radar-ai-watch"><h4>下一步看什么</h4><p class="radar-ai-lead"><strong>'+esc(item.watch.lead)+'</strong></p><p>'+esc(item.watch.text)+refs(item.watch)+'</p></section><section class="radar-topic-companies"><h4>涉及企业</h4>'+item.companies.map(name=>'<a href="'+esc(companyHref(name))+'">'+esc(name)+'<span>'+(window.RadarInterpretation.hasReading(name)?'企业解读':'完整历史')+' →</span></a>').join('')+'</section><details class="radar-ai-sources"><summary>观察依据 · '+item.sources.length+' 条</summary>'+note+'<ol>'+item.sources.map(s=>'<li>'+(H.safeURL(s.link)?'<a href="'+esc(H.safeURL(s.link))+'" target="_blank" rel="noopener noreferrer">'+esc(s.article_title||s.event_headline||'一手材料')+'</a>':esc(s.article_title||s.event_headline))+'<small>'+esc(s.source||'原始来源')+' · '+esc(s.collected_date)+'</small></li>').join('')+'</ol></details></article></section>';
  }
  function sharePayload(){
    if(Router.getRoute()!=='/topic'||!data)return null;
    const item=data.topics.find(t=>t.topic_id===params().id);if(!item)return null;
    return {title:item.question+'｜寻龙雷达',text:item.thesis.text+'\n材料截至 '+item.as_of,url:location.href.split('#')[0]+link('/topic',{id:item.topic_id})};
  }
  document.addEventListener('submit',event=>{if(event.target.id==='radar-observation-search'){event.preventDefault();const query=document.getElementById('radar-observation-input').value.trim();Router.navigate(link('/observations',{...(params().view==='topics'?{view:'topics'}:{}),...(query?{q:query}:{})}).slice(1));}});
  document.addEventListener('click',event=>{if(event.target.closest('[data-observation-more]')&&data){visible+=20;const box=document.querySelector('.radar-observation-view');const previous=document.getElementById('radar-observation-results');const footer=document.querySelector('.radar-observation-list-footer');if(box&&previous&&footer){previous.insertAdjacentHTML('beforebegin',listing(data,params()));previous.remove();footer.remove();}}});
  window.addEventListener('hashchange',()=>{visible=20;});
  window.RadarObservations={read,hub,topic,related,companyHref,sharePayload,companyCard,topicCard,matches};
})();
