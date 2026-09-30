/* Integrate reading flows while preserving the original cards and government briefings. */
(function () {
  'use strict';
  const A=window.RadarHistory;
  const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=()=>Router.getQueryParams();
  const routeLink=(route,q={})=>'#'+route+(Object.keys(q).length?'?'+new URLSearchParams(q):'');
  let historyPromise,historyRows,renderSequence=0,filterSequence=0,currentRows=[],visibleCount=20,activeKey='',filterTimer;
  const screenStates=new Map();
  const field=id=>document.getElementById(id);
  const safeBack=value=>/^\/(?:today|company|calendar|weekly|briefing)?(?:\?|$)/.test(value||'')?value:'/today';
  function companyLink(name){return routeLink('/company',{name:A.canonical(name),back:safeBack(location.hash.slice(1)||'/')});}
  function readHistory(){
    if(!historyPromise){
      const version=window.RadarData.manifest.history_version||'';
      historyPromise=fetch('./data/company-history.json?v='+encodeURIComponent(version)).then(r=>{if(!r.ok)throw Error('历史记录暂时无法读取');return r.json();}).then(h=>{historyRows=A.rows(h);return historyRows;}).catch(e=>{historyPromise=null;throw e;});
    }
    return historyPromise;
  }
  const originalLoad=loadDailyData;
  loadDailyData=function(day){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return Promise.reject(Error('日期格式不正确'));
    const p=params(),version=(Router.getRoute()==='/today'&&p.date===day&&p.v)||window.RadarData.manifest?.daily_versions?.[day];
    if(!version)return originalLoad(day);
    if(!/^[a-f0-9]{64}$/.test(version))return Promise.reject(Error('版本链接不正确'));
    return fetch('./data/releases/'+day+'/'+version+'.json').then(r=>{if(!r.ok)throw Error('该期内容暂时无法读取，请稍后重试');return r.json();});
  };
  function trackButton(name){return '<a class="radar-track" href="'+esc(companyLink(name))+'" aria-label="追踪'+esc(name)+'，查看全部已收录信息">追踪</a>';}
  function extendCard(html,item,compact){
    const name=item.company_name||item.company||'';
    if(A.region(item)==='海外')html=html.replace(/全国标杆/g,'海外参考').replace(/🌐标杆/g,'🌐海外');
    if(compact){return html.replace(/onclick="Router.navigate\([^\n]*?\)"/,'role="link" tabindex="0" data-company-card="'+esc(name)+'"');}
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
    html=html.replace(/<div class="mb-3 ml-2 flex justify-between items-start">[\s\S]*?(?=<div class="flex flex-wrap gap-1.5 mb-3.5">)/,'');
    if(r.kind==='risk')html=html.replace(/<div class="flex items-start gap-2 mb-3">[\s\S]*?(?=<div class="flex flex-wrap gap-1.5 mb-3.5">)/,'');
    return html;
  }
  function rowKey(r){return r.date+'-'+A.anchor(r);}
  function streamRow(r,open=false,inCompany=false){
    const key=rowKey(r),risk=r.kind==='risk'||/风险|负面/.test(r.event_type||''),type=risk?'风险预警':r.event_type||'其他';
    const originals=(r.observations||[]).length>1?'<details class="radar-observations"><summary>'+r.observations.length+' 条收录记录与来源</summary>'+r.observations.map(o=>'<p>'+esc(o.date)+' · '+esc(o.company)+' · '+esc(o.source||'来源见原文')+' <a href="'+esc(eventLink(o))+'">查看记录</a>'+(A.safeURL(o.link)?' · <a target="_blank" rel="noopener noreferrer" href="'+esc(A.safeURL(o.link))+'">原文</a>':'')+'</p>').join('')+'</details>':'';
    return '<article class="radar-stream-item '+(risk?'radar-risk-item':'')+'" data-row="'+esc(key)+'">'+
      '<div class="radar-stream-meta"><span>收录 '+esc(r.date)+' · '+esc(type)+'</span>'+(Number.isFinite(r.score)?'<span>当期评分 '+esc(r.score)+'</span>':'')+'</div>'+
      (inCompany?'':'<h3><a href="'+esc(companyLink(r.company))+'">'+esc(r.company)+'</a></h3>')+
      '<div class="radar-source-row"><span class="radar-source-label">📰 '+esc(r.source||'来源见原文')+'</span>'+(inCompany?'':trackButton(r.company))+'</div>'+
      '<details class="radar-event-details" data-event-details="'+esc(key)+'" '+(open?'open':'')+'><summary aria-label="展开或收起'+esc(r.company)+'在'+esc(r.date)+'的全文与研判"><p class="radar-event-excerpt">'+esc(r.title||r.article_title||'查看原始记录')+'</p><span class="radar-expand-label"><span class="radar-when-closed">全文与研判</span><span class="radar-when-open">收起全文</span></span></summary><div class="radar-event-body">'+fullCard(risk?{...r,kind:'risk'}:r)+'</div></details>'+originals+'</article>';
  }
  function toolbar(p,day){
    const custom=p.from||p.to,advanced=false;
    return '<div class="radar-page-heading"><h2>企业动态</h2><a class="radar-text-link" href="#/calendar">日历</a></div>'+
      '<form id="radar-history-filter" class="radar-filter" role="search" aria-label="搜索全部企业和日期">'+
      '<label class="radar-sr-only" for="radar-filter-input">搜索全部企业、赛道或事件</label><input id="radar-filter-input" type="search" placeholder="搜索全部企业、赛道或事件" value="'+esc(p.q||'')+'" autocomplete="off">'+
      '<div class="radar-filter-bar"><label class="radar-sr-only" for="radar-scope">收录日期范围</label><select id="radar-scope"><option value="today"'+(p.search!=='all'?' selected':'')+'>'+esc(day===window.RadarData.manifest.today?'今日':day)+'</option><option value="week">近7天</option><option value="all"'+(p.search==='all'&&!custom?' selected':'')+'>全部日期</option><option value="custom"'+(custom?' selected':'')+'>自定义日期</option></select><button type="button" data-toggle-filter aria-controls="radar-filter-more" aria-expanded="'+advanced+'">筛选</button><button type="button" data-clear-filter>重置</button></div>'+
      '<div id="radar-filter-more" '+(advanced?'':'hidden')+'><label for="radar-company">企业（按主体筛选）</label><input id="radar-company" list="radar-companies" placeholder="全部企业，输入名称选择" value="'+esc(p.company||'')+'" autocomplete="off"><datalist id="radar-companies"></datalist>'+
      '<div class="radar-filter-grid"><label for="radar-region">地域<select id="radar-region">'+options(['','杭州','国内其他','海外','待核实'],p.region,'全部地域')+'</select></label><label for="radar-type">事件类型<select id="radar-type">'+options(['',...(p.type?[p.type]:[])],p.type,'全部类型')+'</select></label></div>'+
      '<label for="radar-sector">赛道<select id="radar-sector">'+options(['',...(p.sector?[p.sector]:[])],p.sector,'全部赛道')+'</select></label>'+
      '<fieldset id="radar-date-range" '+(custom?'':'hidden')+'><legend>按收录日期筛选</legend><div class="radar-filter-grid"><label for="radar-from">开始日期<input id="radar-from" type="date" value="'+esc(p.from||'')+'"></label><label for="radar-to">结束日期<input id="radar-to" type="date" value="'+esc(p.to||'')+'"></label></div></fieldset></div>'+
      '<p id="radar-filter-context" class="radar-filter-context"></p></form><p id="radar-result-status" class="radar-filter-result" role="status" aria-live="polite"></p><div id="radar-stream"></div><button class="radar-more" type="button" data-history-more hidden>再显示20条</button>';
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
    const state={scroll:window.scrollY||0,count:visibleCount,open:[...document.querySelectorAll('[data-event-details][open]')].map(x=>x.dataset.eventDetails),advanced:field('radar-filter-more')?!field('radar-filter-more').hidden:false};
    screenStates.set(activeKey,state);
    try{sessionStorage.setItem('radar-reading-state',JSON.stringify([...screenStates].slice(-15)));}catch{}
  }
  function restoreScreen(key,target){
    const state=screenStates.get(key);
    if(target){
      const match=currentRows.find(r=>A.anchor(r)===target||generateSafeId(r.company)===target);
      if(match){const el=document.querySelector('[data-row="'+rowKey(match)+'"]');if(el){el.querySelector('details').open=true;el.scrollIntoView({block:'start'});el.classList.add('target-highlight');}}
    }else if(state){window.scrollTo({top:state.scroll||0,behavior:'instant'});}
  }
  function showRows(inCompany=false){
    const stream=field('radar-stream');if(!stream)return;
    const saved=screenStates.get(activeKey),opened=new Set(saved?.open||[]),target=params().target;
    stream.innerHTML=currentRows.length?currentRows.slice(0,visibleCount).map((r,i)=>streamRow(r,opened.has(rowKey(r))||(inCompany&&i===0&&!saved)||A.anchor(r)===target||generateSafeId(r.company)===target,inCompany)).join(''):'<p class="radar-empty">没有符合条件的记录。可调整关键词、企业或日期范围。</p>';
    const more=document.querySelector('[data-history-more]');if(more)more.hidden=visibleCount>=currentRows.length;
    const status=field('radar-result-status');if(status)status.textContent='共 '+currentRows.length+' 条'+(visibleCount<currentRows.length?' · 已显示 '+Math.min(visibleCount,currentRows.length)+' 条':'');
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
      const records=await readHistory();
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
    return '<div class="radar-company-heading"><a class="radar-text-link" href="#'+esc(safeBack(params().back))+'">← 返回</a><h2>'+esc(canonical)+'</h2>'+
      '<p>'+esc(latest?[latest.sector,latest.location].filter(Boolean).join(' · '):'暂未收录企业动态')+'</p><p>'+grouped.length+' 项动态'+(all.length!==grouped.length?' · '+all.length+' 条收录记录':'')+' · 按收录日期排列</p></div>'+
      (names.length>1?'<details class="radar-company-context"><summary>已归集的记录名称（'+names.length+'）</summary><p>'+names.map(esc).join('、')+'</p>'+(entity&&A.safeURL(entity.source)?'<a href="'+esc(entity.source)+'" target="_blank" rel="noopener noreferrer">名称沿革依据</a>':'')+'</details>':'')+
      (refs.length?'<details class="radar-company-context"><summary>简报收录（'+refs.length+' 期）</summary><div class="radar-brief-links">'+refs.slice().reverse().map(b=>'<a href="'+esc(routeLink('/briefing',{type:b.type,id:b.id,back:location.hash.slice(1)}))+'">'+esc((b.type==='weekly'?'周简报 ':'月简报 ')+b.id)+'</a>').join('')+'</div></details>':'')+
      '<div id="radar-stream"></div><button class="radar-more" type="button" data-history-more hidden>再显示20条</button>';
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
        mount(Views.loading());const records=await readHistory();if(seq!==renderSequence)return;
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
  Router.getQueryParams=function(){return Object.fromEntries(new URLSearchParams((location.hash.split('?')[1]||'')));};
  const nav=Router.updateNavActive;
  Router.updateNavActive=function(){nav.call(this);if(this.getRoute()==='/company'){document.querySelector('[data-route="/today"]')?.classList.add('active');}};
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-retry-page]'))renderPage();
    const compact=e.target.closest('[data-company-card]');if(compact)Router.navigate(companyLink(compact.dataset.companyCard).slice(1));
    const toggle=e.target.closest('[data-toggle-filter]');
    if(toggle){const box=field('radar-filter-more');box.hidden=!box.hidden;toggle.setAttribute('aria-expanded',String(!box.hidden));if(!box.hidden){if(params().search!=='all'){field('radar-scope').value='all';filter();}else readHistory().then(populateFilters).catch(()=>{});}saveScreen();}
    if(e.target.closest('[data-clear-filter]')){['radar-filter-input','radar-company','radar-region','radar-type','radar-sector','radar-from','radar-to'].forEach(id=>field(id).value='');field('radar-scope').value='all';field('radar-date-range').hidden=true;filter();}
    if(e.target.closest('[data-retry-history]'))filter(false);
    if(e.target.closest('[data-history-more]')){saveScreen();visibleCount+=20;showRows(Router.getRoute()==='/company');}
  });
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
  window.RadarReading={eventLink,companyLink,streamRow,dailyRows};
})();
