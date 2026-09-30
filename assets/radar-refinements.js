/* Targeted corrections within the original page. No replacement layout. */
(function () {
  'use strict';
  function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  let historyPromise, historyRows, resultRows=[];
  let requestSeq=0, visibleCount=20;
  const archive=window.RadarHistory;
  function withAnchor(html,item){return html.replace(/(<div id="[^"]+"[^>]*>)/, '$1<span class="radar-event-anchor" id="'+archive.anchor(item)+'" aria-hidden="true"></span>');}
  function readHistory(){
    if(!historyPromise){
      const version=window.RadarData.manifest.history_version||window.RadarData.manifest.generated_at||'';
      historyPromise=fetch('./data/company-history.json?v='+encodeURIComponent(version)).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{historyPromise=null;throw e;});
    }
    return historyPromise;
  }
  const originalLoad=loadDailyData;
  loadDailyData=function(day){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return Promise.reject(Error('日期格式不正确'));
    const query=Router.getQueryParams();
    const version=(Router.getRoute()==='/today'&&query.date===day&&query.v)||window.RadarData.manifest?.daily_versions?.[day];
    if(!version)return originalLoad(day);
    if(!/^[a-f0-9]{64}$/.test(version))return Promise.reject(Error('版本链接不正确'));
    return fetch('./data/releases/'+day+'/'+version+'.json').then(r=>{if(!r.ok)throw Error('该期内容暂时无法读取，请稍后重试');return r.json();});
  };
  const renderCard=renderCompanyCard;
  renderCompanyCard=function(item,index,compact){
    let html=renderCard.apply(this,arguments);
    const place=item.geography||( /美国|英国|德国|法国|日本|韩国|新加坡|加拿大|以色列|硅谷|旧金山/.test(item.location||'')?'海外参考':null );
    const region=archive.region(item);
    html=html.replace(/id="(card-[^"]+)"/, 'id="$1" data-region="'+region+'" data-event-type="'+esc(item.event_type||'其他')+'"');
    if(place==='海外参考')html=html.replace(/全国标杆/g,'海外参考').replace(/🌐标杆/g,'🌐海外');
    if(!compact){
      const name=item.company_name||item.company||'';
      // Keep the company title free of controls; source and history share one row.
      const track='<button type="button" class="radar-track" data-track-company="'+esc(name)+'" aria-label="查看'+esc(name)+'的历史动态">追踪</button>';
      html=html.replace(/(<span class="[^"]*">📰 [\s\S]*?<\/span>)/, '<div class="radar-source-row">$1'+track+'</div>');
      html=html.replace('<div class="mb-3 ml-2 flex justify-between items-start"><div>', '<div class="mb-3 ml-2 flex justify-between items-start"><div class="min-w-0 flex-1 pr-2">');
      const occurred=item.event_date||item.event_time_evidence?.event_date;
      const published=item.published_date;
      const parts=[];if(occurred)parts.push('事件 '+occurred);if(published)parts.push('报道 '+published);
      if(parts.length)html=html.replace('<div class="flex items-center gap-2 mt-4','<div class="radar-dates">'+parts.map(esc).join(' · ')+'</div><div class="flex items-center gap-2 mt-4');
    }
    return compact?html:withAnchor(html,item);
  };
  const negativeCard=renderNegativeCard;
  renderNegativeCard=function(item,compact){const html=negativeCard.apply(this,arguments);return compact?html:withAnchor(html,item);};
  const oldToday=Views.today;
  Views.today=function(data,day){
    const query=Router.getQueryParams(),opened=query.search==='all';
    let html=oldToday.apply(this,arguments).replace(/份深度研报/g,'条企业动态').replace('这天没有企业动态，休息一下吧','本轮未收录企业动态');
    html=html.replace('</h2>',' <button class="radar-filter-toggle" type="button" data-toggle-filter aria-controls="radar-history-filter" aria-expanded="'+opened+'">'+(opened?'收起筛选':'筛选')+'</button></h2>');
    html=html.replace('<p class="text-[11px] text-gray-500 font-medium mt-1">','<p id="radar-day-summary" '+(opened?'hidden ':'')+'class="text-[11px] text-gray-500 font-medium mt-1">');
    const regions=['杭州','国内其他','海外','待核实'];
    const panel='<section id="radar-history-filter" class="radar-filter" '+(opened?'':'hidden')+' aria-label="全部企业与历史动态筛选">'+
      '<form role="search" aria-label="搜索全部企业和日期">'+
      '<label for="radar-filter-input">搜索全部企业、赛道或事件</label><input id="radar-filter-input" type="search" placeholder="企业、赛道、事件" value="'+esc(query.q||'')+'" autocomplete="off">'+
      '<div class="radar-filter-grid"><label for="radar-region">地域<select id="radar-region"><option value="">全部地域</option>'+regions.map(r=>'<option'+(query.region===r?' selected':'')+'>'+r+'</option>').join('')+'</select></label>'+
      '<label for="radar-type">事件类型<select id="radar-type"><option value="">全部类型</option>'+(query.type?'<option selected>'+esc(query.type)+'</option>':'')+'</select></label></div>'+
      '<fieldset><legend>收录日期（不填为全部日期）</legend><div class="radar-filter-grid"><label for="radar-from">开始日期<input id="radar-from" type="date" value="'+esc(query.from||'')+'"></label><label for="radar-to">结束日期<input id="radar-to" type="date" value="'+esc(query.to||'')+'"></label></div></fieldset>'+
      '<div class="radar-filter-actions"><span>默认检索全部历史记录</span><button type="button" data-clear-filter>清空条件</button></div></form>'+
      '<p class="radar-filter-result" role="status" aria-live="polite"></p><div data-history-results></div><button type="button" data-history-more hidden>再显示 20 条</button></section>';
    // The daily reading view remains intact and reappears when search is closed.
    html=html.replace('</p></div></div>','</p></div></div>'+panel+'<div id="radar-daily-content" '+(opened?'hidden':'')+'>');
    html=html.replace(/<\/div>$/,'</div></div>');
    if(opened)setTimeout(()=>{const box=document.getElementById('radar-history-filter');if(Router.getRoute()==='/today'&&box&&!box.hidden)filter();},0);
    return html;
  };
  const oldCalendar=Views.calendar;
  Views.calendar=function(data,month){
    let html=oldCalendar.apply(this,arguments);
    html=html.replace(/(\d+)家<\/span>/g,'$1条</span>').replace('本月扫描总数','本月收录动态');
    const selected=month||data.today.slice(0,7),count=data.monthly_counts?.[selected];
    if(count)html=html.replace('本月收录动态','本月 '+count.companies+' 家企业 / '+count.events+' 条动态');
    // Calendar aggregate still uses the original typography and existing cell.
    html=html.replace(/(text-xl font-black text-gray-800">\d+<span class="text-xs font-normal text-gray-400 ml-1">)家/g,'$1条');
    html=html.replace(/<button onclick="Router.navigate\('\/calendar\?month=([^']+)'\)"/g,'<button aria-label="查看 $1 月" onclick="Router.navigate(\'/calendar?month=$1\')"');
    return html;
  };
  const oldWeekly=Views.weekly;
  Views.weekly=function(data,weeks){
    const copy=JSON.parse(JSON.stringify(data));
    const week=data.year!==undefined?data.year+'-W'+String(data.week).padStart(2,'0'):data.current_week;
    const count=window.RadarData.manifest.weekly_counts?.[week];
    if(count){if(copy.year!==undefined)copy.summary.total_companies=count.companies;else if(copy.summary?.week)copy.summary.week.total_companies=count.companies;}
    return oldWeekly.call(this,copy,weeks);
  };
  function filterValues(){
    return {q:document.getElementById('radar-filter-input').value.trim(),region:document.getElementById('radar-region').value,type:document.getElementById('radar-type').value,
      from:document.getElementById('radar-from').value,to:document.getElementById('radar-to').value};
  }
  function rememberFilter(opened){
    const params=new URLSearchParams(Router.getQueryParams());
    if(opened){params.set('search','all');params.delete('target');Object.entries(filterValues()).forEach(([k,v])=>{if(v)params.set(k,v);else params.delete(k);});}
    else ['search','q','region','type','from','to'].forEach(k=>params.delete(k));
    const suffix=params.toString();history.replaceState(null,'',location.pathname+location.search+'#/today'+(suffix?'?'+suffix:''));
    const share=document.querySelector('.radar-share-header');if(share)share.hidden=opened;
  }
  function resultLink(row){
    const query=new URLSearchParams({date:row.date,target:archive.anchor(row)});
    const version=window.RadarData.manifest.daily_versions?.[row.date];if(version)query.set('v',version);
    return '#/today?'+query.toString();
  }
  function showResults(){
    const box=document.getElementById('radar-history-filter');if(!box||box.hidden)return;
    const shown=resultRows.slice(0,visibleCount);
    box.querySelector('[data-history-results]').innerHTML=shown.length?shown.map(row=>{
      const link=esc(resultLink(row));
      return '<article class="radar-history-result"><div class="radar-history-date">收录 '+esc(row.date)+' · '+esc(row.kind==='risk'?'风险预警':row.event_type||'其他')+'</div>'+
        '<h3><a href="'+link+'">'+esc(row.company)+'</a></h3>'+
        '<p>'+esc(row.title||row.article_title||'查看当日记录')+'</p>'+
        '<div class="radar-history-meta">'+[row.sector,row.location].filter(Boolean).map(esc).join(' · ')+'</div>'+
        '<div class="radar-history-actions"><span>'+esc(row.source||'来源见全文')+'</span><a href="'+link+'">全文与研判 →</a></div></article>';
    }).join(''):'<p class="radar-history-empty">没有符合条件的记录，可调整关键词或日期范围。</p>';
    box.querySelector('[role="status"]').textContent='找到 '+resultRows.length+' 条动态'+(shown.length<resultRows.length?' · 已显示 '+shown.length+' 条':'');
    box.querySelector('[data-history-more]').hidden=visibleCount>=resultRows.length;
  }
  async function filter(){
    const box=document.getElementById('radar-history-filter');if(!box||box.hidden)return;
    const sequence=++requestSeq,values=filterValues();visibleCount=20;rememberFilter(true);
    const status=box.querySelector('[role="status"]'),results=box.querySelector('[data-history-results]'),more=box.querySelector('[data-history-more]');
    if(values.from&&values.to&&values.from>values.to){results.innerHTML='';more.hidden=true;status.textContent='开始日期不能晚于结束日期。';return;}
    status.textContent='正在查询全部历史记录…';more.hidden=true;
    try{
      if(!historyRows)historyRows=archive.rows(await readHistory());
      if(sequence!==requestSeq||box!==document.getElementById('radar-history-filter')||box.hidden)return;
      const select=document.getElementById('radar-type');
      if(!select.dataset.loaded){
        const types=new Set(historyRows.map(r=>r.event_type||'其他'));if(historyRows.some(r=>r.kind==='risk'))types.add('风险预警');if(values.type)types.add(values.type);
        select.innerHTML='<option value="">全部类型</option>'+[...types].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(t=>'<option>'+esc(t)+'</option>').join('');select.value=values.type;select.dataset.loaded='true';
      }
      resultRows=archive.search(historyRows,values);showResults();
    }catch{
      if(sequence!==requestSeq||box!==document.getElementById('radar-history-filter')||box.hidden)return;
      results.innerHTML='<button type="button" data-retry-history>重新读取</button>';status.textContent='历史记录暂时无法读取，请重试。';
    }
  }
  async function tracking(name,opener){
    let dialog=document.getElementById('radar-tracking');if(!dialog){dialog=document.createElement('dialog');dialog.id='radar-tracking';document.body.appendChild(dialog);}
    dialog.innerHTML='<div class="radar-tracking-heading"><h2>'+esc(name)+'</h2><button type="button" data-close-tracking aria-label="关闭企业追踪">×</button></div><p>正在读取历史动态…</p>';dialog.showModal();dialog.onclose=()=>{if(opener?.isConnected)opener.focus();};
    try{
      const records=(await readHistory())[name]||[];
      if(!dialog.open)return;
      dialog.innerHTML='<div class="radar-tracking-heading"><h2>'+esc(name)+'</h2><button type="button" data-close-tracking aria-label="关闭企业追踪">×</button></div>'+ (records.length?records.slice().reverse().map(r=>'<article><span>'+esc(r.date)+' · '+esc(r.event_type)+'</span><p>'+esc(r.title)+'</p><a href="#/today?date='+encodeURIComponent(r.date)+'&target='+encodeURIComponent(archive.anchor({...r,company:name}))+'" data-close-tracking>查看当日原文与研判 →</a></article>').join(''):'<p>暂未收录其他动态。</p>');
    }catch{dialog.innerHTML='<h2>'+esc(name)+'</h2><p>暂时无法读取历史动态。</p><button type="button" data-close-tracking>关闭</button>';}
  }
  document.addEventListener('click',e=>{
    const track=e.target.closest('[data-track-company]');if(track)tracking(track.dataset.trackCompany,track);
    if(e.target.closest('[data-close-tracking]'))document.getElementById('radar-tracking').close();
    const toggle=e.target.closest('[data-toggle-filter]');if(toggle){
      const box=document.getElementById('radar-history-filter');box.hidden=!box.hidden;
      toggle.setAttribute('aria-expanded',String(!box.hidden));toggle.textContent=box.hidden?'筛选':'收起筛选';
      document.getElementById('radar-daily-content').hidden=!box.hidden;document.getElementById('radar-day-summary').hidden=!box.hidden;
      if(!box.hidden)filter();else{requestSeq++;rememberFilter(false);}
    }
    if(e.target.closest('[data-clear-filter]')){['radar-filter-input','radar-region','radar-type','radar-from','radar-to'].forEach(id=>{document.getElementById(id).value='';});filter();}
    if(e.target.closest('[data-retry-history]'))filter();
    if(e.target.closest('[data-history-more]')){visibleCount+=20;showResults();}
  });
  document.addEventListener('submit',e=>{if(e.target.closest('#radar-history-filter')){e.preventDefault();filter();}});
  document.addEventListener('input',e=>{if(['radar-filter-input','radar-from','radar-to'].includes(e.target.id))filter();});
  document.addEventListener('change',e=>{if(['radar-region','radar-type','radar-from','radar-to'].includes(e.target.id))filter();});
})();
