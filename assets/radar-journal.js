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
  function feedArticle(x,topic,index){
    const a=x.article||legacyArticle(x,topic),prefix='journal-entry-'+index,sources=x.article_sources||x.sources||[],indices=new Map(sources.map((v,i)=>[v.id,i+1]));
    if(!a)return '';
    const refs=b=>'<sup class="journal-refs">'+(b.evidence_ids||[]).map(id=>indices.has(id)?'<a href="#'+prefix+'-source-'+indices.get(id)+'" data-journal-source="'+indices.get(id)+'" aria-label="查看依据 '+indices.get(id)+'">'+indices.get(id)+'</a>':'').join('')+'</sup>';
    return '<article class="journal-feed-article" id="'+prefix+'"><header><div class="journal-story-kicker"><span>'+esc(meta(x,topic))+'</span><span>'+readingMinutes(a)+' 分钟阅读 · 材料截至 '+esc(x.as_of||'')+'</span></div><h2><a href="'+esc(articleLink(x,topic))+'">'+esc(a.title)+'</a></h2><p class="journal-feed-deck">'+esc(a.deck.text)+refs(a.deck)+'</p></header><div class="journal-feed-prose">'+a.sections.map(section=>'<section><h3>'+esc(section.heading)+'</h3>'+section.paragraphs.map(p=>'<p>'+esc(p.text)+refs(p)+'</p>').join('')+'</section>').join('')+'</div><details class="journal-sources" id="'+prefix+'-sources"><summary>来源与资料说明 <span>'+sources.length+' 条</span></summary>'+(a.notes||[]).map(p=>'<p>'+esc(p.text)+refs(p)+'</p>').join('')+'<ol>'+sources.map((v,i)=>'<li id="'+prefix+'-source-'+(i+1)+'" data-journal-reference="'+(i+1)+'">'+(H.safeURL(v.link)?'<a href="'+esc(H.safeURL(v.link))+'" target="_blank" rel="noopener noreferrer">'+esc(v.article_title||v.event_headline||v.source)+'</a>':esc(v.article_title||v.event_headline||v.source))+'<small>'+esc(v.source||'原始来源')+' · '+esc(v.published_date?.slice(0,10)||v.collected_date||'')+'</small></li>').join('')+'</ol></details><footer><a href="'+esc(articleLink(x,topic))+'">独立阅读与分享 →</a><a href="#journal-top" data-journal-entry="journal-top">回到目录 ↑</a></footer></article>';
  }
  function searchForm(p,topic){return '<form id="radar-observation-search" class="journal-search" role="search" aria-label="搜索观察"><label class="radar-sr-only" for="radar-observation-input">搜索企业或研究主题</label><input id="radar-observation-input" type="search" value="'+esc(p.q||'')+'" placeholder="'+'搜索内容'+'"><button type="submit">搜索</button></form>';}
  O.hub=function(value,p){
    if(p.view==='leads'||p.lead_page!==undefined||p.lead_count!==undefined)return oldHub(value,p);
    document.title=(p.view==='topics'?'产业专题':'企业观察')+'｜寻龙雷达';
    const topic=p.view==='topics',all=topic?value.topics.filter(t=>t.status!=='archived'):value.companies.filter(c=>c.has_reading!==false);
    const q=String(p.q||'').normalize('NFKC').toLowerCase().trim(),terms=q.split(/\s+/).filter(Boolean),matches=x=>{const haystack=[titleOf(x,topic),deckOf(x,topic),meta(x,topic),x.question,x.company,...(x.companies||[]),...(x.aliases||[]),...(x.article?.sections||[]).flatMap(s=>s.paragraphs.map(p=>p.text))].join(' ').normalize('NFKC').toLowerCase();return terms.every(t=>haystack.includes(t));},items=all.filter(x=>(topic||x.article)&&matches(x)),pending=topic?[]:all.filter(x=>!x.article&&matches(x));
    const tabs='<nav class="journal-tabs" aria-label="观察内容"><a href="#/observations" '+(!topic?'aria-current="page"':'')+'>企业观察</a><a href="#/observations?view=topics" '+(topic?'aria-current="page"':'')+'>产业专题</a></nav>';
    let stories='';
    const readingIndex='<div class="journal-reading-index"><span>全文连读 · '+items.length+' 篇</span><label class="radar-sr-only" for="journal-jump">跳到某篇文章</label><select id="journal-jump"><option value="">跳到某篇文章…</option>'+items.map((x,i)=>'<option value="journal-entry-'+i+'">'+esc(titleOf(x,topic))+'</option>').join('')+'</select>'+(topic?'':'<nav aria-label="企业分类">'+roles.filter(([role])=>items.some(x=>(x.role||'unresolved')===role)).map(([role,label])=>'<a href="#journal-role-'+role+'" data-journal-entry="journal-role-'+role+'">'+label+'</a>').join('')+'</nav>')+'</div>';
    if(topic){
      stories=items.length?'<div class="journal-topic-grid">'+items.map((x,i)=>feedArticle(x,true,i)).join('')+'</div>':'<p class="journal-empty">没有找到相关专题，试试企业名或其他关键词。</p>';
    }else{
      stories=roles.map(([role,label],ri)=>{
        const group=items.filter(x=>(x.role||'unresolved')===role);if(!group.length)return '';
        const content='<div class="journal-company-grid">'+group.map(x=>feedArticle(x,false,items.indexOf(x))).join('')+'</div>';
        return '<section class="journal-group" id="journal-role-'+role+'"><header><h2>'+label+'</h2><span>'+group.length+' 篇观察</span></header>'+content+'</section>';
      }).join('');
      if(!items.length&&!pending.length)stories='<p class="journal-empty">没有找到相关企业，试试简称或领域。</p>';
      if(pending.length)stories+='<section class="journal-group journal-pending"><header><h2>企业进展</h2><span>'+pending.length+' 家</span></header><div class="journal-progress-list">'+pending.map(c=>'<a href="'+esc(href('/company',{name:c.company,back:location.hash.slice(1)}))+'"><strong>'+esc(c.display_name||c.company)+'</strong><span>'+esc((roles.find(([role])=>role===c.role)||['','企业进展'])[1])+' · '+esc(c.sector_label||c.sector||'')+'</span><small>查看进展 →</small></a>').join('')+'</div></section>';
      const leads=value.companies.filter(c=>c.role==='local_potential'&&c.has_reading===false).length;
      stories+='<aside class="journal-leads"><div><h3>还有哪些企业正在发生变化？</h3><p>'+leads+' 家杭州潜力企业已有进展线索，可查看原始动态。</p></div><a href="#/observations?view=leads">浏览线索名录 →</a></aside>';
    }
    return '<section class="journal-hub" id="journal-top"><header class="journal-masthead"><p class="journal-eyebrow">寻龙 · 观察</p><div><h1>'+(topic?'读懂产业的下一步':'从企业变化，看见新的可能')+'</h1><p>'+(topic?'把企业放在一起，理解技术、产品与竞争怎样变化。':'关于产品、客户和竞争位置的持续研究。')+'</p></div></header><div class="journal-toolbar">'+tabs+searchForm(p,topic)+'</div>'+readingIndex+stories+'<footer class="journal-collection-end"><span>'+items.length+' '+(topic?'篇产业专题':'篇企业观察')+'</span><a href="#/weekly?back=%2Fobservations">查看收录分布 →</a></footer></section>';
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
  document.addEventListener('change',e=>{if(e.target.id!=='journal-jump'||!e.target.value)return;const node=document.getElementById(e.target.value);node?.scrollIntoView({behavior:'instant',block:'start'});const heading=node?.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
  document.addEventListener('click',e=>{
    const entry=e.target.closest('[data-journal-entry]');
    if(entry){e.preventDefault();const node=document.getElementById(entry.dataset.journalEntry);node?.scrollIntoView({behavior:'instant',block:'start'});const heading=node?.querySelector('h1,h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}return;}
    const section=e.target.closest('[data-journal-section]');
    if(section){e.preventDefault();document.getElementById(section.dataset.journalSection)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});document.getElementById(section.dataset.journalSection)?.querySelector('h2')?.focus({preventScroll:true});return;}
    const source=e.target.closest('[data-journal-source]');
    if(source){e.preventDefault();const scope=source.closest('.journal-feed-article');const details=scope?scope.querySelector('.journal-sources'):document.getElementById('journal-sources');if(details)details.open=true;const node=scope?scope.querySelector('[data-journal-reference="'+source.dataset.journalSource+'"]'):document.getElementById('journal-source-'+source.dataset.journalSource);node?.scrollIntoView({behavior:'instant',block:'center'});node?.querySelector('a')?.focus({preventScroll:true});}
  });
  let scheduled=false;
  function activeSection(){
    scheduled=false;const sections=[...document.querySelectorAll('.journal-prose>section')];if(!sections.length)return;
    let active=sections[0].id;for(const section of sections)if(section.getBoundingClientRect().top<170)active=section.id;
    document.querySelectorAll('[data-journal-section]').forEach(a=>{if(a.dataset.journalSection===active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(activeSection);}},{passive:true});
})();
