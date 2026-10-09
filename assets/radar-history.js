/* Shared public archive semantics: exact entities, date ranges and event identity. */
(function () {
  'use strict';
  function region(row) {
    const geography=String(row.geography||''), place=String(row.location||'');
    if(/海外/.test(geography)||/美国|英国|德国|法国|日本|韩国|新加坡|加拿大|以色列|硅谷|旧金山|荷兰|瑞士|芬兰|瑞典|澳大利亚|印度|意大利|比利时|挪威|丹麦|西班牙|奥地利|俄罗斯|阿联酋|纽约|伦敦|东京|首尔/.test(place))return '海外';
    if(/杭州/.test(geography+' '+place))return '杭州';
    if(/中国|北京|上海|天津|重庆|浙江|江苏|广东|山东|福建|安徽|湖北|湖南|河南|河北|江西|四川|陕西|山西|辽宁|吉林|黑龙江|云南|贵州|广西|海南|甘肃|青海|宁夏|内蒙古|新疆|西藏|香港|澳门|台湾|深圳|苏州|南京|武汉|成都|合肥|广州|无锡|宁波|西安|厦门|青岛/.test(place))return '国内其他';
    return '待核实';
  }
  const nameKey=name=>String(name||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  let entitySource=null,identityIndex=new Map();
  function identities(){
    const entries=window.RadarData?.manifest?.reading_entities||[];
    if(entitySource!==entries){
      entitySource=entries;identityIndex=new Map();
      for(const entity of entries){
        for(const name of [entity.name,...(entity.aliases||[])]){
          const key=nameKey(name),before=identityIndex.get(key);
          // Conflicts remain unresolved; array order cannot choose an owner.
          identityIndex.set(key,before===undefined?entity:(before?.id===entity.id?before:null));
        }
      }
    }
    return identityIndex;
  }
  function identityFor(name){
    const index=identities(),key=nameKey(name),exact=index.get(key);
    if(exact&&exact.identity_status!=='unresolved')return exact;
    const parts=key.match(/^([^()]+)\(([^()]+)\)$/)||key.match(/^(.+[\u4e00-\u9fff])\s*([a-z][a-z0-9 .&-]*)$/)||key.match(/^([a-z][a-z0-9 .&-]*)\s*(.+[\u4e00-\u9fff])$/);
    if(parts){const left=index.get(nameKey(parts[1])),right=index.get(nameKey(parts[2]));if(left&&right&&left.id===right.id&&left.identity_status!=='unresolved'&&right.identity_status!=='unresolved')return left;}
    return exact;
  }
  function canonical(name){return identityFor(name)?.name||name;}
  function formatDate(value){
    const text=String(value||'');if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
    if(!/^\d{4}-\d{2}-\d{2}T/.test(text))return text;
    const date=new Date(text);if(!Number.isFinite(date.getTime()))return text;
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get=type=>parts.find(p=>p.type===type).value;return get('year')+'-'+get('month')+'-'+get('day');
  }
  function names(name){const entity=identityFor(name);return entity?[entity.name,...(entity.aliases||[])]:[name];}
  function sectors(row){return normalizeSectors({[row.sector||'']:1}).map(s=>s.sector);}
  function bucket(name){let hash=0;const text=canonical(name);for(let i=0;i<text.length;i++)hash=(31*hash+text.charCodeAt(i))>>>0;return (hash%64).toString(16).padStart(2,'0');}
  function rows(history) {
    return Object.entries(history).flatMap(([company,records])=>records.map(r=>({...r,company,canonical_name:canonical(r.canonical_name||company),region:region(r)})))
      .sort((a,b)=>b.date.localeCompare(a.date)||(b.score||0)-(a.score||0));
  }
  function search(records,f) {
    const terms=nameKey(f.q).split(/\s+/).filter(Boolean);
    if(f.from&&f.to&&f.from>f.to)return [];
    return records.filter(r=>(!f.from||r.date>=f.from)&&(!f.to||r.date<=f.to)
      &&(!f.company||canonical(r.canonical_name||r.company)===canonical(f.company))
      &&(!f.region||r.region===f.region)&&(!f.sector||sectors(r).includes(f.sector)||r.sector===f.sector)
      &&(!f.type||(f.type==='风险预警'?(r.kind==='risk'||/风险|负面/.test(r.event_type)):f.type==='融资/IPO'?/融资|IPO|上市/.test(r.event_type):r.event_type===f.type))
      &&terms.every(term=>nameKey([...names(r.canonical_name||r.company),r.company,r.title,r.article_title,r.sector,r.location,r.source,r.event_type,r.kind==='risk'?'风险预警':''].join(' ')).includes(term)));
  }
  function anchor(item) {
    const name=item.company_name||item.company||'';
    const text=item.event_desc||item.reason||item.title||'';
    return generateSafeId([name,text,item.link||''].join('\n')).replace('card-','event-');
  }
  function grouped(records){
    const groups=new Map();
    for(const r of records){
      // Identical facts can collect multiple sources. Different text/analysis is never discarded.
      const key=JSON.stringify([r.company_entity_id||canonical(r.company),r.title||r.article_title,r.event_date||'',r.kind,r.insight||'',r.financing||'',r.core_tech||'',r.official_evaluation||'',r.founder_info||'']);
      if(!groups.has(key))groups.set(key,{...r,observations:[]});
      groups.get(key).observations.push(r);
    }
    return [...groups.values()];
  }
  function weekRange(id){
    if(!/^\d{4}-W\d{1,2}$/.test(id))return {};
    const [y,w]=id.split('-W').map(Number),d=new Date(Date.UTC(y,0,4));
    d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(w-1)*7);
    const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {from,to:d.toISOString().slice(0,10)};
  }
  function safeURL(link){try{const u=new URL(link);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}}
  window.RadarHistory={region,canonical,sectors,rows,search,anchor,grouped,weekRange,safeURL,bucket,formatDate};
})();
