/* Targeted corrections within the original page. No replacement layout. */
(function () {
  'use strict';
  function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  let historyPromise;
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
    const region=place==='海外参考'?'海外':(/杭州/.test(item.location||'')?'杭州':'国内');
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
    return html;
  };
  const oldToday=Views.today;
  Views.today=function(data,day){
    let html=oldToday.apply(this,arguments).replace(/份深度研报/g,'条企业动态').replace('这天没有企业动态，休息一下吧','本轮未收录企业动态');
    // Search is folded behind one existing-heading action; content stays visible.
    html=html.replace('</h2>',' <button class="radar-filter-toggle" type="button" data-toggle-filter aria-expanded="false">筛选</button></h2>');
    html=html.replace('<div class="animate-fade-in">','<div class="animate-fade-in"><div class="radar-filter" hidden><label for="radar-filter-input">搜索本日企业、赛道或事件</label><input id="radar-filter-input" type="search" placeholder="企业、赛道、事件"><div><label for="radar-region">地域</label><select id="radar-region"><option value="">全部</option><option>杭州</option><option>国内</option><option>海外</option></select><label for="radar-type">类型</label><select id="radar-type"><option value="">全部</option>'+[...new Set((data.targets||[]).map(e=>e.event_type||'其他'))].map(t=>'<option>'+esc(t)+'</option>').join('')+'</select></div><p class="radar-filter-result" role="status"></p></div>');
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
  function filter(){
    const input=document.getElementById('radar-filter-input');if(!input)return;
    const q=input.value.trim().toLowerCase(),region=document.getElementById('radar-region').value,type=document.getElementById('radar-type').value;
    let n=0;document.querySelectorAll('#app-content [id^="card-"]').forEach(card=>{
      const text=card.textContent;
      const match=(!q||text.toLowerCase().includes(q))&&(!region||card.dataset.region===region)&&(!type||card.dataset.eventType===type);
      card.hidden=!match;if(match)n++;
    });document.querySelector('.radar-filter-result').textContent='显示 '+n+' 条动态';
  }
  async function tracking(name,opener){
    let dialog=document.getElementById('radar-tracking');if(!dialog){dialog=document.createElement('dialog');dialog.id='radar-tracking';document.body.appendChild(dialog);}
    dialog.innerHTML='<div class="radar-tracking-heading"><h2>'+esc(name)+'</h2><button type="button" data-close-tracking aria-label="关闭企业追踪">×</button></div><p>正在读取历史动态…</p>';dialog.showModal();dialog.onclose=()=>{if(opener?.isConnected)opener.focus();};
    try{
      if(!historyPromise)historyPromise=fetch('./data/company-history.json').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{historyPromise=null;throw e;});
      const records=(await historyPromise)[name]||[];
      if(!dialog.open)return;
      dialog.innerHTML='<div class="radar-tracking-heading"><h2>'+esc(name)+'</h2><button type="button" data-close-tracking aria-label="关闭企业追踪">×</button></div>'+ (records.length?records.slice().reverse().map(r=>'<article><span>'+esc(r.date)+' · '+esc(r.event_type)+'</span><p>'+esc(r.title)+'</p><a href="#/today?date='+encodeURIComponent(r.date)+'&target='+encodeURIComponent(generateSafeId(name))+'" data-close-tracking>查看当日原文与研判 →</a></article>').join(''):'<p>暂未收录其他动态。</p>');
    }catch{dialog.innerHTML='<h2>'+esc(name)+'</h2><p>暂时无法读取历史动态。</p><button type="button" data-close-tracking>关闭</button>';}
  }
  document.addEventListener('click',e=>{
    const track=e.target.closest('[data-track-company]');if(track)tracking(track.dataset.trackCompany,track);
    if(e.target.closest('[data-close-tracking]'))document.getElementById('radar-tracking').close();
    const toggle=e.target.closest('[data-toggle-filter]');if(toggle){const box=document.querySelector('.radar-filter');box.hidden=!box.hidden;toggle.setAttribute('aria-expanded',String(!box.hidden));if(!box.hidden)box.querySelector('input').focus();else{box.querySelector('input').value='';box.querySelectorAll('select').forEach(s=>s.value='');filter();}}
  });
  document.addEventListener('input',e=>{if(e.target.id==='radar-filter-input')filter();});
  document.addEventListener('change',e=>{if(['radar-region','radar-type'].includes(e.target.id))filter();});
})();
