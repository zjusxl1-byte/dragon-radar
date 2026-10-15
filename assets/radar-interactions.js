/* Interaction layer for the existing reading interface; no publication or model calls. */
(function () {
  'use strict';
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animations=new WeakMap(),warmed=new Set();
  let journey=null,frame=0,activeNode=null,titleAnimation=null,departure=null;
  function takeDeparture(key){const value=departure?.hash===key?departure.scroll:null;departure=null;return value;}
  function companyTarget(anchor){
    if(!anchor||anchor.origin!==location.origin)return null;
    const hash=anchor.hash.slice(1),[route,query]=hash.split('?');
    if(route!=='/company')return null;
    const name=new URLSearchParams(query).get('name');
    return name?window.RadarHistory.canonical(name):null;
  }
  function warm(anchor){
    const name=companyTarget(anchor);if(!name||warmed.has(name))return;
    warmed.add(name);
    window.RadarReading.readCompany(name).catch(()=>warmed.delete(name));
    const entry=window.RadarData.manifest?.company_interpretations?.[name];
    if(entry?.path)window.RadarInterpretation.staticReading(name,entry).catch(()=>{});
  }
  function rectValue(rect){return {left:rect.left,top:rect.top,width:rect.width,height:rect.height};}
  function clearTitle(){
    if(titleAnimation){titleAnimation.animation.cancel();titleAnimation.clone.remove();titleAnimation.target.style.opacity='';titleAnimation=null;}
  }
  function morphTitle(target){
    if(!journey||journey.done||journey.name!==window.RadarHistory.canonical(Router.getQueryParams().name||''))return;
    journey.done=true;clearTitle();
    const from=journey.rect,to=target.getBoundingClientRect();
    if(reduced()||typeof target.animate!=='function'||!from||from.top<48||from.top>innerHeight-70)return;
    const clone=document.createElement('span');clone.className='radar-title-flight';clone.textContent=target.textContent;clone.setAttribute('aria-hidden','true');
    Object.assign(clone.style,{left:to.left+'px',top:to.top+'px',width:to.width+'px',font: getComputedStyle(target).font,letterSpacing:getComputedStyle(target).letterSpacing});
    document.body.append(clone);target.style.opacity='0';
    const animation=clone.animate([{transform:'translate('+ (from.left-to.left)+'px,'+(from.top-to.top)+'px) scale(.94)',opacity:.85},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)'});
    titleAnimation={animation,clone,target};
    animation.finished.catch(()=>{}).then(()=>{if(titleAnimation?.animation===animation){clone.remove();titleAnimation.target.style.opacity='';titleAnimation=null;}});
  }
  function cancel(element){
    const previous=animations.get(element);if(previous){previous.cancel();animations.delete(element);}
    element.style.height='';element.style.overflow='';delete element.dataset.motion;
  }
  function resize(element,from,to,complete){
    cancel(element);
    if(reduced()||typeof element.animate!=='function'||Math.abs(from-to)<2){complete?.();return;}
    element.style.overflow='hidden';
    element.dataset.motion='running';
    const animation=element.animate([{height:from+'px'},{height:to+'px'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
    animations.set(element,animation);
    animation.finished.then(()=>{if(animations.get(element)===animation){animations.delete(element);element.style.overflow='';delete element.dataset.motion;complete?.();}}).catch(()=>{});
  }
  function disclosure(details,open){
    const from=details.getBoundingClientRect().height;cancel(details);
    details.dataset.targetOpen=String(open);
    const summary=details.querySelector(':scope > summary');
    summary?.setAttribute('aria-expanded',String(open));
    if(open){
      details.open=true;const to=details.getBoundingClientRect().height;
      resize(details,from,to,()=>delete details.dataset.targetOpen);
      const content=details.querySelector('.radar-ai-analysis,.radar-event-body');
      if(content&&!reduced()&&typeof content.animate==='function')content.animate([{opacity:.25,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:210,easing:'ease-out'});
    }else{
      resize(details,from,summary?.getBoundingClientRect().height||44,()=>{
        details.open=false;delete details.dataset.targetOpen;
        summary?.focus({preventScroll:true});
        if(summary&&summary.getBoundingClientRect().top<58)summary.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});
      });
    }
  }
  function reveal(content){
    if(!reduced()&&typeof content.animate==='function')content.animate([{opacity:.35,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});
  }
  function hidePanel(panel,complete){resize(panel,panel.getBoundingClientRect().height,0,complete);}
  function eventDisclosure(details,open){
    const article=details.closest('[data-row]'),from=article.getBoundingClientRect().height;
    cancel(article);details.dataset.targetOpen=String(open);
    details.open=open;const to=article.getBoundingClientRect().height;
    if(!open)details.open=true;
    details.querySelector('summary')?.setAttribute('aria-expanded',String(open));
    resize(article,from,to,()=>{
      details.open=open;delete details.dataset.targetOpen;
      if(!open){const summary=details.querySelector('summary');summary?.focus({preventScroll:true});if(article.getBoundingClientRect().top<100)article.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});}
    });
    if(open){
      const body=details.querySelector('.radar-event-body');body?.focus({preventScroll:true});
      if(body)reveal(body);
    }
  }
  function syncNode(){
    frame=0;
    const items=[...document.querySelectorAll('.radar-timeline-item')];
    const line=Math.max(150,(document.getElementById('radar-month-index')?.getBoundingClientRect().bottom||70)+36);
    const atEnd=innerHeight+scrollY>=document.documentElement.scrollHeight-3;
    const node=atEnd?items[items.length-1]:items.find(item=>item.getBoundingClientRect().bottom>line);
    if(node===activeNode)return;
    activeNode?.classList.remove('radar-node-current');activeNode=node;
    node?.classList.add('radar-node-current');
  }
  function mounted(){
    const target=document.querySelector('.radar-company-heading>h2');
    if(target)morphTitle(target);
    if(target&&titleAnimation&&target!==titleAnimation.target){
      titleAnimation.target.style.opacity='';titleAnimation.target=target;target.style.opacity='0';
    }
    if(!frame)frame=requestAnimationFrame(syncNode);
    document.querySelectorAll('details>summary').forEach(summary=>summary.setAttribute('aria-expanded',String(summary.parentElement.dataset.targetOpen?summary.parentElement.dataset.targetOpen==='true':summary.parentElement.open)));
  }
  document.addEventListener('pointerover',e=>{if(e.pointerType!=='touch')warm(e.target.closest('a'));},{passive:true});
  document.addEventListener('focusin',e=>warm(e.target.closest('a')));
  document.addEventListener('pointerdown',e=>warm(e.target.closest('a')),{passive:true});
  document.addEventListener('click',e=>{
    const anchor=e.target.closest('a');
    if(window.RadarComponents?.handles(anchor))return;
    const name=companyTarget(anchor);
    if(name&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&e.button===0){
      const card=anchor.closest('.radar-company-observation,.radar-observation-lead');
      const title=card?.querySelector('h3,h4');
      departure={hash:location.hash,scroll:scrollY};
      document.body.dataset.radarDepartureScroll=String(scrollY);
      journey={name,rect:title?rectValue(title.getBoundingClientRect()):null,done:false};
      anchor.setAttribute('aria-busy','true');anchor.classList.add('radar-opening');
      const label=anchor.querySelector('.radar-observation-action');if(label)label.textContent='正在打开…';
      warm(anchor);
    }
    const summary=e.target.closest('.radar-ai-detail>summary');
    const footer=e.target.closest('[data-ai-detail-close]');
    if(summary||footer){
      e.preventDefault();e.stopImmediatePropagation();
      const details=(summary||footer).closest('[data-ai-details]');
      const targetOpen=details.dataset.targetOpen===undefined?details.open:details.dataset.targetOpen==='true';
      disclosure(details,footer?false:!targetOpen);
    }
    const eventSummary=e.target.closest('[data-event-details]>summary');
    const eventButton=e.target.closest('[data-expand-record],[data-collapse-record]');
    if(eventSummary||eventButton){
      e.preventDefault();e.stopImmediatePropagation();
      const details=eventSummary?.parentElement||eventButton.closest('[data-row]').querySelector('[data-event-details]');
      const targetOpen=details.dataset.targetOpen===undefined?details.open:details.dataset.targetOpen==='true';
      eventDisclosure(details,eventButton?eventButton.hasAttribute('data-expand-record'):!targetOpen);
    }
  },true);
  document.addEventListener('toggle',e=>{if(e.target.matches('details'))e.target.querySelector(':scope>summary')?.setAttribute('aria-expanded',String(e.target.dataset.targetOpen===undefined?e.target.open:e.target.dataset.targetOpen==='true'));},true);
  window.addEventListener('hashchange',clearTitle);
  window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(syncNode);},{passive:true});
  document.addEventListener('DOMContentLoaded',()=>{
    const root=document.getElementById('app-content');
    new MutationObserver(()=>requestAnimationFrame(mounted)).observe(root,{childList:true,subtree:true});
    mounted();
  });
  window.RadarInteractions={cancel,reveal,hidePanel,disclosure,eventDisclosure,takeDeparture};
})();
