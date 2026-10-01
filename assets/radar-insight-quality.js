(function(root){
  'use strict';
  const templates=['需跟踪客户、交付与规模化验证；本记录区分报道事实与推断。','需跟踪独立验证、客户复购及规模化交付；报道与企业披露不等同于审计或技术验证。'];
  const normalize=s=>String(s||'').replace(/[^\p{L}\p{N}]/gu,'');
  function needsReview(text, data){
    const value=normalize(text);
    if(!value)return true;
    if(templates.some(t=>value.includes(normalize(t))))return true;
    if(/^(需|仍需|后续需|建议)?(关注|跟踪|核实|验证)[客户交付规模化商业落地复购技术市场风险及与和、，；。\s]+$/.test(text))return true;
    const names=new Set();
    function visit(item){
      if(!item||typeof item!=='object')return;
      if((item.company||item.company_name)&&normalize(item.insight)===value)names.add(item.company||item.company_name);
      Object.values(item).forEach(v=>{if(v&&typeof v==='object')visit(v);});
    }
    visit(data);
    return names.size>1;
  }
  root.RadarInsightQuality={needsReview};
  if(typeof module!=='undefined')module.exports=root.RadarInsightQuality;
})(typeof window!=='undefined'?window:globalThis);
