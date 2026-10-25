/* Editorial reading: an article is the primary object, evidence supports it. */
(function(){
  'use strict';
  const O=window.RadarObservations,H=window.RadarHistory;
  const oldHub=O.hub,oldTopic=O.topic,oldShare=O.sharePayload;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const href=(p,q={})=>'#'+p+(Object.keys(q).length?'?'+new URLSearchParams(q):'');
  const roles=[['local_potential','杭州潜力'],['local_benchmark','杭州标杆'],['unresolved','归属待确认'],['external_reference','外部参照']];
  let current=null;
  function articleLink(item,topic,target){let back=Router.getRoute()==='/observations'?location.hash.slice(1):(topic?'/observations?view=topics':'/observations');if(target){const [path,query]=back.split('?'),params=new URLSearchParams(query||'');params.set('target',target);back=path+'?'+params;}return href('/topic',topic?{id:item.topic_id,back}:{company:item.company,back});}
  const shortDate=x=>String(x||'').slice(0,10).replace(/^2026-/,'').replace('-','/');
  const titleOf=(x,topic)=>x.article?.title||(topic?x.question:(x.display_name||x.company));
  const deckOf=(x,topic)=>x.article?.deck.text||(topic?x.thesis.text:x.thesis||x.progress||'');
  function meta(x,topic){return topic?x.sector:(x.display_name||x.company)+' · '+(x.sector_label||x.sector||'企业观察');}
  const imageNames={footwear:'制鞋工序与柔性材料操作',robotics:'工业机器人与作业现场',computing:'芯片与计算基础设施',sensing:'传感与设备监测',health:'医疗与康复技术'};
  function imageOf(x){const key=x.presentation?.image_key;return Object.prototype.hasOwnProperty.call(imageNames,key)?{key,src:'./assets/editorial/'+key+'.jpg',alt:imageNames[key]+'主题配图'}:null;}
  const updateNotice=()=>'<div class="radar-research-update" data-research-update role="status" hidden><span>观察已更新</span><button type="button" data-observation-refresh>查看新内容 →</button></div>';
  const previewTitle=x=>x.presentation?.headline||x.article?.title||x.question||x.display_name||x.company;
  const previewDeck=(x,topic)=>x.presentation?.summary?.text||deckOf(x,topic);
  function picture(x,kind){const im=imageOf(x);return im?'<img class="journal-picture '+kind+'" src="'+im.src+'" alt="'+im.alt+'" width="1200" height="720" '+(kind==='journal-cover'?'fetchpriority="high"':'loading="lazy"')+' decoding="async">':'';}
  function storyCard(x,topic,index,feature,withImage){
    const im=withImage?picture(x,feature?'journal-cover':'journal-thumb'):'';
    const date=x.as_of||x.latest_material_date||'';
    const update=topic&&Number(x.revision)>1?x.presentation?.update_summary:null;
    return '<article class="journal-story'+(feature?' journal-feature':'')+(im?' journal-illustrated':'')+'" id="journal-entry-'+index+'"><a class="journal-story-link" href="'+esc(articleLink(x,topic,'journal-entry-'+index))+'">'+(feature?'<p class="journal-story-kicker">'+esc(meta(x,topic))+'</p>'+im:'')+'<div class="journal-story-copy">'+(!feature?'<p class="journal-story-kicker">'+esc(meta(x,topic))+'</p>':'')+'<h2>'+esc(previewTitle(x))+'</h2><p class="journal-story-deck">'+esc(previewDeck(x,topic))+'</p><p class="journal-story-meta">'+readingMinutes(x.article||legacyArticle(x,topic))+' 分钟阅读'+(date?' <span>·</span> 材料 '+esc(shortDate(date)):'')+'</p></div>'+(!feature?im:'')+'</a>'+(update?'<p class="journal-revision"><span>本次更新</span>'+esc(update)+'</p>':'')+'</article>';
  }
  function searchForm(p){return '<form id="radar-observation-search" class="journal-search" role="search" aria-label="搜索观察" '+(!p.q?'hidden':'')+'><label class="radar-sr-only" for="radar-observation-input">搜索企业、主题或正文</label><input id="radar-observation-input" type="search" value="'+esc(p.q||'')+'" placeholder="搜索企业、主题或正文" enterkeyhint="search"><button type="submit">搜索</button></form>';}
  O.hub=function(value,p){
    if(p.view==='leads'||p.lead_page!==undefined||p.lead_count!==undefined)return oldHub(value,p);
    document.title=(p.view==='topics'?'产业专题':'企业观察')+'｜寻龙雷达';
    const topic=p.view==='topics',all=topic?value.topics.filter(t=>t.status!=='archived'):value.companies.filter(c=>c.has_reading!==false);
    const q=String(p.q||'').normalize('NFKC').toLowerCase().trim(),terms=q.split(/\s+/).filter(Boolean);
    const matches=x=>{const haystack=[titleOf(x,topic),deckOf(x,topic),previewTitle(x),previewDeck(x,topic),meta(x,topic),x.question,x.company,...(x.companies||[]),...(x.aliases||[]),...(x.article?.sections||[]).flatMap(s=>s.paragraphs.map(b=>b.text))].join(' ').normalize('NFKC').toLowerCase();return terms.every(t=>haystack.includes(t));};
    const items=all.filter(x=>(topic||x.article)&&matches(x)),pending=topic?[]:all.filter(x=>!x.article&&matches(x));
    const tabs='<nav class="journal-tabs" aria-label="观察内容"><a href="#/observations" '+(!topic?'aria-current="page"':'')+'>企业观察</a><a href="#/observations?view=topics" '+(topic?'aria-current="page"':'')+'>产业专题</a></nav>';
    const toolbar='<div class="journal-toolbar">'+tabs+'<button type="button" class="journal-search-toggle" data-journal-search aria-label="搜索观察" aria-expanded="'+(p.q?'true':'false')+'">搜索</button></div>'+searchForm(p);
    const categoryNav=topic?'':'<nav class="journal-categories" aria-label="企业分类">'+roles.filter(([role])=>items.some(x=>(x.role||'unresolved')===role)).map(([role,label])=>'<a href="#journal-role-'+role+'" data-journal-entry="journal-role-'+role+'">'+label+'</a>').join('')+'</nav>';
    let stories='';
    if(topic){
      const used=new Set();
      stories='<header class="journal-section-heading"><h1>产业专题</h1><span>'+items.length+' 篇持续研究</span></header>'+(items.length?'<div class="journal-story-list">'+items.map((x,i)=>{const key=imageOf(x)?.key;const show=!!key&&(!used.has(key)||i===0);if(show)used.add(key);return storyCard(x,true,i,i===0,show);}).join('')+'</div>':'<p class="journal-empty">没有找到相关专题，试试企业名或其他关键词。</p>');
    }else{
      const leads=value.companies.filter(c=>c.role==='local_potential'&&c.has_reading===false);
      stories=roles.map(([role,label])=>{
        const group=items.filter(x=>(x.role||'unresolved')===role);if(!group.length)return '';
        const used=new Set();
        const content=group.map((x,i)=>{const key=imageOf(x)?.key,feature=items.indexOf(x)===0,show=!!key&&!used.has(key);if(show)used.add(key);return storyCard(x,false,items.indexOf(x),feature,show);}).join('');
        const clues=role==='local_potential'&&!q&&leads.length?'<aside class="journal-leads"><header><h3>进展线索</h3><a href="#/observations?view=leads">查看全部 '+leads.length+' 家 <span aria-hidden="true">→</span></a></header>'+leads.slice(0,3).map(c=>'<a class="journal-lead" href="'+esc(href('/company',{name:c.company,back:location.hash.slice(1)}))+'"><strong>'+esc(c.display_name||c.company)+'</strong><p>'+esc(c.progress||c.thesis||'查看企业进展')+'</p></a>').join('')+'</aside>':'';
        return '<section class="journal-group" id="journal-role-'+role+'"><header class="journal-section-heading"><h2>'+label+'</h2><span>'+group.length+' 篇观察</span></header><div class="journal-story-list">'+content+'</div>'+clues+'</section>';
      }).join('');
      if(!items.length&&!pending.length)stories='<p class="journal-empty">没有找到相关企业，试试简称或领域。</p>';
      if(pending.length)stories+='<section class="journal-pending"><h2>企业进展</h2>'+pending.map(c=>'<a href="'+esc(href('/company',{name:c.company,back:location.hash.slice(1)}))+'"><strong>'+esc(c.display_name||c.company)+'</strong><span>查看进展 →</span></a>').join('')+'</section>';
    }
    if(/^journal-entry-\d+$/.test(p.target||''))requestAnimationFrame(()=>document.getElementById(p.target)?.scrollIntoView({behavior:'instant',block:'start'}));
    return '<section class="journal-hub" id="journal-top">'+(!topic?'<h1 class="radar-sr-only">企业观察</h1>':'')+toolbar+updateNotice()+categoryNav+(q?'<p class="journal-search-result">“'+esc(p.q)+'” · '+items.length+' 篇<a href="'+(topic?'#/observations?view=topics':'#/observations')+'">清除搜索</a></p>':'')+stories+'<footer class="journal-collection-end"><span>'+items.length+' '+(topic?'篇产业专题':'篇企业观察')+'</span><a href="#/weekly?back=%2Fobservations">收录分布 →</a></footer></section>';
  };
  function legacyArticle(x,topic){
    if(topic)return {title:x.question,deck:x.thesis,sections:x.research?.sections||[{heading:'企业变化与产业联系',paragraphs:[x.assessment]}],notes:x.note?[x.note]:[]};
    return null;
  }
  function readingMinutes(article){return Math.max(2,Math.ceil(([article.deck,...article.sections.flatMap(s=>s.paragraphs)].reduce((n,p)=>n+p.text.length,0))/400));}
  function renderArticle(x,topic,p,value){
    const article=x.article;if(!article)return '<div class="journal-empty"><p>研究正文正在更新。</p><a href="'+esc(href('/observations',topic?{view:'topics'}:{}))+'">返回'+(topic?'产业专题':'企业观察')+' →</a></div>';
    const sources=x.article_sources||x.sources||[],sourceIndex=new Map(sources.map((s,i)=>[s.id,i+1]));
    const references=block=>'<sup class="journal-refs">'+(block.evidence_ids||[]).map(id=>sourceIndex.has(id)?'<a href="#journal-source-'+sourceIndex.get(id)+'" data-journal-source="'+sourceIndex.get(id)+'" aria-label="查看依据 '+sourceIndex.get(id)+'">'+sourceIndex.get(id)+'</a>':'').join('')+'</sup>';
    const sectionId=i=>'journal-section-'+i;
    const prose=article.sections.map((s,i)=>'<section id="'+sectionId(i)+'"><h2 tabindex="-1">'+esc(s.heading)+'</h2>'+s.paragraphs.map(b=>'<p>'+esc(b.text)+references(b)+'</p>').join('')+'</section>').join('');
    const revision=topic&&Number(x.revision)>1&&x.presentation?.update_summary?'<aside class="journal-revision journal-article-revision"><span>本次更新</span>'+esc(x.presentation.update_summary)+'</aside>':'';
    const names=topic?x.companies:[x.company];
    const history=topic&&x.research_history?.length?'<details class="journal-sources journal-research-history"><summary>判断沿革 <span>'+x.research_history.length+' 次此前判断</span></summary><ol>'+[...x.research_history].reverse().map(h=>'<li><small>'+esc(String(h.updated_at||h.as_of||'').slice(0,10))+' · 第 '+Number(h.revision)+' 版</small><p>'+esc(h.thesis?.text||'')+'</p></li>').join('')+'</ol></details>':'';
    const directory='<aside class="journal-directory"><p>本文</p><nav aria-label="文章目录">'+article.sections.map((s,i)=>'<a href="#'+sectionId(i)+'" data-journal-section="'+sectionId(i)+'" '+(i===0?'aria-current="location"':'')+'>'+esc(s.heading)+'</a>').join('')+'</nav><div class="journal-directory-context"><span>'+(topic?'涉及企业':'企业档案')+'</span>'+names.map(n=>'<a href="'+esc(href('/company',{name:n,back:location.hash.slice(1)}))+'">'+esc(O.displayName(n))+' →</a>').join('')+'</div></aside>';
    const sourceList='<details id="journal-sources" class="journal-sources"><summary>来源与资料说明 <span>'+sources.length+' 条</span></summary>'+(article.notes||[]).map(n=>'<p>'+esc(n.text)+references(n)+'</p>').join('')+'<ol>'+sources.map((s,i)=>'<li id="journal-source-'+(i+1)+'">'+(H.safeURL(s.link)?'<a href="'+esc(H.safeURL(s.link))+'" target="_blank" rel="noopener noreferrer">'+esc(s.article_title||s.event_headline||s.source||'原始资料')+'</a>':esc(s.article_title||s.event_headline||'已收录资料'))+'<small>'+esc(s.source||'原始来源')+' · '+esc(s.published_date?.slice(0,10)||s.collected_date||'')+'</small></li>').join('')+'</ol></details>';
    const sectorKey=String(x.sector||'').split(/[／/]/)[0];
    const peers=topic?value.topics.filter(t=>t.topic_id!==x.topic_id&&t.status!=='archived'&&(t.companies.some(n=>x.companies.includes(n))||(sectorKey&&t.sector.split(/[／/]/)[0]===sectorKey))).slice(0,2):value.topics.filter(t=>t.companies.includes(x.company)).slice(0,2);
    const related=peers.length?'<section class="journal-related"><h2>延伸阅读</h2>'+peers.map(t=>'<a href="'+esc(articleLink(t,true))+'"><span>'+esc(t.sector)+'</span><h3>'+esc(previewTitle(t))+'</h3><p>'+esc(previewDeck(t,true))+'</p></a>').join('')+'</section>':'';
    const back=/^\/(?:observations|today|company|calendar|weekly|briefing|topic)?(?:\?|$)/.test(p.back||'')?p.back:(topic?'/observations?view=topics':'/observations');
    const backRoute=back.split('?')[0],backLabel=({'/':'主页','/today':'动态','/company':'企业档案','/calendar':'日历','/weekly':'收录分布','/briefing':'简报','/topic':'上一篇观察'})[backRoute]||(topic?'产业专题':'企业观察');
    current={title:article.title,text:article.deck.text,url:location.href.split('#')[0]+href('/topic',topic?{id:x.topic_id}:{company:x.company})};
    document.title=article.title+'｜寻龙雷达';
    return '<article class="journal-reading">'+updateNotice()+'<div class="journal-breadcrumb"><a href="#'+esc(back)+'">← '+esc(backLabel)+'</a><span>'+esc(topic?'':(x.display_name||x.company))+'</span></div><header class="journal-article-head"><p class="journal-eyebrow">'+esc(topic?x.sector:(x.sector_label||x.sector||'企业观察'))+'</p><h1>'+esc(previewTitle(x))+'</h1><div class="journal-byline"><span>寻龙研究</span><span>'+readingMinutes(article)+' 分钟阅读</span><span>材料截至 '+esc(x.as_of||'')+'</span></div><p class="journal-deck">'+esc(article.deck.text)+references(article.deck)+'</p></header>'+picture(x,'journal-article-picture')+'<div class="journal-layout"><div class="journal-prose">'+prose+revision+(imageOf(x)?'<p class="journal-art-credit">配图为产业场景示意</p>':'')+sourceList+history+'</div>'+directory+'</div>'+related+'<footer class="journal-article-end"><a href="#'+esc(back)+'">返回'+esc(backLabel)+' →</a>'+(topic?'':'<a href="'+esc(href('/company',{name:x.company,back:location.hash.slice(1)}))+'">查看企业完整进展 →</a>')+'</footer></article>';
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
    const search=e.target.closest('[data-journal-search]');if(search){const form=document.getElementById('radar-observation-search');if(form){form.hidden=!form.hidden;search.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)form.querySelector('input')?.focus();}return;}

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
