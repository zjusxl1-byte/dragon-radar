/* Real reading position drives the directory's active section. */
(function(){
  'use strict';
  let frame=0;
  function paint(){
    frame=0;
    const route=Router.getRoute();
    document.body.classList.toggle('radar-front-page',['/','/today','/calendar'].includes(route));
    document.body.classList.toggle('radar-home-page',route==='/');
    document.body.classList.toggle('radar-editorial',['/observations','/company','/topic'].includes(route));
    const toolbar=document.querySelector('.radar-lead-toolbar'),groups=[...document.querySelectorAll('.radar-lead-group')];
    if(!toolbar||!groups.length)return;
    const threshold=toolbar.getBoundingClientRect().bottom+28;
    let current=groups[0];
    for(const group of groups){if(group.getBoundingClientRect().top<=threshold)current=group;else break;}
    document.querySelectorAll('[data-lead-tier]').forEach(button=>{
      if(button.dataset.leadTier===current.dataset.tier)button.setAttribute('aria-current','true');
      else button.removeAttribute('aria-current');
    });
  }
  function request(){if(!frame)frame=requestAnimationFrame(paint);}
  document.addEventListener('DOMContentLoaded',()=>{paint();new MutationObserver(request).observe(document.getElementById('app-content'),{childList:true,subtree:true});});
  window.addEventListener('hashchange',request);
  window.addEventListener('scroll',request,{passive:true});
  window.addEventListener('resize',request,{passive:true});
})();
