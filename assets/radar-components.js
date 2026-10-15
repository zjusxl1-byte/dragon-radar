/* Contextual mobile reading, transactional facets and an archived-month wheel. */
(function(){
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const H=window.RadarHistory,I=window.RadarInterpretation;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base=new URL('.',document.currentScript.src);
  let library,session=null,opening=false,serial=0,mountFrame=0,restoringHash=null;
  const load=()=>library||(library=import(new URL('vendor/ionic-components.js',base).href).catch(error=>{library=null;throw error;}));
  const routeOf=anchor=>anchor?.hash?.slice(1)||'';
  function handles(anchor){return !!anchor?.matches('.radar-company-observation,.radar-observation-lead');}
  const routeName=anchor=>H.canonical(new URLSearchParams(routeOf(anchor).split('?')[1]).get('name')||'');
  const roleNames={local_potential:'杭州潜力',local_benchmark:'杭州标杆',external_reference:'外部对标',unresolved:'归属待确认'};

  async function makeSheet(kind,title,source,small=false){
    const expectedHash=location.hash;
    await load();
    if(location.hash!==expectedHash||!source.isConnected)throw new DOMException('Navigation changed','AbortError');
    const modal=document.createElement('ion-modal'),token=++serial;
    modal.className='radar-sheet '+(small?'radar-sheet-small':'radar-sheet-reader');
    modal.mode='ios';modal.breakpoints=small?[0,1]:[0,.65,1];modal.initialBreakpoint=1;
    modal.expandToScroll=false;modal.handle=true;modal.handleBehavior='cycle';modal.animated=!reduced();
    modal.setAttribute('aria-labelledby','radar-sheet-title');
    const frame=document.createElement('div');frame.className='radar-sheet-frame';
    frame.innerHTML='<header class="radar-sheet-header"><div><p class="radar-sheet-eyebrow"></p><h2 id="radar-sheet-title">'+esc(title)+'</h2></div><button type="button" class="radar-sheet-close" data-sheet-close aria-label="'+(kind==='company'?'关闭企业阅读':'取消选择')+'">'+(kind==='company'?'关闭':'取消')+'</button><p class="radar-sheet-meta"></p></header><div class="radar-sheet-controls"></div><ion-content class="radar-sheet-content"><div class="radar-sheet-body"></div></ion-content><footer class="radar-sheet-footer"></footer>';
    modal.append(frame);document.body.append(modal);
    const s={kind,modal,frame,token,source,scroll:scrollY,overflow:document.documentElement.style.overflow,originalState:history.state,originalHash:location.hash,body:frame.querySelector('.radar-sheet-body'),content:frame.querySelector('ion-content'),footer:frame.querySelector('footer')};
    session=s;
    // Ionic sizes its delegate page to the visible sheet breakpoint.
    modal.addEventListener('ionBreakpointDidChange',event=>{modal.dataset.breakpoint=String(event.detail.breakpoint);});
    const panelURL=new URL(location.href),[panelPath,panelQuery]=location.hash.slice(1).split('?'),panelParams=new URLSearchParams(panelQuery);
    panelParams.set('_sheet',String(token));panelURL.hash=panelPath+'?'+panelParams;
    history.pushState({...history.state,radarSheet:token},'',panelURL);
    document.documentElement.style.overflow='hidden';document.body.classList.add('radar-sheet-visible');
    modal.addEventListener('ionModalDidPresent',()=>{modal.dataset.presented='true';modal.querySelector('[data-sheet-close]')?.focus({preventScroll:true});});
    modal.addEventListener('ionModalDidDismiss',()=>{
      s.closed=true;modal.dataset.presented='false';
      if(session===s)session=null;
      document.documentElement.style.overflow=s.overflow;document.body.classList.remove('radar-sheet-visible');
      window.scrollTo({top:s.scroll,behavior:'instant'});
      if(history.state?.radarSheet===token){
        const finish=()=>{if(s.nextRoute){restoringHash=null;Router.navigate(s.nextRoute);}else s.source?.isConnected&&s.source.focus({preventScroll:true});};
        restoringHash=s.originalHash;
        window.addEventListener('popstate',finish,{once:true});history.back();
      }else if(s.nextRoute)Router.navigate(s.nextRoute);
      else s.source?.isConnected&&s.source.focus({preventScroll:true});
      // The inline delegate restores its host after this event; remove on the next task.
      setTimeout(()=>modal.remove(),0);
    },{once:true});
    // Present immediately; the independent data read fills the real loading state.
    s.present=modal.present();
    return s;
  }
  async function closeSheet(route){
    const s=session;if(!s)return;
    if(route)s.nextRoute=route;
    await s.present;
    if(!s.closed)await s.modal.dismiss();
  }
  function fullRoute(anchor){
    const [path,query]=routeOf(anchor).split('?'),q=new URLSearchParams(query);q.delete('reading');
    return path+'?'+q;
  }
  function skeleton(){return '<div class="radar-sheet-loading" role="status"><p>正在读取企业进展与解读…</p><div class="radar-ai-skeleton" aria-hidden="true"><span></span><span></span><span></span></div></div>';}
  function historyMarkup(records){
    if(!records.length)return '<p class="radar-sheet-empty">暂无已收录进展。</p>';
    return '<ol class="radar-quick-history">'+records.map(row=>{
      const text=String(row.title||''),headline=row.event_headline||text.match(/^[\s\S]*?[。！？]/)?.[0]||text;
      const link=H.safeURL(row.link);
      return '<li><div class="radar-quick-time"><time>'+esc(row.date)+'</time><span>'+esc(row.source||'已收录报道')+'</span></div><h3>'+esc(headline)+'</h3><details class="radar-quick-evidence"><summary>材料与来源</summary><p>'+esc(text)+'</p>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">阅读原文 →</a>':'')+'</details></li>';
    }).join('')+'</ol>';
  }
  function choosePane(s,value){
    if(session!==s||!s.readingPane)return;
    const reading=value==='reading'&&s.hasReading;
    s.pane=reading?'reading':'events';
    s.readingPane.hidden=!reading;s.eventsPane.hidden=reading;
    s.segment.value=s.pane;s.body.dataset.pane=s.pane;
    s.content.scrollToTop(0);
    const pane=reading?s.readingPane:s.eventsPane;
    if(!reduced()&&pane.animate)pane.animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});
  }
  function readingMarkup(s,reading){
    if(!reading||reading.source_version===s.entry?.source_version)s.readingPane.querySelectorAll('[data-stale-reading-note]').forEach(node=>node.remove());
    if(reading)s.eventsPane.querySelectorAll('[data-reader-cache-error]').forEach(node=>node.remove());
    s.readingPane.querySelector('.radar-ai-content').innerHTML=reading?I.markup(reading,true):'';
    if(reading){
        const date=document.createElement('p');date.className='radar-reader-date';date.textContent='材料截至 '+reading.as_of;
        const verdict=s.readingPane.querySelector('.radar-ai-verdict'),refs=verdict.querySelector('.radar-ai-refs');
        if(refs)date.append(refs);verdict.after(date);
        s.readingPane.querySelectorAll('.radar-ai-points li>p').forEach(paragraph=>{
          const label=paragraph.querySelector('.radar-ai-point-label');if(!label)return;
          const copy=document.createElement('span');copy.className='radar-point-copy';
          for(const node of [...paragraph.childNodes])if(node!==label)copy.append(node);
          paragraph.append(copy);
        });
      }
  }
  async function fillCompany(s,index){
    const run=(s.run||0)+1;s.run=run;s.index=index;s.modal.dataset.loaded='false';s.modal.setAttribute('aria-busy','true');
    const item=s.queue[index],name=item.name,entry=window.RadarData.manifest.company_interpretations?.[name];
    s.frame.querySelector('h2').textContent=item.display;
    s.frame.querySelector('.radar-sheet-eyebrow').textContent=(item.role?roleNames[item.role]+' · ':'')+(s.queue.length>1?(index+1)+' / '+s.queue.length:'企业观察');
    s.frame.querySelector('.radar-sheet-controls').replaceChildren();s.body.innerHTML=skeleton();
    s.frame.querySelector('.radar-sheet-meta').textContent=item.meta||'';
    const focusStep=document.activeElement?.getAttribute('data-reader-step');
    s.footer.innerHTML=(s.queue.length>1?'<button type="button" data-reader-step="-1" '+(index?'':'disabled')+'>上一家</button>':'')+'<button type="button" class="radar-sheet-primary" data-reader-full>'+(s.fromCompany?'返回企业进展':'完整企业追踪 →')+'</button>'+(s.queue.length>1?'<button type="button" data-reader-step="1" '+(index<s.queue.length-1?'':'disabled')+'>下一家</button>':'');
    if(focusStep){const target=s.footer.querySelector('[data-reader-step="'+focusStep+'"]');(target&&!target.disabled?target:s.footer.querySelector('[data-reader-full]')).focus({preventScroll:true});}
    try{
      const [recordResult,readingResult]=await Promise.allSettled([window.RadarReading.readCompany(name),entry?.path?I.staticReading(name,entry):Promise.resolve(null)]);
      if(session!==s||run!==s.run)return;
      const rows=recordResult.status==='fulfilled'?H.grouped(recordResult.value):null,reading=readingResult.status==='fulfilled'?readingResult.value:null;
      s.hasReading=!!reading;s.entry=entry;
      const segment=document.createElement('ion-segment');segment.mode='ios';segment.className='radar-reader-tabs';segment.setAttribute('aria-label','企业阅读内容');
      segment.innerHTML=(reading?'<ion-segment-button value="reading"><span>企业解读</span></ion-segment-button>':'')+'<ion-segment-button value="events"><span>进展 <small>'+(rows?rows.length:'')+'</small></span></ion-segment-button>';
      s.segment=segment;s.frame.querySelector('.radar-sheet-controls').append(segment);
      s.body.innerHTML='<section class="radar-sheet-reading radar-company-heading" id="radar-reader-reading" role="tabpanel" aria-label="企业解读"><div class="radar-ai-content">'+(reading?I.markup(reading,true):'')+'</div></section><section class="radar-sheet-events" id="radar-reader-events" role="tabpanel" aria-label="企业进展">'+(rows?historyMarkup(rows):'<p class="radar-sheet-empty" role="alert">企业进展暂时无法读取。<button type="button" data-reader-retry>重新读取</button></p>')+'</section>';
      s.readingPane=s.body.querySelector('.radar-sheet-reading');s.eventsPane=s.body.querySelector('.radar-sheet-events');
      readingMarkup(s,reading);
      if(entry?.path&&!reading){const notice=document.createElement('p');notice.className='radar-sheet-cache-note';notice.setAttribute('role','alert');notice.setAttribute('data-reader-cache-error','');notice.innerHTML='企业解读暂时无法读取。<button type="button" data-reader-retry>重新读取</button>';s.eventsPane.prepend(notice);}
      segment.addEventListener('ionChange',event=>choosePane(s,event.detail.value));
      choosePane(s,s.pane|| (reading?'reading':'events'));
      if(entry&&(!reading||reading.source_version!==entry.source_version)&&I.follow){
        const notice=document.createElement('p');notice.className='radar-sheet-cache-note';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.textContent='已有新材料，正在更新解读…';s.frame.querySelector('.radar-sheet-controls').append(notice);
        I.follow(name,entry,{
          current:()=>session===s&&s.run===run,
          status:text=>{notice.textContent=text;},
          reading:updated=>{
            readingMarkup(s,updated);s.hasReading=!!updated;
            if(updated&&!s.segment.querySelector('[value="reading"]')){const button=document.createElement('ion-segment-button');button.value='reading';button.innerHTML='<span>企业解读</span>';s.segment.prepend(button);}
            if(!updated)choosePane(s,'events');
            else if(s.pane!=='events')choosePane(s,'reading');
          },
          disqualified:()=>{readingMarkup(s,null);s.hasReading=false;choosePane(s,'events');notice.textContent='当前材料尚不足以形成有依据的企业解读。';s.eventsPane.prepend(notice);}
        });
      }
      if(reading&&reading.source_version!==entry.source_version){const note=document.createElement('p');note.className='radar-sheet-cache-note';note.setAttribute('data-stale-reading-note','');note.textContent='已有新材料；当前展示上次解读。';s.readingPane.prepend(note);}
      s.modal.dataset.company=name;s.modal.dataset.loaded='true';s.modal.removeAttribute('aria-busy');
    }catch(error){if(session===s&&run===s.run){s.modal.removeAttribute('aria-busy');s.body.innerHTML='<p class="radar-sheet-empty" role="alert">内容暂时无法读取。<button type="button" data-reader-retry>重新读取</button></p>';}}
  }
  async function openCompany(source,fromCompany=false){
    if(opening||session)return;opening=true;
    const originalLabel=source.querySelector('.radar-observation-action')?.textContent;
    source.setAttribute('aria-busy','true');source.classList.add('radar-opening');
    if(originalLabel)source.querySelector('.radar-observation-action').textContent='正在打开…';
    try{
      const scope=source.closest('.radar-observation-group,.radar-lead-group')||document;
      const anchors=fromCompany?[]:[...scope.querySelectorAll(source.matches('.radar-company-observation')?'.radar-company-observation':'.radar-observation-lead')];
      const queue=fromCompany?[{name:source.dataset.aiReading,display:document.querySelector('.radar-company-heading>h2').textContent,meta:document.querySelector('.radar-company-heading>p')?.textContent||''}]:anchors.map(a=>({name:routeName(a),display:a.querySelector('h3,h4').textContent,meta:[...a.querySelectorAll('.radar-observation-sector>span')].map(x=>x.textContent.trim()).join(' · ')||a.querySelector('.radar-observation-field')?.textContent||'',role:a.dataset.role||a.closest('[data-group]')?.dataset.group||(a.matches('.radar-observation-lead')?'local_potential':undefined),anchor:a,route:fullRoute(a)}));
      const index=fromCompany?0:Math.max(0,anchors.indexOf(source)),s=await makeSheet('company',queue[index].display,source);
      s.queue=queue;s.fromCompany=fromCompany;fillCompany(s,index);
    }catch(error){if(error.name!=='AbortError'){if(fromCompany)I.open(source.dataset.aiReading);else Router.navigate(routeOf(source));}}
    finally{opening=false;source.removeAttribute('aria-busy');source.classList.remove('radar-opening');if(originalLabel&&source.isConnected)source.querySelector('.radar-observation-action').textContent=originalLabel;}
  }

  function countChange(node,value){
    node.textContent=value;
    if(!reduced()&&node.animate)node.animate([{transform:'translateY(5px)',opacity:.25},{transform:'translateY(0)',opacity:1}],{duration:200,easing:'ease-out'});
  }
  async function openFacets(source){
    if(session||opening)return;opening=true;
    try{
      const p=Router.getQueryParams(),data=await window.RadarObservations.read(),all=window.RadarObservations.leadCandidates(data),select=document.getElementById('radar-lead-sector');
      const options=[...select.options].map(o=>({value:o.value,label:o.value||'全部领域'})),s=await makeSheet('facets','筛选领域',source,true);
      s.draft=p.sector||'';s.frame.querySelector('.radar-sheet-eyebrow').textContent='进展线索';s.frame.querySelector('.radar-sheet-meta').textContent='按领域收窄范围，保留当前搜索条件';
      s.body.innerHTML='<div class="radar-facet-options" role="group" aria-label="线索领域">'+options.map(o=>'<button type="button" data-facet="'+esc(o.value)+'" aria-pressed="'+String(o.value===s.draft)+'"><span>'+esc(o.label)+'</span><small>'+all.filter(c=>window.RadarObservations.matches(c,p.q||'')&&(!o.value||H.sectors(c).includes(o.value))).length+'</small></button>').join('')+'</div>';
      s.footer.innerHTML='<button class="radar-sheet-primary" type="button" data-facet-apply>查看 <span data-facet-count></span> 家线索</button>';
      s.updateCount=()=>countChange(s.footer.querySelector('[data-facet-count]'),all.filter(c=>window.RadarObservations.matches(c,p.q||'')&&(!s.draft||H.sectors(c).includes(s.draft))).length);
      s.updateCount();await s.present;
    }catch(error){if(error.name!=='AbortError'){const select=document.getElementById('radar-lead-sector');if(select){select.dataset.nativeFallback='true';select.hidden=false;source.remove();select.focus();}}}
    finally{opening=false;}
  }
  function archivedMonths(){
    const dates=window.RadarData.manifest.available_dates||[],keys=dates.map(x=>x.date.slice(0,7)).sort(),result=[];
    if(!keys.length)return result;
    const [year,month]=keys[0].split('-').map(Number),cursor=new Date(Date.UTC(year,month-1,1));
    while(cursor.toISOString().slice(0,7)<=keys.at(-1)){result.push(cursor.toISOString().slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1);}
    return result.reverse();
  }
  async function openMonth(source){
    if(session||opening)return;opening=true;
    try{
      const s=await makeSheet('month','选择收录月份',source,true),months=archivedMonths();s.month=Router.getQueryParams().month||window.RadarData.manifest.today.slice(0,7);
      s.frame.querySelector('.radar-sheet-eyebrow').textContent='收录日历';
      const picker=document.createElement('ion-picker');picker.mode='ios';picker.className='radar-month-wheel';
      const column=document.createElement('ion-picker-column');column.setAttribute('aria-label','收录月份');column.value=s.month;
      months.forEach(key=>{const option=document.createElement('ion-picker-column-option');option.value=key;option.textContent=key.slice(0,4)+'年'+Number(key.slice(5))+'月';column.append(option);});picker.append(column);s.body.append(picker);
      s.footer.innerHTML='<button type="button" class="radar-sheet-primary" data-month-apply>查看所选月份</button>';
      const update=()=>{const items=window.RadarData.manifest.available_dates.filter(d=>d.date.startsWith(s.month));s.frame.querySelector('.radar-sheet-meta').textContent=items.length+' 天有收录 · '+items.reduce((a,d)=>a+(d.count||0)+(d.negative_count||0),0)+' 条动态';s.footer.querySelector('button').textContent='查看 '+s.month.slice(0,4)+'年'+Number(s.month.slice(5))+'月';};
      column.addEventListener('ionChange',event=>{s.month=String(event.detail.value);update();});update();await s.present;
    }catch(error){if(error.name!=='AbortError'&&source.isConnected){const select=document.createElement('select');select.setAttribute('aria-label','选择收录月份');for(const key of archivedMonths()){const option=document.createElement('option');option.value=key;option.textContent=key;select.append(option);}select.value=Router.getQueryParams().month||window.RadarData.manifest.today.slice(0,7);select.addEventListener('change',()=>Router.navigate('/calendar?month='+select.value));source.replaceWith(select);}}
    finally{opening=false;}
  }
  function enhance(){
    mountFrame=0;
    document.querySelectorAll('.radar-company-observation,.radar-observation-lead').forEach(anchor=>{anchor.setAttribute('aria-haspopup','dialog');});
    document.querySelectorAll('[data-ai-reading]').forEach(button=>button.setAttribute('aria-haspopup','dialog'));
    const select=document.getElementById('radar-lead-sector');
    if(select&&select.dataset.nativeFallback!=='true'&&!document.querySelector('[data-open-facets]')){
      const button=document.createElement('button');button.type='button';button.className='radar-open-facets';button.dataset.openFacets='';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-label','筛选线索领域');
      button.textContent=select.value||'全部领域';button.dataset.active=String(!!select.value);select.hidden=true;select.after(button);
    }
    const date=document.querySelector('.radar-calendar-heading>div>p');
    if(date){const button=document.createElement('button');button.type='button';button.className='radar-open-month';button.dataset.openMonth='';button.setAttribute('aria-label','选择收录月份');button.setAttribute('aria-haspopup','dialog');button.innerHTML='<span>'+esc(date.textContent)+'</span><small>切换</small>';date.replaceWith(button);}
  }
  document.addEventListener('click',event=>{
    const source=event.target.closest('a'),ai=event.target.closest('[data-ai-reading]');
    if((handles(source)||ai)&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&event.button===0){event.preventDefault();event.stopImmediatePropagation();openCompany(ai||source,!!ai);return;}
    if(event.target.closest('[data-open-facets]')){event.preventDefault();openFacets(event.target.closest('[data-open-facets]'));return;}
    if(event.target.closest('[data-open-month]')){event.preventDefault();openMonth(event.target.closest('[data-open-month]'));return;}
    if(!session)return;
    if(event.target.closest('[data-sheet-close]'))closeSheet();
    const step=event.target.closest('[data-reader-step]');if(step&&!step.disabled)fillCompany(session,session.index+Number(step.dataset.readerStep));
    if(event.target.closest('[data-reader-retry]'))fillCompany(session,session.index);
    if(event.target.closest('[data-reader-full]'))closeSheet(session.fromCompany?null:session.queue[session.index].route);
    const facet=event.target.closest('[data-facet]');if(facet){session.draft=facet.dataset.facet;session.body.querySelectorAll('[data-facet]').forEach(button=>button.setAttribute('aria-pressed',String(button===facet)));session.updateCount();}
    if(event.target.closest('[data-facet-apply]')){const p=new URLSearchParams(location.hash.split('?')[1]);p.delete('_sheet');session.draft?p.set('sector',session.draft):p.delete('sector');closeSheet('/observations?'+p);}
    if(event.target.closest('[data-month-apply]'))closeSheet('/calendar?month='+session.month);
  },true);
  window.addEventListener('popstate',event=>{if(session&&event.state?.radarSheet!==session.token)session.modal.dismiss();});
  window.addEventListener('hashchange',event=>{
    // Returning from an overlay must leave the mounted list and its scroll position intact.
    const returned=session&&location.hash===session.originalHash;
    if(returned||location.hash===restoringHash){restoringHash=null;event.stopImmediatePropagation();if(session)session.modal.dismiss();return;}
    if(session)session.modal.dismiss();
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    const startup=new URL(location.href),[startupPath,startupQuery]=location.hash.slice(1).split('?'),startupParams=new URLSearchParams(startupQuery);
    if(startupParams.has('_sheet')){startupParams.delete('_sheet');startup.hash=startupPath+(startupParams.size?'?'+startupParams:'');history.replaceState(history.state,'',startup);}
    enhance();new MutationObserver(()=>{if(!mountFrame)mountFrame=requestAnimationFrame(enhance);}).observe(document.getElementById('app-content'),{childList:true,subtree:true});
    if('requestIdleCallback' in window)requestIdleCallback(()=>load().catch(()=>{}),{timeout:2000});
    else setTimeout(()=>load().catch(()=>{}),500);
  });
  function openReading(name){const button=[...document.querySelectorAll('[data-ai-reading]')].find(node=>H.canonical(node.dataset.aiReading)===H.canonical(name));if(!button)return false;openCompany(button,true);return true;}
  window.RadarComponents={handles,openReading};
})();
