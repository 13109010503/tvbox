/*
@header({
  searchable: 1,
  filterable: 0,
  quickSearch: 0,
  title: '⚽ 爱球体育',
  author: 'OpenClaw',
  lang: 'cat',
  style: { type: 'rect', ratio: 0.75 }
})
*/

const __sports_src = (function () {

let host = 'https://www.iqzhibo.com';
const dbHost = 'https://www.doubaozhibo.com';
const dbScheduleApi = dbHost + '/api/v1/schedules/public/local';
const dbPlaybackApi = dbHost + '/api/v1/playbacks';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function getHeaders(referer) {
  return {
    'User-Agent': UA,
    'Referer': referer || host + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };
}

function getHeaderValue(headers, name) {
  if (!headers) return '';
  const lower = String(name || '').toLowerCase();
  for (const k in headers) {
    if (String(k).toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? String(v[0] || '') : String(v || '');
    }
  }
  return '';
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(s) {
  return stripHtml(s).replace(/\s+/g, ' ').trim();
}

function absUrl(url, base) {
  url = String(url || '').trim();
  base = base || host;
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;
  if (url.charAt(0) === '/') return base.replace(/\/$/, '') + url;
  return base.replace(/\/$/, '') + '/' + url;
}

function safeJson(text, def) {
  try { return JSON.parse(text || '{}'); } catch (e) { return def || {}; }
}

async function fetchText(url, referer) {
  const hd = getHeaders(referer || host + '/');
  if (typeof Java !== 'undefined' && Java && Java.req) {
    const r = await Java.req(url, { headers: hd });
    if (typeof r === 'string') return r;
    const code = Number((r && (r.statusCode || r.status || r.code)) || 0);
    const loc = getHeaderValue(r && r.headers, 'location');
    if (loc && code >= 300 && code < 400) return await fetchText(absUrl(loc, url.indexOf(dbHost) === 0 ? dbHost : host), url);
    return String((r && (r.body || r.content || r.data)) || '');
  }
  const r2 = await req(url, { headers: hd });
  if (typeof r2 === 'string') return r2;
  const code2 = Number((r2 && (r2.statusCode || r2.status || r2.code)) || 0);
  const loc2 = getHeaderValue(r2 && r2.headers, 'location');
  if (loc2 && code2 >= 300 && code2 < 400) return await fetchText(absUrl(loc2, url.indexOf(dbHost) === 0 ? dbHost : host), url);
  return String((r2 && (r2.content || r2.body || r2.data)) || '');
}

function getClasses() {
  return [
    { type_id: 'zuqiu', type_name: '足球直播' },
    { type_id: 'lanqiu', type_name: '篮球直播' },
    { type_id: 'sssc', type_name: '实时赛程' },
    { type_id: 'huifang', type_name: '赛事回放' },
    { type_id: 'fifa', type_name: '世界杯' },
    { type_id: 'zhongchao', type_name: '中超' },
    { type_id: 'yingchao', type_name: '英超' },
    { type_id: 'xijia', type_name: '西甲' },
    { type_id: 'dejia', type_name: '德甲' },
    { type_id: 'yijia', type_name: '意甲' },
    { type_id: 'fajia', type_name: '法甲' }
  ];
}

function parseIqList(html) {
  html = String(html || '');
  const list = [];
  const reg = /<li>\s*<div class=["']liveinfo["'][\s\S]*?<\/li>/gi;
  let m;
  while ((m = reg.exec(html)) !== null) {
    const item = m[0];
    const title = cleanText((item.match(/class=["']title["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
    const homeBlock = (item.match(/class=["']team-zhu["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
    const awayBlock = (item.match(/class=["']team-ke["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
    const home = cleanText(homeBlock.replace(/<img[\s\S]*$/i, ''));
    const away = cleanText(awayBlock.replace(/^[\s\S]*?<img[^>]*>/i, ''));
    const hrefMatch = item.match(/<div class=["']livesource["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!hrefMatch) continue;
    const imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i);
    const teams = [home, away].filter(Boolean).join(' vs ');
    const name = [title, teams].filter(Boolean).join(' ');
    list.push({
      vod_id: absUrl(hrefMatch[1], host),
      vod_name: name || teams || title || '赛事直播',
      vod_pic: absUrl(imgMatch ? imgMatch[1] : '/logo.png', host),
      vod_remarks: cleanText(hrefMatch[2]) || '高清'
    });
  }
  return list;
}

function matchCategory(tid, league, name, dataType) {
  tid = String(tid || '');
  league = cleanText(league);
  name = cleanText(name);
  dataType = String(dataType || '');
  const text = league + ' ' + name;
  if (!tid || tid === 'sssc' || tid === 'huifang') return true;
  if (tid === 'zuqiu') return dataType === 'football' || (/(足|超|甲|乙|冠|欧联|日职|韩K|世界杯|世俱|足球|杯)/i.test(text) && !/(篮|NBA|CBA|WNBA|NBL|篮球)/i.test(text));
  if (tid === 'lanqiu') return dataType === 'basketball' || /(篮|NBA|CBA|WNBA|NBL|篮球)/i.test(text);
  const rules = {
    fifa: /(世界杯|世俱杯|世预赛|国际足联|FIFA)/i,
    zhongchao: /(中超|足协杯|中国超级联赛)/i,
    yingchao: /(英超|英格兰超级联赛)/i,
    xijia: /(西甲|西班牙甲级联赛)/i,
    dejia: /(德甲|德国甲级联赛)/i,
    yijia: /(意甲|意大利甲级联赛)/i,
    fajia: /(法甲|法国甲级联赛)/i
  };
  return rules[tid] ? rules[tid].test(text) : true;
}

function formatTimeText(matchTime) {
  const d = new Date(matchTime);
  if (!matchTime || isNaN(d.getTime())) return '';
  const pad = function (n) { return String(n).padStart(2, '0'); };
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

async function fetchJson(url, referer) {
  const text = await fetchText(url, referer || dbHost + '/');
  try { return JSON.parse(text || '{}'); } catch (e) { return {}; }
}

function parseApiSchedule(json, tid) {
  const days = json && json.data && Array.isArray(json.data.days) ? json.data.days : [];
  const list = [];
  for (let i = 0; i < days.length; i++) {
    const rows = Array.isArray(days[i].live) ? days[i].live : [];
    for (let j = 0; j < rows.length; j++) {
      const item = rows[j];
      const signals = Array.isArray(item.signals) ? item.signals : [];
      if (!signals.length) continue;
      const name = [formatTimeText(item.matchTime), cleanText(item.league), cleanText(item.teamA) + ' vs ' + cleanText(item.teamB)].filter(Boolean).join(' ');
      if (!matchCategory(tid, item.league, name, item.dataType)) continue;
      const links = signals.map(function (s, idx) {
        return { name: cleanText(s.name || s.label) || ('信号' + (idx + 1)), url: dbHost + '/play/' + s.playId + '?device=pc_web' };
      });
      list.push({
        vod_id: 'db$' + encodeURIComponent(JSON.stringify({ name: name, links: links })),
        vod_name: name,
        vod_pic: item.teamAImage || item.teamBImage || host + '/logo.png',
        vod_remarks: links.map(function (x) { return x.name; }).join('/') || '直播'
      });
    }
  }
  return list;
}

function parsePlaybackList(json, tid) {
  const rows = json && json.data && Array.isArray(json.data.list) ? json.data.list : [];
  const list = [];
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i].schedule || {};
    const p = rows[i].playback || {};
    const lines = Array.isArray(p.lines) ? p.lines : [];
    if (!lines.length) continue;
    const fullName = cleanText(p.title) || [formatTimeText(s.matchTime), cleanText(s.league), cleanText(s.teamA) + ' vs ' + cleanText(s.teamB), '回放'].filter(Boolean).join(' ');
    if (!matchCategory(tid, s.league, fullName, s.dataType)) continue;
    const shortName = (cleanText(s.teamA) + ' vs ' + cleanText(s.teamB)).replace(/^\s*vs\s*|\s*vs\s*$/g, '') || fullName.replace(/^\d{4}年\d{1,2}月\d{1,2}日\s*/, '').replace(/\s*赛事回放$/, '');
    const remarkPrefix = [formatTimeText(s.matchTime), cleanText(s.league)].filter(Boolean).join(' ');
    const links = lines.map(function (line, idx) {
      return { name: cleanText(line.title) || ('回放' + (idx + 1)), url: absUrl(line.proxyUrl, dbHost) };
    });
    list.push({
      vod_id: 'db$' + encodeURIComponent(JSON.stringify({ name: fullName, links: links })),
      vod_name: shortName,
      vod_pic: s.teamAImage || s.teamBImage || host + '/logo.png',
      vod_remarks: [remarkPrefix, links.map(function (x) { return x.name; }).join('/')].filter(Boolean).join(' · ') || '回放'
    });
  }
  return list;
}

function parseProxySchedule(html, tid) {
  html = String(html || '');
  const list = [];
  const reg = /<article[^>]*class=["'][^"']*px-3 py-3 sm:px-4[^"']*["'][^>]*>[\s\S]*?<\/article>/gi;
  let m;
  while ((m = reg.exec(html)) !== null) {
    const item = m[0];
    const ps = [];
    const pReg = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pm;
    while ((pm = pReg.exec(item)) !== null) ps.push(cleanText(pm[1]));
    const time = ps[0] || '';
    const league = ps[1] || '';

    const teams = [];
    const spanReg = /<span[^>]*class=["'][^"']*truncate[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
    let sm;
    while ((sm = spanReg.exec(item)) !== null) {
      const t = cleanText(sm[1]);
      if (t && !/^信号|高清|返回/.test(t) && teams.indexOf(t) < 0) teams.push(t);
    }
    if (teams.length < 2) continue;
    const name = [time, league, teams[0] + ' vs ' + teams[1]].filter(Boolean).join(' ');
    if (!matchCategory(tid, league, name)) continue;

    const links = [];
    const aReg = /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*home-signal-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let am;
    while ((am = aReg.exec(item)) !== null) {
      const title = (am[0].match(/title=["']([^"']+)["']/i) || [])[1] || cleanText(am[2]) || ('信号' + (links.length + 1));
      links.push({ name: title, url: absUrl(am[1], dbHost) });
    }
    if (!links.length) continue;
    const img = (item.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '/logo.png';
    list.push({
      vod_id: 'db$' + encodeURIComponent(JSON.stringify({ name: name, links: links })),
      vod_name: name,
      vod_pic: absUrl(img, dbHost),
      vod_remarks: links.map(function (x) { return x.name; }).join('/') || '直播'
    });
  }
  return list;
}

async function init(cfg) {
  if (cfg && cfg.ext && String(cfg.ext).indexOf('http') === 0) host = String(cfg.ext).trim().replace(/\/$/, '');
}

async function home(filter) {
  return JSON.stringify({ class: getClasses(), filters: {} });
}

async function homeVod() {
  return await category('zuqiu', 1, false, {});
}

async function category(tid, pg, filter, extend) {
  tid = String((extend && extend.cateId) || tid || 'zuqiu');
  pg = parseInt(pg) || 1;
  let list = [];
  try {
    if (tid === 'huifang') {
      list = parsePlaybackList(await fetchJson(dbPlaybackApi + '?page=' + pg + '&pageSize=20&dataType=all', dbHost + '/'), tid);
    } else {
      list = parseApiSchedule(await fetchJson(dbScheduleApi, dbHost + '/'), tid);
      if (!list.length && tid !== 'lanqiu') {
        list = parseProxySchedule(await fetchText(host + '/proxy.php', host + '/sssc/'), tid);
      }
    }
  } catch (e) {
    list = [];
  }
  return JSON.stringify({ code: 1, msg: '数据列表', page: pg, pagecount: list.length >= 20 ? pg + 1 : 1, limit: 50, total: list.length, list: list });
}

function parseNuxtProxy(html) {
  html = String(html || '');
  const hls = html.match(/(?:\\u002F|\/)hls(?:\\u002F|\/)[A-Za-z0-9._-]+\.m3u8/i);
  if (hls) return absUrl(hls[0].replace(/\\u002F/g, '/'), dbHost);
  const m = html.match(/"proxyUrl"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (m) {
    try { return absUrl(JSON.parse('"' + m[1] + '"'), dbHost); } catch (e) { return absUrl(m[1].replace(/\\u002F/g, '/'), dbHost); }
  }
  const iframe = html.match(/https?:\/\/www\.kanqiuge\.com\/embed\/play\/[A-Za-z0-9._-]+/i);
  if (iframe) return iframe[0];
  return '';
}

async function resolvePlayUrl(playUrl) {
  playUrl = String(playUrl || '');
  if (/\.(m3u8|flv|mp4)(\?|$)/i.test(playUrl)) return playUrl;
  try {
    const html = await fetchText(playUrl, host + '/sssc/');
    return parseNuxtProxy(html) || playUrl;
  } catch (e) {
    return playUrl;
  }
}

async function detail(id) {
  id = Array.isArray(id) ? id[0] : id;
  id = String(id || '');
  if (id.indexOf('db$') === 0) {
    let data = { name: '实时赛程', links: [] };
    try { data = JSON.parse(decodeURIComponent(id.slice(3))); } catch (e) {}
    const playUrls = (data.links || []).map(function (x) { return (x.name || '线路') + '$' + x.url; }).join('#');
    return JSON.stringify({
      code: 1,
      msg: '数据列表',
      page: 1,
      pagecount: 1,
      limit: 1,
      total: 1,
      list: [{
        vod_id: id,
        vod_name: data.name || '实时赛程',
        vod_pic: host + '/logo.png',
        vod_remarks: '直播',
        vod_play_from: '爱球直播',
        vod_play_url: playUrls,
        vod_content: '爱球直播实时赛程，播放时解析豆包直播信号。'
      }]
    });
  }

  let name = '赛事直播';
  let time = '';
  let playUrls = '';
  try {
    const html = await fetchText(id, host + '/');
    name = cleanText((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) || name;
    time = cleanText((html.match(/<div class=["']match-header["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
    const arr = [];
    const aReg = /<div class=["']gohome["'][\s\S]*?<\/div>/i;
    const block = (html.match(aReg) || [])[0] || '';
    const linkReg = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let lm;
    while ((lm = linkReg.exec(block)) !== null) {
      const text = cleanText(lm[2]) || ('信号' + (arr.length + 1));
      if (/赛程|返回|首页/.test(text)) continue;
      const href = lm[1];
      arr.push(text + '$' + (href === '/sssc/' || href.indexOf('/sssc/') >= 0 ? host + '/proxy.php' : absUrl(href, host)));
    }
    if (!arr.length) arr.push('赛程$' + host + '/proxy.php');
    playUrls = arr.join('#');
  } catch (e) {
    playUrls = '赛程$' + host + '/proxy.php';
  }

  return JSON.stringify({
    code: 1,
    msg: '数据列表',
    page: 1,
    pagecount: 1,
    limit: 1,
    total: 1,
    list: [{
      vod_id: id,
      vod_name: name,
      vod_pic: host + '/logo.png',
      vod_remarks: time,
      vod_play_from: '爱球直播',
      vod_play_url: playUrls,
      vod_content: time || '爱球直播赛事导航'
    }]
  });
}

async function search(wd, quick, pg) {
  pg = parseInt(pg) || 1;
  let list = [];
  try {
    const html = await fetchText(host + '/search.html?keywords=' + encodeURIComponent(wd || '') + '&method=1', host + '/');
    list = parseIqList(html);
  } catch (e) {
    list = [];
  }
  return JSON.stringify({ code: 1, msg: '数据列表', page: pg, pagecount: 1, limit: 20, total: list.length, list: list });
}

async function play(flag, id, flags) {
  const url = await resolvePlayUrl(id);
  const direct = /\.(m3u8|flv|mp4)(\?|$)/i.test(String(url || ''));
  return JSON.stringify({
    parse: direct ? 0 : 1,
    url: url,
    header: {
      'User-Agent': UA,
      'Referer': String(url || '').indexOf('doubaozhibo.com') >= 0 ? dbHost + '/' : host + '/'
    }
  });
}

async function homeContent(filter) { return safeJson(await home(filter), { class: [], filters: {} }); }
async function homeVideoContent() { return safeJson(await homeVod(), { list: [] }); }
async function categoryContent(tid, pg, filter, extend) { return safeJson(await category(tid, pg, filter, extend || {}), { list: [] }); }
async function detailContent(ids) { return safeJson(await detail(ids), { list: [] }); }
async function searchContent(wd, quick, pg) { return safeJson(await search(wd, quick, pg || 1), { list: [] }); }
async function playerContent(flag, id, flags) { return safeJson(await play(flag, id, flags), { parse: 1, url: id }); }

return { init, home, homeVod, category, search, detail, play, homeContent, homeVideoContent, categoryContent, detailContent, searchContent, playerContent };

})();

export function __jsEvalReturn() {
  return __sports_src;
}