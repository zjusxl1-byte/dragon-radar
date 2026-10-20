/* Shared public archive semantics: exact entities, date ranges and event identity. */
(function () {
  'use strict';
  function region(row) {
    row=currentRow(row);
    const structured=row.geography;
    if(structured&&typeof structured==='object'&&!Array.isArray(structured)){
      // Region is a display/filter label; alert eligibility is reviewed separately.
      if(structured.geography_status==='confirmed'){
        if(structured.classification==='foreign')return '海外';
        if(structured.classification==='hangzhou')return '杭州';
        if(structured.classification==='domestic_non_hangzhou')return '国内其他';
      }
      return '待核实';
    }
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
  function locationHint(value){
    const hint=String(value??'').trim().replace(/^(?:地点线索[：:]\s*)+/,'').replace(/\s+/g,' ');
    const placeholders=new Set(['地点待核','地点未知','地区待核实','待核','待核实','未核实','未披露','未知','不详','未提及','无','n/a','-','海外','全国','全球']);
    return placeholders.has(hint.replace(/\s+/g,'').toLowerCase())?'':hint;
  }
  function currentRow(row,{snapshot=false}={}){
    // Immutable shares retain the locality reviewed with that exact edition.
    if(snapshot||row._radarSnapshot)return {...row,_radarSnapshot:true};
    const articleLocation=Object.prototype.hasOwnProperty.call(row,'article_location')?row.article_location:
      String(row.location??'').trim().replace(/^(?:地点线索[：:]\s*)+/,'');
    const original={...row,article_location:articleLocation};
    if(row.identity_status==='ambiguous'||row.identity_conflict){
      const geography={geography_status:'conflict',classification:'unknown',display_location:'主体待确认',
        located_status:'identity_conflict',display_basis:[],subject_evidence_ids:[],basis:[],needs_review:true};
      return {...original,geography,location:geography.display_location,location_status:geography.located_status,location_basis:[]};
    }
    const index=window.RadarData?.manifest?.company_geographies||{};
    let id=row.company_entity_id||'';
    if(!id||(!Object.prototype.hasOwnProperty.call(index,id)&&row.identity_status!=='confirmed')){
      const entity=identityFor(row.company_name||row.company||row.canonical_name);
      if(entity?.identity_status==='confirmed')id=entity.id;
    }
    const geo=id&&Object.prototype.hasOwnProperty.call(index,id)?index[id]:null;
    if(!geo||typeof geo!=='object'||Array.isArray(geo))return original;
    // Unknown/conflict entries also replace old confirmations. Names, article
    // places and project/branch mentions never establish subject locality here.
    let location=geo.display_location||'地点待核';
    const hint=locationHint(articleLocation);
    if(location==='地点待核'&&hint&&!geo.presentation?.label&&geo.located_status!=='business_confirmed_subject_pending'){
      const chars=[...hint];location='地点线索：'+(chars.length<=75?hint:chars.slice(0,74).join('')+'…');
    }
    return {...original,company_entity_id:id,geography:geo,location,
      location_status:geo.located_status,location_basis:geo.basis||[],location_next_action:geo.next_action};
  }
  function currentDaily(data,options={}){
    const result={...data};
    const {snapshot=false,day,sourceVersion}=options,manifest=window.RadarData?.manifest||{};
    const metadata=manifest.daily_reading_metadata?.[day];
    const bound=!snapshot&&typeof sourceVersion==='string'&&/^[a-f0-9]{64}$/.test(sourceVersion)
      &&sourceVersion===metadata?.source_version&&sourceVersion===manifest.daily_versions?.[day];
    const fields=new Set(['company_entity_id','identity_status','company_canonical_name','event_headline','event_signal']);
    for(const key of ['targets','negatives'])if(Array.isArray(data[key]))result[key]=data[key].map((row,index)=>{
      const revised={...row},patch=bound&&!row._radarSnapshot&&metadata[key]?.[index];
      if(patch&&typeof patch==='object'&&!Array.isArray(patch))for(const [field,value] of Object.entries(patch)){
        if(!fields.has(field))continue;
        if(value===null)delete revised[field];
        else if(typeof value==='string'&&(field!=='event_signal'||['major','material','context'].includes(value)))revised[field]=value;
      }
      return currentRow(revised,options);
    });
    return result;
  }
  function risk(row){return row.kind==='risk'||/风险|负面/.test(row.event_type||'');}
  function localityRank(row){
    const geo=row.geography;
    if(geo&&typeof geo==='object'&&geo.geography_status==='confirmed'){
      if(geo.classification==='hangzhou')return 0;
      if(['domestic_non_hangzhou','foreign'].includes(geo.classification))return 2;
    }
    return 1;
  }
  function eventKey(row){
    const identity=row.event_key||row.source_event_id||row.event_id||row.id||row.event_identity?.canonical_id||'';
    return JSON.stringify([row.company_entity_id||row.company_name||row.company||'',identity,
      row.link||'',row.event_desc||row.reason||row.title||'',row.event_date||row.event_time_evidence?.event_date||'',risk(row)?'risk':'event']);
  }
  function compareDaily(a,b){
    const signals={major:0,material:1,context:2};
    const signal=row=>signals[row.event_signal]??2;
    const score=row=>Number.isFinite(row.score)?row.score:0;
    const left=eventKey(a),right=eventKey(b);
    return Number(risk(b))-Number(risk(a))||localityRank(a)-localityRank(b)
      ||signal(a)-signal(b)||score(b)-score(a)||(left===right?0:left<right?-1:1);
  }
  function orderDaily(records,options={}){
    return records.map(row=>{const projected=currentRow(row,options);return {...projected,region:region(projected)};}).sort(compareDaily);
  }
  function orderHistory(records){
    return orderDaily(records).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||compareDaily(a,b));
  }
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
    return orderHistory(Object.entries(history).flatMap(([company,records])=>records.map(r=>({...r,company,canonical_name:canonical(r.canonical_name||company)}))));
  }
  function search(records,f) {
    const terms=nameKey(f.q).split(/\s+/).filter(Boolean);
    if(f.from&&f.to&&f.from>f.to)return [];
    return orderHistory(records).filter(r=>(!f.from||r.date>=f.from)&&(!f.to||r.date<=f.to)
      &&(!f.company||canonical(r.canonical_name||r.company)===canonical(f.company))
      &&(!f.region||r.region===f.region)&&(!f.sector||sectors(r).includes(f.sector)||r.sector===f.sector)
      &&(!f.type||(f.type==='风险预警'?(r.kind==='risk'||/风险|负面/.test(r.event_type)):f.type==='融资/IPO'?/融资|IPO|上市/.test(r.event_type):r.event_type===f.type))
      &&terms.every(term=>nameKey([...names(r.canonical_name||r.company),r.company,r.title,r.article_title,r.sector,r.location,r.article_location,r.source,r.event_type,r.kind==='risk'?'风险预警':''].join(' ')).includes(term)));
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
  window.RadarHistory={region,canonical,sectors,rows,search,anchor,grouped,weekRange,safeURL,bucket,formatDate,currentRow,currentDaily,orderDaily,orderHistory,eventKey};
})();
