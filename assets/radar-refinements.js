/* Integrate reading flows while preserving the original cards and government briefings. */
(function () {
  'use strict';
  const A=window.RadarHistory;
  const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=()=>Router.getQueryParams();
  const routeLink=(route,q={})=>'#'+route+(Object.keys(q).length?'?'+new URLSearchParams(q):'');
  let historyPromise,historyRows,renderSequence=0,filterSequence=0,currentRows=[],visibleCount=20,activeKey='',filterTimer;
  const screenStates=new Map();
  const dataRequests=new Map(),companyRequests=new Map();
  function reuseRequest(cache,key,load){
    if(cache.has(key))return cache.get(key);
    const pending=Promise.resolve().then(load).catch(error=>{cache.delete(key);throw error;});
    cache.set(key,pending);
    if(cache.size>32)cache.delete(cache.keys().next().value);
    return pending;
  }
  const field=id=>document.getElementById(id);
  const safeBack=value=>/^\/(?:today|company|calendar|weekly|briefing)?(?:\?|$)/.test(value||'')?value:'/today';
  function companyLink(name){return routeLink('/company',{name:A.canonical(name),back:safeBack(location.hash.slice(1)||'/')});}
  function readHistory(){
    if(!historyPromise){
      const light=window.RadarData.manifest.history_search_version,version=light||window.RadarData.manifest.history_version||'';
      historyPromise=fetch('./data/'+(light?'history-search':'company-history')+'.json?v='+encodeURIComponent(version)).then(r=>{if(!r.ok)throw Error('历史记录暂时无法读取');return r.json();}).then(h=>{historyRows=A.rows(h).map(r=>light?{...r,previewOnly:true}:r);return historyRows;}).catch(e=>{historyPromise=null;throw e;});
    }
    return historyPromise;
  }
  function readCompany(name){
    const canonical=A.canonical(name),key=A.bucket(canonical),version=window.RadarData.manifest.company_history_buckets?.[key];
    if(historyRows&&!window.RadarData.manifest.history_search_version)return Promise.resolve(historyRows.filter(r=>A.canonical(r.company)===canonical));
    if(!version)return readHistory().then(records=>records.filter(r=>A.canonical(r.company)===canonical));
    return reuseRequest(companyRequests,key+':'+version,()=>fetch('./data/companies/'+key+'.json?v='+encodeURIComponent(version)).then(response=>{if(!response.ok)throw Error('企业记录暂时无法读取，请重试');return response.json();}).then(A.rows))
      .then(records=>records.filter(r=>A.canonical(r.company)===canonical));
  }
  const originalLoad=loadDailyData;
  loadDailyData=function(day){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return Promise.reject(Error('日期格式不正确'));
    const p=params(),version=(Router.getRoute()==='/today'&&p.date===day&&p.v)||window.RadarData.manifest?.daily_versions?.[day];
    if(!version)return reuseRequest(dataRequests,'day:'+day,()=>originalLoad(day));
    if(!/^[a-f0-9]{64}$/.test(version))return Promise.reject(Error('版本链接不正确'));
    return reuseRequest(dataRequests,'day:'+day+':'+version,()=>fetch('./data/releases/'+day+'/'+version+'.json').then(r=>{if(!r.ok)throw Error('该期内容暂时无法读取，请稍后重试');return r.json();}));
  };
  const originalWeeklyLoad=loadWeeklyData,originalBriefingLoad=loadBriefingData;
  loadWeeklyData=week=>reuseRequest(dataRequests,'week:'+week,()=>originalWeeklyLoad(week));
  loadBriefingData=(type,id)=>reuseRequest(dataRequests,'brief:'+type+':'+id,()=>originalBriefingLoad(type,id));
  function trackButton(name){return '<a class="radar-track" href="'+esc(companyLink(name))+'" aria-label="追踪'+esc(name)+'，查看全部已收录信息">追踪</a>';}
  function extendCard(html,item,compact){
    const name=item.company_name||item.company||'';
    if(A.region(item)==='海外')html=html.replace(/全国标杆/g,'海外参考').replace(/🌐标杆/g,'🌐海外');
    if(compact){return html.replace(/onclick="Router.navigate\([^\n]*?\)"/,'role="link" tabindex="0" data-company-card="'+esc(name)+'"');}
    html=html.replace('<div class="flex flex-wrap gap-1.5 mb-3.5">','<div class="radar-event-tags flex flex-wrap gap-1.5 mb-3.5">');
    html=html.replace('rounded bg-[#F4F6FB] text-[#4A6495]','rounded radar-tag-sector bg-[#F4F6FB] text-[#4A6495]');
    html=html.replace(/(<span class="[^"]*">📰 [\s\S]*?<\/span>)/,'<div class="radar-source-row">$1'+trackButton(name)+'</div>');
    html=html.replace('<div class="mb-3 ml-2 flex justify-between items-start"><div>','<div class="mb-3 ml-2 flex justify-between items-start"><div class="min-w-0 flex-1 pr-2">');
    const dates=[item.event_date||item.event_time_evidence?.event_date,item.published_date].map((x,i)=>x?['事件 ','报道 '][i]+esc(x):'').filter(Boolean);
    if(dates.length)html=html.replace('<div class="flex items-center gap-2 mt-4','<div class="radar-dates">'+dates.join(' · ')+'</div><div class="flex items-center gap-2 mt-4');
    return html.replace(/(<div id="[^"]+"[^>]*>)/,'$1<span class="radar-event-anchor" id="'+A.anchor(item)+'" aria-hidden="true"></span>');
  }
  const card=renderCompanyCard,negative=renderNegativeCard;
  renderCompanyCard=function(item,index,compact){return extendCard(card.apply(this,arguments),item,compact);};
  renderNegativeCard=function(item,compact){return extendCard(negative.apply(this,arguments),item,compact);};
  const home=Views.home;
  Views.home=function(data){return home(data).replace('<span class="text-xs text-gray-400">滑动直阅</span>','<a class="radar-text-link" href="#/today">全部动态 →</a>');};
  const calendar=Views.calendar;
  Views.calendar=function(data,month){
    const copy={...data,weekly_negatives:[],available_dates:(data.available_dates||[]).map(day=>({...day,count:(day.count||0)+(day.negative_count||0)}))};
    let html=calendar(copy,month).replace(/(\d+)家<\/span>/g,'$1条</span>').replace('本月收录天数','本月归档天数').replace('本月扫描总数','本月收录动态');
    html=html.replace(/(text-xl font-black text-gray-800">\d+<span class="text-xs font-normal text-gray-400 ml-1">)家/g,'$1条');
    html=html.replace(/<button onclick="Router.navigate\('\/calendar\?month=([^']+)'\)"/g,'<button aria-label="查看 $1 月" onclick="Router.navigate(\'/calendar?month=$1\')"');
    return html;
  };
  const weekly=Views.weekly;
  Views.weekly=function(data,weeks){
    const copy=JSON.parse(JSON.stringify(data));
    const week=data.year!==undefined?data.year+'-W'+String(data.week).padStart(2,'0'):data.current_week;
    const count=window.RadarData.manifest.weekly_counts?.[week];
    if(count){if(copy.year!==undefined)copy.summary.total_companies=count.companies;else if(copy.summary?.week)copy.summary.week.total_companies=count.companies;}
    let html=weekly(copy,weeks);
    const raw=data.year!==undefined?data.sector_distribution:(data.summary?.week?.sector_distribution||data.summary?.week?.top_sectors||[]);
    normalizeSectors(raw||{}).forEach((sector,i)=>{
      const label=(i+1)+'. '+sector.sector;
      const needle='<span class="text-xs font-bold text-gray-700">'+label+'</span>';
      html=html.replace(needle,'<a class="text-xs font-bold text-gray-700 radar-sector-link" href="'+esc(routeLink('/today',{search:'all',...A.weekRange(week),sector:sector.sector}))+'">'+esc(label)+' →</a>');
    });
    return html;
  };
  function dailyRows(data,day){
    return [['targets','event'],['negatives','risk']].flatMap(([key,kind])=>(Array.isArray(data[key])?data[key]:[]).map(t=>({...t,company:t.company_name||t.company,date:day,kind,title:t.event_desc||t.reason||t.title||'',article_title:t.event_description||t.article_title||t.title||'',insight:t.insight||t.summary||'',event_date:t.event_date||t.event_time_evidence?.event_date||'',canonical_name:A.canonical(t.company_name||t.company),region:A.region(t)})))
      .sort((a,b)=>(a.kind==='risk'?-1:0)-(b.kind==='risk'?-1:0)||(b.score||0)-(a.score||0));
  }
  function eventLink(r){const q={date:r.date,target:A.anchor(r)};const p=params();const version=(p.date===r.date&&p.v)||window.RadarData.manifest.daily_versions?.[r.date];if(version)q.v=version;return routeLink('/today',q);}
  function fullCard(r){
    const item={...r,company:r.company,event_desc:r.title,article_title:r.article_title,insight:r.insight};
    // Existing renderers interpolate strings. Escape content and restrict outgoing URLs here.
    Object.keys(item).forEach(k=>{if(typeof item[k]==='string'&&k!=='link')item[k]=esc(item[k]);});
    item.link=A.safeURL(r.link).replace(/'/g,'%27');
    let html=r.kind==='risk'?renderNegativeCard(item,false):renderCompanyCard(item,null,false);
    if(window.RadarShare){const shareKey=window.RadarShare.registerEvent({...r,event_desc:r.title});html=html.replace(/data-radar-share="[^"]+"/,'data-radar-share="'+shareKey+'"');}
    html=html.replace(/https:\/\/aiqicha\.baidu\.com\/s\?q=[^']*/, 'https://aiqicha.baidu.com/s?q='+encodeURIComponent(r.company).replace(/'/g,'%27'));
    html=html.replace(/id="card-[^"]+"/,'id="detail-'+r.date+'-'+A.anchor(r)+'"');
    html=html.replace(/<div class="mb-3 ml-2 flex justify-between items-start">[\s\S]*?(?=<div class="radar-event-tags flex flex-wrap gap-1.5 mb-3.5">)/,'');
    if(r.kind==='risk')html=html.replace(/<div class="flex items-start gap-2 mb-3">[\s\S]*?(?=<div class="radar-event-tags flex flex-wrap gap-1.5 mb-3.5">)/,'');
    return html;
  }
  function rowKey(r){return r.date+'-'+A.anchor(r);}
  function readingBody(r){
    const risk=r.kind==='risk'||/风险|负面/.test(r.event_type||'');
    let body=fullCard(risk?{...r,kind:'risk'}:r);
    // Use the existing card's actual tag row and article heading, including its event palette.
    const tags=body.match(/<div class="radar-event-tags flex flex-wrap gap-1.5 mb-3.5">[\s\S]*?<\/div>/)?.[0]||'';
    const title=body.match(/<div class="mb-(?:2|3) text-\[14px\][^"]*border-l-\[3px\][^"]*">[\s\S]*?<\/div>/)?.[0]||'';
    body=body.replace(tags,'').replace(title,'');
    return {body,tags,title};
  }
  function observations(r){
    return (r.observations||[]).length>1?'<details class="radar-observations"><summary>'+r.observations.length+' 条收录记录与来源</summary>'+r.observations.map(o=>'<p>'+esc(o.date)+' · '+esc(o.company)+' · '+esc(o.source||'来源见原文')+' <a href="'+esc(eventLink(o))+'">查看记录</a>'+(A.safeURL(o.link)?' · <a target="_blank" rel="noopener noreferrer" href="'+esc(A.safeURL(o.link))+'">原文</a>':'')+'</p>').join('')+'</details>':'';
  }
  function timelineEventText(r){
    // History title stores the reviewed event facts, not the publisher's headline.
    // Keep an intact sentence: dates, amounts and tentative stages must survive.
    const facts=String(r.title||r.event_desc||r.reason||'').trim();
    if(!facts)return {headline:'企业相关报道已收录，事件要点待补充',excerpt:''};
    const caption=String(r.event_headline||'').trim();
    if(caption)return {headline:caption,excerpt:facts};
    const first=facts.match(/^[\s\S]*?[。！？][”’」』】）)]*/)?.[0]||facts;
    return {headline:first.trim(),excerpt:facts.slice(first.length).trim()};
  }
  function timelineRow(r,open=false,latest=false){
    const key=rowKey(r),risk=r.kind==='risk'||/风险|负面/.test(r.event_type||''),{body,tags}=readingBody(r);
    const {headline,excerpt}=timelineEventText(r);
    const origin=r.article_title?'<div class="radar-timeline-origin-title"><span>原文标题</span><p>'+esc(r.article_title)+'</p></div>':'';
    const pending=window.RadarInsightQuality?.needsReview(r.insight||'',window.RadarData.manifest);
    const insight=latest&&r.insight&&!pending?'<aside class="radar-timeline-insight-preview"><strong>'+ (risk?'小贾风险洞察':'小贾深度洞察')+'</strong><p>'+esc(r.insight)+'</p></aside>':'';
    const score=Number.isFinite(r.score)?'<span class="radar-timeline-score">当期评分 '+esc(r.score)+'</span>':'';
    const shareKey=latest&&window.RadarShare?window.RadarShare.registerEvent({...r,event_desc:r.title}):'';
    const actions=latest?'<div class="radar-timeline-preview-actions">'+(A.safeURL(r.link)?'<a href="'+esc(A.safeURL(r.link))+'" target="_blank" rel="noopener noreferrer">阅读原文</a>':'')+(shareKey?'<button type="button" data-radar-share="'+esc(shareKey)+'">分享</button>':'')+'<button type="button" data-expand-record aria-label="展开'+esc(r.company)+'在'+esc(r.date)+'的全文与研判">全文与研判</button></div>':'';
    return '<article class="radar-stream-item radar-timeline-item '+(risk?'radar-risk-item':'')+(latest?' radar-timeline-latest':'')+'" data-row="'+esc(key)+'">'+
      '<div class="radar-timeline-stamp"><span>收录 <time tabindex="-1" datetime="'+esc(r.date)+'">'+esc(r.date)+'</time></span><span class="radar-timeline-source" title="'+esc(r.source||'来源见原文')+'">'+esc(r.source||'来源见原文')+'</span>'+(risk?'<span class="radar-timeline-risk">风险预警</span>':'')+'</div><h3 class="radar-timeline-title" title="'+esc(headline)+'">'+esc(headline)+'</h3>'+
      '<details class="radar-event-details" data-event-details="'+esc(key)+'" '+(open?'open':'')+'><summary aria-label="展开'+esc(r.company)+'在'+esc(r.date)+'的全文与研判">'+(excerpt?'<p class="radar-event-excerpt">'+esc(excerpt)+'</p>':'')+insight+(latest?'':'<span class="radar-reading-card-footer"><span class="radar-expand-label">全文与研判 ↓</span></span>')+'</summary><div class="radar-event-body" tabindex="-1"><div class="radar-timeline-detail-meta">'+tags+score+'</div>'+body+origin+'</div><div class="radar-reading-card-footer radar-collapse-footer"><button type="button" class="radar-expand-label" data-collapse-record aria-label="收起'+esc(r.company)+'在'+esc(r.date)+'的全文与研判">收起全文 ↑</button></div></details>'+actions+observations(r)+'</article>';
  }
  function streamRow(r,open=false,inCompany=false,latest=false){
    if(inCompany)return timelineRow(r,open,latest);
    const key=rowKey(r),risk=r.kind==='risk'||/风险|负面/.test(r.event_type||''),{body,tags,title}=readingBody(r);
    const score=Number.isFinite(r.score)?'<div class="radar-reading-score" aria-label="当期评分 '+esc(r.score)+'"><span class="text-2xl font-black leading-none tracking-tighter '+getScoreColor(r.score)+'">'+esc(r.score)+'</span></div>':'';
    const heading=inCompany?'<h3 class="radar-record-date"><span>收录</span> <time datetime="'+esc(r.date)+'">'+esc(r.date)+'</time></h3>':'<h3><a href="'+esc(companyLink(r.company))+'">'+esc(A.canonical(r.canonical_name||r.company))+'</a></h3>';
    const recordedAt=inCompany?'':'<span class="radar-stream-meta">收录 <time datetime="'+esc(r.date)+'">'+esc(r.date)+'</time></span>';
    const originals=observations(r);
    return '<article class="radar-stream-item '+(risk?'radar-risk-item':'')+'" data-row="'+esc(key)+'">'+
      '<div class="radar-reading-card-heading"><div class="radar-reading-identity">'+heading+'<div class="radar-source-row"><span class="radar-source-label">📰 '+esc(r.source||'来源见原文')+'</span>'+(inCompany?'':trackButton(r.company))+'</div></div>'+score+'</div>'+tags+title+
      '<details class="radar-event-details" data-event-details="'+esc(key)+'" '+(open?'open':'')+'><summary aria-label="展开'+esc(r.company)+'在'+esc(r.date)+'的全文与研判"><p class="radar-event-excerpt">'+esc(r.title||r.article_title||'查看原始记录')+'</p><span class="radar-reading-card-footer">'+recordedAt+'<span class="radar-expand-label">全文与研判 ↓</span></span></summary><div class="radar-event-body" tabindex="-1">'+(r.previewOnly?'<p class="radar-detail-loading" role="status">正在读取全文与研判…</p>':body)+'</div><div class="radar-reading-card-footer radar-collapse-footer">'+recordedAt+'<button type="button" class="radar-expand-label" data-collapse-record aria-label="收起'+esc(r.company)+'在'+esc(r.date)+'的全文与研判">收起全文 ↑</button></div></details>'+originals+'</article>';
  }
  async function hydrateRecord(article){
    const record=currentRows.find(r=>rowKey(r)===article.dataset.row),body=article.querySelector('.radar-event-body');
    if(!record?.previewOnly||article.dataset.loading==='true')return;
    article.dataset.loading='true';body.innerHTML='<p class="radar-detail-loading" role="status">正在读取全文与研判…</p>';
    try{
      const rows=await readCompany(record.company),full=rows.find(r=>rowKey(r)===rowKey(record));
      if(!full)throw Error('record_missing');
      Object.assign(record,full,{previewOnly:false});
      if(article.isConnected)body.innerHTML=readingBody(record).body;
    }catch{if(article.isConnected)body.innerHTML='<p class="radar-detail-loading">全文暂时无法读取，<button type="button" class="radar-text-link" data-retry-record>点此重试</button></p>';}
    finally{delete article.dataset.loading;}
  }
  function toolbar(p,day){
    const custom=p.from||p.to,advanced=false;
    return '<form id="radar-history-filter" class="radar-filter" role="search" aria-label="搜索全部企业和日期">'+
      '<div class="radar-page-heading"><h2>📰 企业动态</h2><div class="radar-period-picker"><label class="radar-sr-only" for="radar-scope">收录日期范围</label><select id="radar-scope"><option value="today"'+(p.search!=='all'?' selected':'')+'>'+esc(day===window.RadarData.manifest.today?'今日':day)+'</option><option value="week">近7天</option><option value="all"'+(p.search==='all'&&!custom?' selected':'')+'>全部日期</option><option value="custom"'+(custom?' selected':'')+'>自定义日期</option></select><span aria-hidden="true">▼</span></div></div>'+
      '<div class="radar-search-bar"><label class="radar-sr-only" for="radar-filter-input">搜索全部企业、赛道或事件</label><input id="radar-filter-input" type="search" placeholder="搜索企业、赛道或事件" value="'+esc(p.q||'')+'" autocomplete="off"><button type="button" data-toggle-filter aria-controls="radar-filter-more" aria-expanded="'+advanced+'">筛选</button></div>'+
      '<div id="radar-filter-more" '+(advanced?'':'hidden')+'><div class="radar-filter-caption"><strong>筛选动态</strong><button type="button" data-clear-filter>重置</button></div><label for="radar-company">企业（按主体筛选）</label><input id="radar-company" list="radar-companies" placeholder="全部企业，输入名称选择" value="'+esc(p.company||'')+'" autocomplete="off"><datalist id="radar-companies"></datalist>'+
      '<div class="radar-filter-grid"><label for="radar-region">地域<select id="radar-region">'+options(['','杭州','国内其他','海外','待核实'],p.region,'全部地域')+'</select></label><label for="radar-type">事件类型<select id="radar-type">'+options(['',...(p.type?[p.type]:[])],p.type,'全部类型')+'</select></label></div>'+
      '<label for="radar-sector">赛道<select id="radar-sector">'+options(['',...(p.sector?[p.sector]:[])],p.sector,'全部赛道')+'</select></label>'+
      '<fieldset id="radar-date-range" '+(custom?'':'hidden')+'><legend>按收录日期筛选</legend><div class="radar-filter-grid"><label for="radar-from">开始日期<input id="radar-from" type="date" value="'+esc(p.from||'')+'"></label><label for="radar-to">结束日期<input id="radar-to" type="date" value="'+esc(p.to||'')+'"></label></div></fieldset></div>'+
      '<div class="radar-reading-caption"><p id="radar-filter-context" class="radar-filter-context"></p><p id="radar-result-status" class="radar-filter-result" role="status" aria-live="polite"></p></div></form><div id="radar-stream"></div><button class="radar-more" type="button" data-history-more hidden>再显示20条</button>';
  }
  function options(values,current,empty){return [...new Set(values)].map(v=>'<option value="'+esc(v)+'"'+(v===(current||'')?' selected':'')+'>'+esc(v||empty)+'</option>').join('');}
  function populateFilters(){
    if(!field('radar-history-filter')||!historyRows)return;
    const names=[...new Set(historyRows.map(r=>A.canonical(r.company)))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    field('radar-companies').innerHTML=names.map(n=>'<option value="'+esc(n)+'"></option>').join('');
    const type=field('radar-type'),sector=field('radar-sector');
    const types=historyRows.map(r=>r.kind==='risk'||/风险|负面/.test(r.event_type)?'风险预警':/融资|IPO|上市/.test(r.event_type)?'融资/IPO':r.event_type||'其他');
    type.innerHTML=options(['',type.value,...types.sort()],type.value,'全部类型');
    sector.innerHTML=options(['',sector.value,...historyRows.flatMap(A.sectors).sort()],sector.value,'全部赛道');
  }
  function values(){return {q:field('radar-filter-input').value.trim(),company:field('radar-company').value.trim(),region:field('radar-region').value,type:field('radar-type').value,sector:field('radar-sector').value,from:field('radar-from').value,to:field('radar-to').value};}
  function saveScreen(){
    if(!activeKey)return;
    const state={scroll:window.scrollY||0,count:visibleCount,open:[...document.querySelectorAll('[data-event-details][open]')].map(x=>x.dataset.eventDetails),contexts:[...document.querySelectorAll('[data-company-context][open]')].map(x=>x.dataset.companyContext),advanced:field('radar-filter-more')?!field('radar-filter-more').hidden:false};
    screenStates.set(activeKey,state);
    try{sessionStorage.setItem('radar-reading-state',JSON.stringify([...screenStates].slice(-15)));}catch{}
  }
  function restoreScreen(key,target){
    const state=screenStates.get(key);
    if(target){
      const match=currentRows.find(r=>A.anchor(r)===target||generateSafeId(r.company)===target);
      if(match){const el=document.querySelector('[data-row="'+rowKey(match)+'"]');if(el){el.querySelector('details').open=true;el.scrollIntoView({block:'start'});el.classList.add('target-highlight');}}
    }else if(state){window.scrollTo({top:state.scroll||0,behavior:'instant'});}
    syncTimelineMonth();
  }
  function timelineMonths(records){
    const months=new Map();
    records.forEach((r,index)=>{const key=/^\d{4}-\d{2}-\d{2}$/.test(r.date)?r.date.slice(0,7):'undated';if(!months.has(key))months.set(key,{key,index,count:0});months.get(key).count++;});
    return [...months.values()];
  }
  function timelineMarkup(records,opened,target){
    let html='',month='',year='';
    records.forEach((r,i)=>{
      const date=/^\d{4}-\d{2}-\d{2}$/.test(r.date)?r.date:'',key=date?date.slice(0,7):'undated',y=date.slice(0,4);
      if(key!==month){
        if(month)html+='</section>';
        html+='<section class="radar-month-group" id="radar-month-'+esc(key)+'" data-timeline-group="'+esc(key)+'">';
        if(y!==year||!date){html+='<h3 class="radar-timeline-year" tabindex="-1">'+esc(date?y+'年':'未标注日期')+'</h3>';year=y;}
        month=key;
      }
      html+=streamRow(r,opened.has(rowKey(r))||A.anchor(r)===target||generateSafeId(r.company)===target,true,i===0);
    });
    return html+(month?'</section>':'');
  }
  function syncTimelineMonth(){
    const nav=field('radar-month-index');if(!nav)return;
    const groups=[...document.querySelectorAll('[data-timeline-group]')];
    if(!groups.length)return;
    const line=nav.getBoundingClientRect().bottom+24;
    const active=groups.find(group=>group.getBoundingClientRect().bottom>line)||groups[groups.length-1];
    if(nav.dataset.activeMonth===active.dataset.timelineGroup)return;
    nav.dataset.activeMonth=active.dataset.timelineGroup;
    nav.querySelectorAll('[data-timeline-month]').forEach(button=>{const selected=button.dataset.timelineMonth===nav.dataset.activeMonth;button.setAttribute('aria-current',String(selected));if(selected)nav.scrollTo({left:Math.max(0,button.offsetLeft-(nav.clientWidth-button.offsetWidth)/2),behavior:'auto'});});
  }
  function jumpTimelineMonth(month){
    const index=timelineMonths(currentRows).find(item=>item.key===month)?.index;
    if(index===undefined)return;
    saveScreen();visibleCount=Math.max(visibleCount,index+20);showRows(true);
    const group=field('radar-month-'+month);if(!group)return;
    group.scrollIntoView({block:'start',behavior:'auto'});
    group.querySelector('.radar-timeline-stamp time')?.focus({preventScroll:true});
    syncTimelineMonth();saveScreen();
  }
  function showRows(inCompany=false){
    const stream=field('radar-stream');if(!stream)return;
    const saved=screenStates.get(activeKey),opened=new Set(saved?.open||[]),target=params().target;
    const rows=currentRows.slice(0,visibleCount);
    stream.innerHTML=currentRows.length?(inCompany?timelineMarkup(rows,opened,target):rows.map(r=>streamRow(r,opened.has(rowKey(r))||A.anchor(r)===target||generateSafeId(r.company)===target)).join('')):'<p class="radar-empty">'+(inCompany?'暂未收录企业动态。':'没有符合条件的记录。可调整关键词、企业或日期范围。')+'</p>';
    const more=document.querySelector('[data-history-more]');if(more)more.hidden=visibleCount>=currentRows.length;
    const status=field('radar-result-status');if(status)status.textContent='共 '+currentRows.length+' 条'+(visibleCount<currentRows.length?' · 已显示 '+Math.min(visibleCount,currentRows.length)+' 条':'');
    stream.querySelectorAll('[data-event-details][open]').forEach(details=>hydrateRecord(details.closest('[data-row]')));
    if(inCompany)syncTimelineMonth();
  }
  function syncHeader(){
    const share=document.querySelector('.radar-share-header');if(!share)return;
    const r=Router.getRoute();share.hidden=!['/','/today','/company','/briefing'].includes(r)||(r==='/today'&&params().search==='all');
  }
  async function filter(changeURL=true){
    if(!field('radar-history-filter'))return;
    const sequence=++filterSequence,scope=field('radar-scope').value,f=values(),day=params().date||window.RadarData.manifest.today;
    if(scope==='today'){f.from=day;f.to=day;}
    if(scope==='all'){f.from='';f.to='';}
    if(scope==='week'){const d=new Date(window.RadarData.manifest.today+'T00:00:00Z');f.to=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()-6);f.from=d.toISOString().slice(0,10);}
    if(changeURL){
      renderSequence++;
      const p={search:'all'};for(const [k,v] of Object.entries(f))if(v)p[k]=v;
      history.replaceState(history.state,'',routeLink('/today',p));activeKey=location.hash;visibleCount=20;syncHeader();
    }
    field('radar-filter-context').textContent=[f.from===f.to&&f.from?f.from:(f.from||f.to?(f.from||'最早')+' 至 '+(f.to||'最新'):'全部日期'),f.company||'全部企业',f.region,f.type,f.sector].filter(Boolean).join(' · ');
    const status=field('radar-result-status');status.textContent='正在读取动态…';
    if(f.from&&f.to&&f.from>f.to){currentRows=[];showRows();status.textContent='开始日期不能晚于结束日期。';return;}
    try{
      const records=await (f.company?readCompany(f.company):readHistory());
      if(sequence!==filterSequence||Router.getRoute()!=='/today'||!field('radar-stream'))return;
      populateFilters();currentRows=A.search(records,f);showRows();
      if(!changeURL)requestAnimationFrame(()=>restoreScreen(activeKey,params().target));
    }catch{if(sequence===filterSequence&&field('radar-result-status')){field('radar-stream').innerHTML='<button class="radar-text-link" data-retry-history type="button">重新读取</button>';field('radar-result-status').textContent='历史记录暂时无法读取，请重试。';}}
  }
  function companyPage(name,records){
    const canonical=A.canonical(name),all=records.filter(r=>A.canonical(r.company)===canonical),grouped=A.grouped(all);
    currentRows=grouped;
    const latest=all[0],names=[...new Set(all.map(r=>r.company))],entity=(window.RadarData.manifest.reading_entities||[]).find(e=>e.name===canonical);
    const refs=window.RadarData.manifest.company_briefings?.[canonical]||[];
    const months=timelineMonths(grouped),multiYear=new Set(months.map(item=>item.key.slice(0,4))).size>1,contexts=new Set(screenStates.get(activeKey)?.contexts||[]);
    const monthIndex=months.length>1?'<nav id="radar-month-index" class="radar-month-index" aria-label="按收录月份定位">'+months.map(item=>'<button type="button" data-timeline-month="'+esc(item.key)+'" aria-label="定位'+esc(item.key==='undated'?'未标注日期':item.key.slice(0,4)+'年'+Number(item.key.slice(5))+'月')+'" aria-current="false">'+esc(item.key==='undated'?'未标注日期':(multiYear?item.key.slice(0,4)+'年 ':'')+Number(item.key.slice(5))+'月')+'</button>').join('')+'</nav>':'';
    return '<div class="radar-company-view'+(months.length<2?' radar-single-month':'')+'"><div class="radar-page-heading"><h2>🏢 企业追踪</h2><a class="radar-text-link radar-back-button" href="#'+esc(safeBack(params().back))+'">← 返回</a></div><div class="radar-company-heading"><h2>'+esc(canonical)+'</h2>'+
      '<p>'+esc(latest?[latest.sector,latest.location].filter(Boolean).join(' · '):'暂未收录企业动态')+'</p><div class="radar-company-reading-row"><p>'+grouped.length+' 项动态'+(all.length!==grouped.length?' · '+all.length+' 条收录记录':'')+' · 按收录日期排列</p>'+(window.RadarInterpretation?.control(canonical)||'')+'</div><div class="radar-company-utilities">'+
      (all.some(row=>row.identity_status==='ambiguous')?'<span>同名主体待确认，记录分别保留</span>':'')+
      (names.length>1?'<details class="radar-company-context" data-company-context="names" '+(contexts.has('names')?'open':'')+'><summary>归集名称 '+names.length+'</summary><p>'+names.map(esc).join('、')+'</p>'+(entity&&A.safeURL(entity.source)?'<a href="'+esc(entity.source)+'" target="_blank" rel="noopener noreferrer">名称沿革依据</a>':'')+'</details>':'')+
      (refs.length?'<details class="radar-company-context" data-company-context="briefings" '+(contexts.has('briefings')?'open':'')+'><summary>简报收录 '+refs.length+'</summary><div class="radar-brief-links">'+refs.slice().reverse().map(b=>'<a href="'+esc(routeLink('/briefing',{type:b.type,id:b.id,back:location.hash.slice(1)}))+'">'+esc((b.type==='weekly'?'周简报 ':'月简报 ')+b.id)+'</a>').join('')+'</div></details>':'')+'</div>'+(window.RadarInterpretation?.panel(canonical)||'')+'</div>'+monthIndex+
      '<div id="radar-stream" class="radar-timeline" aria-label="企业历史动态与研判"></div><button class="radar-more" type="button" data-history-more hidden>再显示20条</button></div>';
  }
  // One route owner prevents late responses from replacing a newer screen.
  renderPage=async function(){
    saveScreen();clearTimeout(filterTimer);filterSequence++;
    const seq=++renderSequence,key=location.hash||'#/',r=Router.getRoute(),p=params(),app=field('app-content');activeKey=key;
    const saved=screenStates.get(key);visibleCount=saved?.count||20;
    Router.updateNavActive();syncHeader();
    if(!window.RadarData.loaded){app.innerHTML=Views.loading();return;}
    if(window.RadarData.error){app.innerHTML=Views.error(esc(window.RadarData.error.message));return;}
    const m=window.RadarData.manifest;
    const mount=html=>{if(seq!==renderSequence)return false;app.innerHTML=html;return true;};
    window.scrollTo({top:0,behavior:'instant'});
    try{
      if(r==='/')mount(Views.home(m));
      else if(r==='/calendar')mount(Views.calendar(m,p.month));
      else if(r==='/today'){
        const day=p.date||m.today;mount(toolbar(p,day));
        if(saved){field('radar-filter-more').hidden=!saved.advanced;document.querySelector('[data-toggle-filter]').setAttribute('aria-expanded',String(saved.advanced));}
        if(p.search==='all'){await filter(false);return;}
        field('radar-filter-context').textContent=day+' · 全部企业';field('radar-result-status').textContent='正在读取动态…';
        const data=await loadDailyData(day);if(seq!==renderSequence)return;
        currentRows=dailyRows(data,day);showRows();
      }else if(r==='/company'){
        mount('<div class="radar-page-heading"><h2>🏢 企业追踪</h2><a class="radar-text-link radar-back-button" href="#'+esc(safeBack(p.back))+'">← 返回</a></div><div class="radar-company-heading"><h2>'+esc(A.canonical(p.name||''))+'</h2><p role="status">正在读取企业记录…</p></div>'+Views.loading());const records=await readCompany(p.name||'');if(seq!==renderSequence)return;
        mount(companyPage(p.name||'',records));showRows(true);
      }else if(r==='/weekly'){
        const week=p.week||m.current_week;mount(Views.loading());
        const data=week===m.current_week&&m.summary?.week?m:await loadWeeklyData(week);
        if(seq!==renderSequence)return;mount(Views.weekly(data,m.available_weeks||[]));
      }else if(r==='/briefing'){
        const type=p.type||'weekly',aliases=m.briefing_aliases||{},available=(m.briefings?.[type]||[]).filter(id=>!aliases[id]),id=p.id||available[0];
        if(!id)throw Error('暂无简报数据');mount(Views.loading());
        const data=await loadBriefingData(type,aliases[id]||id);if(seq!==renderSequence)return;
        mount((p.back?'<a class="radar-text-link radar-back" href="#'+esc(safeBack(p.back))+'">← 返回企业记录</a>':'')+Views.briefing(data,available,type));
      }else throw Error('页面未找到');
      if(seq===renderSequence)requestAnimationFrame(()=>restoreScreen(key,p.target));
    }catch(error){if(seq===renderSequence){mount('<div class="radar-empty" role="alert">'+esc(error.message||'内容暂时无法读取')+'<p><button class="radar-text-link" type="button" data-retry-page>重新读取</button> · <a href="#/today">返回动态</a></p></div>');}}
  };
  // URLSearchParams also correctly decodes spaces and names containing '&'.
  Router.getQueryParams=function(){
    const p=Object.fromEntries(new URLSearchParams((location.hash.split('?')[1]||'')));
    if(!p.search&&['q','company','region','type','sector','from','to'].some(key=>p[key])){
      p.search='all';
      if(p.date&&!p.from&&!p.to){p.from=p.date;p.to=p.date;}
    }
    return p;
  };
  const nav=Router.updateNavActive;
  Router.updateNavActive=function(){nav.call(this);if(this.getRoute()==='/company'){document.querySelector('[data-route="/today"]')?.classList.add('active');}};
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-retry-page]'))renderPage();
    const compact=e.target.closest('[data-company-card]');if(compact)Router.navigate(companyLink(compact.dataset.companyCard).slice(1));
    const toggle=e.target.closest('[data-toggle-filter]');
    if(toggle){const box=field('radar-filter-more');box.hidden=!box.hidden;toggle.setAttribute('aria-expanded',String(!box.hidden));if(!box.hidden){if(params().search!=='all'){field('radar-scope').value='all';filter();}else readHistory().then(populateFilters).catch(()=>{});}saveScreen();}
    if(e.target.closest('[data-clear-filter]')){['radar-filter-input','radar-company','radar-region','radar-type','radar-sector','radar-from','radar-to'].forEach(id=>field(id).value='');field('radar-scope').value='all';field('radar-date-range').hidden=true;filter();}
    if(e.target.closest('[data-retry-history]'))filter(false);
    if(e.target.closest('[data-retry-record]'))hydrateRecord(e.target.closest('[data-row]'));
    const month=e.target.closest('[data-timeline-month]');if(month)jumpTimelineMonth(month.dataset.timelineMonth);
    const expand=e.target.closest('[data-event-details]>summary')||e.target.closest('[data-expand-record]');
    if(expand){
      e.preventDefault();
      const details=expand.matches?.('[data-expand-record]')?expand.closest('[data-row]').querySelector('[data-event-details]'):expand.parentElement;
      details.open=true;
      details.querySelector('.radar-event-body').focus({preventScroll:true});
    }
    const collapse=e.target.closest('[data-collapse-record]');
    if(collapse){
      const details=collapse.closest('[data-event-details]'),article=details.closest('[data-row]');
      details.open=false;
      details.querySelector('summary').focus({preventScroll:true});
      if(article.getBoundingClientRect().top<64)article.scrollIntoView({block:'start',behavior:'auto'});
      saveScreen();
    }
    if(e.target.closest('[data-history-more]')){saveScreen();visibleCount+=20;showRows(Router.getRoute()==='/company');}
  });
  document.addEventListener('toggle',e=>{if(e.target.matches?.('[data-event-details]')&&e.target.open)hydrateRecord(e.target.closest('[data-row]'));if(e.target.matches?.('[data-company-context]')&&e.target.isConnected)saveScreen();},true);
  document.addEventListener('keydown',e=>{const compact=e.target.closest('[data-company-card]');if(compact&&(e.key==='Enter'||e.key===' ')){e.preventDefault();Router.navigate(companyLink(compact.dataset.companyCard).slice(1));}});
  document.addEventListener('submit',e=>{if(e.target.id==='radar-history-filter'){e.preventDefault();clearTimeout(filterTimer);filter();}});
  document.addEventListener('input',e=>{
    if(['radar-filter-input','radar-company'].includes(e.target.id)){if(params().search!=='all')field('radar-scope').value='all';clearTimeout(filterTimer);filterTimer=setTimeout(()=>filter(),180);}
    if(['radar-from','radar-to'].includes(e.target.id))filter();
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='radar-scope'){
      const custom=e.target.value==='custom';field('radar-date-range').hidden=!custom;
      if(custom){field('radar-filter-more').hidden=false;document.querySelector('[data-toggle-filter]').setAttribute('aria-expanded','true');field('radar-from').focus();}
      filter();
    }else if(['radar-company','radar-region','radar-type','radar-sector','radar-from','radar-to'].includes(e.target.id))filter();
  });
  document.addEventListener('DOMContentLoaded',()=>{history.scrollRestoration='manual';try{for(const [k,v] of JSON.parse(sessionStorage.getItem('radar-reading-state')||'[]'))screenStates.set(k,v);}catch{}});
  window.addEventListener('pagehide',saveScreen);
  let timelineScrollPending=false;
  window.addEventListener('scroll',()=>{if(!field('radar-month-index')||timelineScrollPending)return;timelineScrollPending=true;requestAnimationFrame(()=>{timelineScrollPending=false;syncTimelineMonth();});},{passive:true});
  window.RadarReading={eventLink,companyLink,streamRow,dailyRows,readCompany,companyPage,timelineMonths,jumpTimelineMonth};
})();
