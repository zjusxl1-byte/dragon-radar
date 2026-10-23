/* Editorial reading: an article is the primary object, evidence supports it. */
(function(){
  'use strict';
  const O=window.RadarObservations,H=window.RadarHistory;
  const oldHub=O.hub,oldTopic=O.topic,oldShare=O.sharePayload;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const href=(p,q={})=>'#'+p+(Object.keys(q).length?'?'+new URLSearchParams(q):'');
  const roles=[['local_potential','杭州潜力'],['local_benchmark','杭州标杆'],['unresolved','归属待确认'],['external_reference','外部参照']];
  let current=null;
  function articleLink(item,topic){const back=Router.getRoute()==='/observations'?location.hash.slice(1):(topic?'/observations?view=topics':'/observations');return href('/topic',topic?{id:item.topic_id,back}:{company:item.company,back});}
  const shortDate=x=>String(x||'').slice(0,10).replace(/^2026-/,'').replace('-','/');
  const titleOf=(x,topic)=>x.article?.title||(topic?x.question:(x.display_name||x.company));
  const deckOf=(x,topic)=>x.article?.deck.text||(topic?x.thesis.text:x.thesis||x.progress||'');
  function meta(x,topic){return topic?x.sector:(x.display_name||x.company)+' · '+(x.sector_label||x.sector||'企业观察');}
  function card(x,topic,index,featured=false){
    return '<a class="journal-story'+(featured?' journal-feature':'')+'" href="'+esc(articleLink(x,topic))+'" aria-label="阅读'+esc(titleOf(x,topic))+'"><div class="journal-story-kicker"><span>'+esc(meta(x,topic))+'</span><span class="journal-index">'+String(index+1).padStart(2,'0')+'</span></div><h3>'+esc(titleOf(x,topic))+'</h3><p>'+esc(deckOf(x,topic))+'</p><div class="journal-story-foot"><span>'+esc(shortDate(x.article?.published_at||x.as_of))+'</span><span>阅读全文 <span aria-hidden="true">→</span></span></div></a>';
  }
  function searchForm(p,topic){return '<form id="radar-observation-search" class="journal-search" role="search" aria-label="搜索观察"><label class="radar-sr-only" for="radar-observation-input">搜索企业或研究主题</label><input id="radar-observation-input" type="search" value="'+esc(p.q||'')+'" placeholder="'+(topic?'搜索专题、企业或领域':'搜索企业、领域')+'"><button type="submit">搜索</button></form>';}
  O.hub=function(value,p){
    if(p.view==='leads'||p.lead_page!==undefined||p.lead_count!==undefined)return oldHub(value,p);
    document.title=(p.view==='topics'?'产业专题':'企业观察')+'｜寻龙雷达';
    const topic=p.view==='topics',all=topic?value.topics.filter(t=>t.status!=='archived'):value.companies.filter(c=>c.has_reading!==false);
    const q=String(p.q||'').normalize('NFKC').toLowerCase().trim(),terms=q.split(/\s+/).filter(Boolean),matches=x=>{const haystack=[titleOf(x,topic),deckOf(x,topic),meta(x,topic),x.question,x.company,...(x.companies||[]),...(x.aliases||[]),...(x.article?.sections||[]).flatMap(s=>s.paragraphs.map(p=>p.text))].join(' ').normalize('NFKC').toLowerCase();return terms.every(t=>haystack.includes(t));},items=all.filter(x=>(topic||x.article)&&matches(x)),pending=topic?[]:all.filter(x=>!x.article&&matches(x));
    const tabs='<nav class="journal-tabs" aria-label="观察内容"><a href="#/observations" '+(!topic?'aria-current="page"':'')+'>企业观察</a><a href="#/observations?view=topics" '+(topic?'aria-current="page"':'')+'>产业专题</a></nav>';
    let stories='';
    if(topic){
      stories=items.length?'<div class="journal-topic-grid">'+items.map((x,i)=>card(x,true,i,i===0)).join('')+'</div>':'<p class="journal-empty">没有找到相关专题，试试企业名或其他关键词。</p>';
    }else{
      stories=roles.map(([role,label],ri)=>{
        const group=items.filter(x=>(x.role||'unresolved')===role);if(!group.length)return '';
        const content='<div class="journal-company-grid">'+group.map((x,i)=>card(x,false,i,ri===0&&i===0)).join('')+'</div>';
        return ri===0?'<section class="journal-group"><header><h2>'+label+'</h2><span>'+group.length+' 篇观察</span></header>'+content+'</section>':'<details class="journal-group journal-secondary" '+(q?'open':'')+'><summary>'+label+'<span>'+group.length+' 篇观察</span></summary>'+content+'</details>';
      }).join('');
      if(!items.length&&!pending.length)stories='<p class="journal-empty">没有找到相关企业，试试简称或领域。</p>';
      if(pending.length)stories+='<details class="journal-secondary journal-pending" '+(q?'open':'')+'><summary>企业进展<span>'+pending.length+' 家</span></summary><div class="journal-progress-list">'+pending.map(c=>'<a href="'+esc(href('/company',{name:c.company,back:location.hash.slice(1)}))+'"><strong>'+esc(c.display_name||c.company)+'</strong><span>'+esc((roles.find(([role])=>role===c.role)||['','企业进展'])[1])+' · '+esc(c.sector_label||c.sector||'')+'</span><small>查看进展 →</small></a>').join('')+'</div></details>';
      const leads=value.companies.filter(c=>c.role==='local_potential'&&c.has_reading===false).length;
      stories+='<aside class="journal-leads"><div><h3>还有哪些企业正在发生变化？</h3><p>'+leads+' 家杭州潜力企业已有进展线索，可查看原始动态。</p></div><a href="#/observations?view=leads">浏览线索名录 →</a></aside>';
    }
    return '<section class="journal-hub"><header class="journal-masthead"><p class="journal-eyebrow">寻龙 · 观察</p><div><h1>'+(topic?'读懂产业的下一步':'从企业变化，看见新的可能')+'</h1><p>'+(topic?'把企业放在一起，理解技术、产品与竞争怎样变化。':'关于产品、客户和竞争位置的持续研究。')+'</p></div></header><div class="journal-toolbar">'+tabs+searchForm(p,topic)+'</div>'+stories+'<footer class="journal-collection-end"><span>'+items.length+' '+(topic?'篇产业专题':'篇企业观察')+'</span><a href="#/weekly?back=%2Fobservations">查看收录分布 →</a></footer></section>';
  };
  function legacyArticle(x,topic){
    if(topic)return {title:x.question,deck:x.thesis,sections:x.research?.sections||[{heading:'企业变化与产业联系',paragraphs:[x.assessment]}],notes:x.note?[x.note]:[]};
    return null;
  }
  function readingMinutes(article){return Math.max(2,Math.ceil(([article.deck,...article.sections.flatMap(s=>s.paragraphs)].reduce((n,p)=>n+p.text.length,0))/400));}
  function renderArticle(x,topic,p,value){
    const article=x.article||legacyArticle(x,topic);if(!article)return '<div class="journal-empty">企业进展可在档案中阅读。<a href="'+esc(href('/company',{name:x.company,back:'/observations'}))+'">先查看企业进展 →</a></div>';
    const sources=x.article_sources||x.sources||[],sourceIndex=new Map(sources.map((s,i)=>[s.id,i+1]));
    const references=block=>'<sup class="journal-refs">'+(block.evidence_ids||[]).map(id=>sourceIndex.has(id)?'<a href="#journal-source-'+sourceIndex.get(id)+'" data-journal-source="'+sourceIndex.get(id)+'" aria-label="查看依据 '+sourceIndex.get(id)+'">'+sourceIndex.get(id)+'</a>':'').join('')+'</sup>';
    const sectionId=i=>'journal-section-'+i;
    const prose=article.sections.map((s,i)=>'<section id="'+sectionId(i)+'"><h2 tabindex="-1">'+esc(s.heading)+'</h2>'+s.paragraphs.map(b=>'<p>'+esc(b.text)+references(b)+'</p>').join('')+'</section>').join('');
    const names=topic?x.companies:[x.company];
    const directory='<aside class="journal-directory"><p>本文</p><nav aria-label="文章目录">'+article.sections.map((s,i)=>'<a href="#'+sectionId(i)+'" data-journal-section="'+sectionId(i)+'" '+(i===0?'aria-current="location"':'')+'>'+esc(s.heading)+'</a>').join('')+'</nav><div class="journal-directory-context"><span>'+(topic?'涉及企业':'企业档案')+'</span>'+names.map(n=>'<a href="'+esc(href('/company',{name:n,back:location.hash.slice(1)}))+'">'+esc(O.displayName(n))+' →</a>').join('')+'</div></aside>';
    const sourceList='<details id="journal-sources" class="journal-sources"><summary>来源与资料说明 <span>'+sources.length+' 条</span></summary>'+(article.notes||[]).map(n=>'<p>'+esc(n.text)+references(n)+'</p>').join('')+'<ol>'+sources.map((s,i)=>'<li id="journal-source-'+(i+1)+'">'+(H.safeURL(s.link)?'<a href="'+esc(H.safeURL(s.link))+'" target="_blank" rel="noopener noreferrer">'+esc(s.article_title||s.event_headline||s.source||'原始资料')+'</a>':esc(s.article_title||s.event_headline||'已收录资料'))+'<small>'+esc(s.source||'原始来源')+' · '+esc(s.published_date?.slice(0,10)||s.collected_date||'')+'</small></li>').join('')+'</ol></details>';
    const sectorKey=String(x.sector||'').split(/[／/]/)[0];
    const peers=topic?value.topics.filter(t=>t.topic_id!==x.topic_id&&t.status!=='archived'&&(t.companies.some(n=>x.companies.includes(n))||(sectorKey&&t.sector.split(/[／/]/)[0]===sectorKey))).slice(0,2):value.topics.filter(t=>t.companies.includes(x.company)).slice(0,2);
    const related=peers.length?'<section class="journal-related"><h2>延伸阅读</h2>'+peers.map(t=>'<a href="'+esc(articleLink(t,true))+'"><span>'+esc(t.sector)+'</span><h3>'+esc(titleOf(t,true))+'</h3><p>'+esc(deckOf(t,true))+'</p></a>').join('')+'</section>':'';
    const back=/^\/(?:observations|today|company|calendar|weekly|briefing|topic)?(?:\?|$)/.test(p.back||'')?p.back:(topic?'/observations?view=topics':'/observations');
    const backRoute=back.split('?')[0],backLabel=({'/':'主页','/today':'动态','/company':'企业档案','/calendar':'日历','/weekly':'收录分布','/briefing':'简报','/topic':'上一篇观察'})[backRoute]||(topic?'产业专题':'企业观察');
    current={title:article.title,text:article.deck.text,url:location.href.split('#')[0]+href('/topic',topic?{id:x.topic_id}:{company:x.company})};
    document.title=article.title+'｜寻龙雷达';
    return '<article class="journal-reading"><div class="journal-breadcrumb"><a href="#'+esc(back)+'">← '+esc(backLabel)+'</a><span>'+esc(topic?'':(x.display_name||x.company))+'</span></div><header class="journal-article-head"><p class="journal-eyebrow">'+esc(topic?x.sector:(x.sector_label||x.sector||'企业观察'))+'</p><h1>'+esc(article.title)+'</h1><div class="journal-byline"><span>寻龙研究</span><span>'+readingMinutes(article)+' 分钟阅读</span><span>材料截至 '+esc(x.as_of||'')+'</span></div><p class="journal-deck">'+esc(article.deck.text)+references(article.deck)+'</p></header><div class="journal-layout"><div class="journal-prose">'+prose+sourceList+'</div>'+directory+'</div>'+related+'<footer class="journal-article-end"><a href="#'+esc(back)+'">返回'+esc(backLabel)+' →</a>'+(topic?'':'<a href="'+esc(href('/company',{name:x.company,back:location.hash.slice(1)}))+'">查看企业完整进展 →</a>')+'</footer></article>';
  }
  O.topic=function(value,p){
    const topic=!p.company,x=topic?value.topics.find(t=>t.topic_id===p.id):value.companies.find(c=>H.canonical(c.company)===H.canonical(p.company));
    if(!x)return oldTopic(value,p);
    return renderArticle(x,topic,p,value);
  };
  O.sharePayload=function(){return Router.getRoute()==='/topic'&&current?current:oldShare();};
  const oldRelated=O.related;
  O.related=function(name){const topics=window.RadarData?.manifest?.company_observations?.[H.canonical(name)];if(!topics?.length)return oldRelated(name);return '<section class="radar-related-observations"><span>相关观察</span>'+topics.map(t=>'<a href="'+esc(href('/topic',{id:t.id,back:location.hash.slice(1)}))+'">'+esc(t.title||t.question)+' →</a>').join('')+'</section>';};
  document.addEventListener('click',e=>{
    const section=e.target.closest('[data-journal-section]');
    if(section){e.preventDefault();document.getElementById(section.dataset.journalSection)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});document.getElementById(section.dataset.journalSection)?.querySelector('h2')?.focus({preventScroll:true});return;}
    const source=e.target.closest('[data-journal-source]');
    if(source){e.preventDefault();const details=document.getElementById('journal-sources');if(details)details.open=true;const node=document.getElementById('journal-source-'+source.dataset.journalSource);node?.scrollIntoView({behavior:'instant',block:'center'});node?.querySelector('a')?.focus({preventScroll:true});}
  });
  let scheduled=false;
  function activeSection(){
    scheduled=false;const sections=[...document.querySelectorAll('.journal-prose>section')];if(!sections.length)return;
    let active=sections[0].id;for(const section of sections)if(section.getBoundingClientRect().top<170)active=section.id;
    document.querySelectorAll('[data-journal-section]').forEach(a=>{if(a.dataset.journalSection===active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(activeSection);}},{passive:true});
})();
