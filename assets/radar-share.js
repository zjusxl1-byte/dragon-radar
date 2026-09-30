/* Share actions only. Existing content and all briefing renderers are preserved. */
(function () {
  'use strict';
  var items = new Map();
  var selectedDay = null;
  var selectedBrief = null;
  var serial = 0;
  var returnFocus = null;
  function escape(value) {
    return String(value || '').replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c];
    });
  }
  function url(route) {
    var result = new URL(location.href);
    result.search = '';
    if(route.indexOf('/today?')===0){
      var parts=route.split('?'), q=new URLSearchParams(parts[1]);
      var version=window.RadarData.manifest.daily_versions && window.RadarData.manifest.daily_versions[q.get('date')];
      var current=Router.getQueryParams();
      if(current.date===q.get('date') && current.v)version=current.v;
      if(version)q.set('v',version);
      route=parts[0]+'?'+q.toString();
    }
    result.hash = route;
    return result.href;
  }
  function dateFor(item) {
    return item.date || selectedDay || window.RadarData.manifest.today;
  }
  function shareButton(key) {
    return '<button type="button" class="radar-share-button" data-radar-share="' + key + '">分享</button>';
  }
  function addToCard(render) {
    return function (item, index, compact) {
      // Negative cards have a two-argument signature.
      var isCompact = typeof index === 'boolean' ? index : compact;
      var html = render.apply(this, arguments);
      if (isCompact) return html;
      var day = dateFor(item);
      var company = item.company_name || item.company || '企业动态';
      var key = 'event-' + (++serial);
      items.set(key, {
        title: company + '｜寻龙雷达',
        text: (item.event_desc || item.event_description || item.title || '') + '\n收录日期：' + day,
        url: url('/today?date=' + encodeURIComponent(day) + '&target=' + encodeURIComponent(window.RadarHistory.anchor(item)))
      });
      // Insert alongside existing “查企业 / 阅读原文” controls, without another row.
      var match = html.match(/<\/div>\s*<\/div>\s*$/);
      return match ? html.slice(0, match.index) + shareButton(key) + html.slice(match.index) : html;
    };
  }
  renderCompanyCard = addToCard(renderCompanyCard);
  renderNegativeCard = addToCard(renderNegativeCard);
  var home = Views.home;
  Views.home = function (data) { selectedDay = data.today; return home.apply(this, arguments); };
  var today = Views.today;
  Views.today = function (data, day) { selectedDay = day || data.date || data.today; return today.apply(this, arguments); };
  var weekly = Views.weekly;
  Views.weekly = function () { selectedDay = null; return weekly.apply(this, arguments); };
  var briefing = Views.briefing;
  Views.briefing = function (data, available, type) {
    selectedBrief = { type: type, id: data.summary.report_id };
    return briefing.apply(this, arguments);
  };
  function currentPayload() {
    var route = Router.getRoute();
    var params = Router.getQueryParams();
    if (route === '/briefing' && selectedBrief) {
      var type = params.type || selectedBrief.type || 'weekly';
      var id = params.id || (window.RadarData.manifest.briefings[type] || [])[0];
      return {title:'寻龙雷达' + (type === 'monthly' ? '月' : '周') + '简报', text:id,
        url:url('/briefing?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id))};
    }
    if(route === '/company')return {title:(params.name||'企业')+'｜寻龙雷达',text:'已收录企业动态与研判',url:url('/company?name='+encodeURIComponent(params.name||''))};
    var day = params.date || window.RadarData.manifest.today;
    return {title:'寻龙雷达｜' + day, text:'企业动态与研判', url:url('/today?date=' + encodeURIComponent(day))};
  }
  function showCopy(payload) {
    var dialog = document.getElementById('radar-share-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'radar-share-dialog';
      dialog.setAttribute('aria-labelledby', 'radar-share-heading');
      dialog.innerHTML = '<h2 id="radar-share-heading">分享</h2><label for="radar-share-text">文字和链接</label>' +
        '<textarea id="radar-share-text" readonly></textarea><p id="radar-share-status" role="status"></p>' +
        '<div><button type="button" data-radar-native>系统分享</button><button type="button" data-radar-copy>复制文字与链接</button><button type="button" data-radar-close>关闭</button></div>';
      document.body.appendChild(dialog);
      dialog.addEventListener('close', function () {if(returnFocus && returnFocus.isConnected)returnFocus.focus();});
    }
    dialog.querySelector('[data-radar-native]').hidden = !navigator.share;
    dialog.querySelector('textarea').value = [payload.title, payload.text, payload.url].filter(Boolean).join('\n');
    dialog.querySelector('[role="status"]').textContent = '';
    dialog.showModal();
  }
  var activePayload;
  async function share(payload) {activePayload=payload;showCopy(payload);}
  window.RadarShare={
    registerEvent:function(item){
      var key='event-'+(++serial),company=item.company_name||item.company||'企业动态';
      items.set(key,{title:company+'｜寻龙雷达',text:(item.event_desc||item.title||item.reason||'')+'\n收录日期：'+dateFor(item),url:url('/today?date='+encodeURIComponent(dateFor(item))+'&target='+encodeURIComponent(window.RadarHistory.anchor(item)))});
      return key;
    },
    eventPayload:function(key){return items.get(key);},
    currentPayload:currentPayload
  };
  document.addEventListener('click', async function (event) {
    var trigger = event.target.closest('[data-radar-share]');
    if (trigger) {
      returnFocus = trigger;
      var payload = trigger.dataset.radarShare === 'page' ? currentPayload() : items.get(trigger.dataset.radarShare);
      if (payload) await share(payload);
    }
    if (event.target.closest('[data-radar-native]') && navigator.share && activePayload) {
      try {await navigator.share(activePayload);}
      catch(err){if(err.name!=='AbortError')document.getElementById('radar-share-status').textContent='可复制下方文字与链接分享';}
    }
    if (event.target.closest('[data-radar-close]')) document.getElementById('radar-share-dialog').close();
    if (event.target.closest('[data-radar-copy]')) {
      var field = document.getElementById('radar-share-text');
      var status = document.getElementById('radar-share-status');
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(field.value);
        status.textContent = '已复制';
      } catch (_) {
        field.focus(); field.select();
        status.textContent = '请长按文字，选择复制';
      }
    }
  });
  document.addEventListener('DOMContentLoaded', function () {
    var header = document.querySelector('#top-header') || document.querySelector('.top-header');
    if (!header) return;
    var target = header.firstElementChild || header;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'radar-share-header';
    b.dataset.radarShare = 'page'; b.textContent = '分享'; b.setAttribute('aria-label', '分享当前内容');
    target.appendChild(b);
    function update() {
      var route = Router.getRoute();
      b.hidden = !['/','/today','/company','/briefing',''].includes(route) || (route==='/today' && Router.getQueryParams().search==='all');
    }
    window.addEventListener('hashchange', update); update();
  });
})();
