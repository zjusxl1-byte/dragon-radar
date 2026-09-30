/* Search the existing public daily archive without loading every daily document. */
(function () {
  'use strict';
  function region(row) {
    const geography=String(row.geography||''), place=String(row.location||'');
    if(/海外/.test(geography)||/美国|英国|德国|法国|日本|韩国|新加坡|加拿大|以色列|硅谷|旧金山|荷兰|瑞士|芬兰|瑞典|澳大利亚|印度|意大利|比利时|挪威|丹麦|西班牙|奥地利|俄罗斯|阿联酋|纽约|伦敦|东京|首尔/.test(place))return '海外';
    if(/杭州/.test(geography+' '+place))return '杭州';
    if(/中国|北京|上海|天津|重庆|浙江|江苏|广东|山东|福建|安徽|湖北|湖南|河南|河北|江西|四川|陕西|山西|辽宁|吉林|黑龙江|云南|贵州|广西|海南|甘肃|青海|宁夏|内蒙古|新疆|西藏|香港|澳门|台湾|深圳|苏州|南京|武汉|成都|合肥|广州|无锡|宁波|西安|厦门|青岛/.test(place))return '国内其他';
    return '待核实';
  }
  function rows(history) {
    return Object.entries(history).flatMap(([company,records])=>records.map(r=>({...r,company,region:region(r)})))
      .sort((a,b)=>b.date.localeCompare(a.date));
  }
  function search(records,filters) {
    const terms=String(filters.q||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if(filters.from&&filters.to&&filters.from>filters.to)return [];
    return records.filter(r=>(!filters.from||r.date>=filters.from)&&(!filters.to||r.date<=filters.to)
      &&(!filters.region||r.region===filters.region)
      &&(!filters.type||(filters.type==='风险预警'?(r.kind==='risk'||/风险|负面/.test(r.event_type)):r.event_type===filters.type))
      &&terms.every(term=>[r.company,r.title,r.article_title,r.sector,r.location,r.source,r.event_type,r.kind==='risk'?'风险预警':''].join(' ').toLocaleLowerCase().includes(term)));
  }
  function anchor(item) {
    const name=item.company_name||item.company||'';
    const text=item.event_desc||item.reason||item.title||'';
    return generateSafeId([name,text,item.link||''].join('\n')).replace('card-','event-');
  }
  window.RadarHistory={region,rows,search,anchor};
})();
