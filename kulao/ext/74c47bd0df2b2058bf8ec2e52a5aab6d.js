//toastlog("damizhibo")
const HOST = 'https://www.damizhibo.com';
const LIST_URL = 'https://www.damizhibo.com/list.json';
const LOGO = 'https://www.damizhibo.com/favicon.ico';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/* ============================================================================
 *   工具函数
 * ============================================================================ */
function clean(s) {
  return String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function absUrl(url) {
  if (!url) return LOGO;
  url = String(url).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;
  if (url[0] === '/') return HOST.replace(/\/$/, '') + url;
  return HOST.replace(/\/$/, '') + '/' + url;
}

function safeJson(t, d) {
  try { return JSON.parse(t || '{}'); } catch(e) { return d || {}; }
}

function getHeaders() {
  return {
    'User-Agent': UA,
    'Referer': HOST + '/',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  };
}

/* ── 网络请求 ── */
async function fetchText(url, timeout) {
  const hd = getHeaders();
  const to = timeout || 8000;
  try {
    if (typeof Java !== 'undefined' && Java && Java.req) {
      const r = await Java.req(url, { headers: hd, timeout: to });
      if (typeof r === 'string') return r;
      return String((r && (r.body || r.content || r.data)) || '');
    }
    const r2 = await req(url, { headers: hd, timeout: to });
    if (typeof r2 === 'string') return r2;
    return String((r2 && (r2.content || r2.body || r2.data)) || '');
  } catch(e) {
    return '';
  }
}

async function fetchJson(url) {
  try { return JSON.parse(await fetchText(url) || '{}'); } catch(e) { return {}; }
}

/* ── 球队Logo缓存 ── */
let _teamLogos = {};
let _logoLoaded = false;

/**
 * 从首页HTML解析球队Logo
 */
async function loadTeamLogos() {
  if (_logoLoaded) return;
  try {
    const html = await fetchText(HOST + '/?_t=' + Date.now());
    if (!html) return;

    // 解析 img 标签：div.team-logo.img-logo > img[src][alt]
    const imgRegex = /<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/g;
    let m;
    while ((m = imgRegex.exec(html)) !== null) {
      const alt = m[2].trim();
      if (alt && alt.length > 1 && !alt.includes('logo') && !alt.includes('Logo')) {
        _teamLogos[alt] = m[1];
      }
    }

    _logoLoaded = true;
  } catch(e) {
    // 静默
  }
}

function getTeamLogo(teamName) {
  return _teamLogos[teamName] || '';
}

/* ── 比赛数据 ── */
async function fetchAllMatches() {
  try {
    const text = await fetchText(LIST_URL);
    if (!text) return [];
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.list && Array.isArray(data.list)) return data.list;
    if (data.result && Array.isArray(data.result)) return data.result;
    return [];
  } catch(e) {
    return [];
  }
}

/* ── 分类判断 ── */
function isFootball(league, sportType) {
  if (sportType === 'football') return true;
  const name = (league || '').toLowerCase();
  const kw = [
    '足球','football','soccer',
    '世界杯','world cup','中超','chinese super','csl',
    '英超','premier','uefa','欧冠','欧联','europa',
    '西甲','laliga','德甲','bundesliga','意甲','serie a',
    '法甲','ligue 1','中甲','中乙','足协杯',
    '亚冠','afc','世预赛','欧国联','nations league',
    '日职','j league','韩k','k league','澳超','a league',
    '荷甲','eredivisie','葡超','primeira liga',
    '俄超','冰岛超','icelandic','爱超',
    '罗甲','捷甲','czech','匈甲','hungarian',
    '中冠','村超','哈萨甲','拉脱超','摩洛超',
    '埃塞超','白俄超','蒙古超','越女联','韩女联',
    '球会友谊','澳威超','澳维超','澳达超','巴西乙',
    '土超','比甲','丹超','挪超','瑞典超','奥超','瑞士超'
  ];
  for (const k of kw) { if (name.includes(k)) return true; }
  return false;
}

function isBasketball(league, sportType) {
  if (sportType === 'basketball') return true;
  const name = (league || '').toLowerCase();
  const kw = [
    '篮球','basketball',
    'nba','wnba','cba','nbl',
    '欧冠篮','euroleague','欧篮',
    '发展联盟','g league','ncaa',
    '新西兰联','nznbl','澳洲篮','nbl australia',
    '印尼联','ibl','日本篮','b league',
    '韩国篮','kbl','菲律宾篮','pba',
    '国际赛女','women international',
    '土篮超','bsl','西篮甲','德篮甲',
    '法篮甲','意篮甲','立陶宛联','lkl',
    'vbl','越南联','泰国联','马来西亚联'
  ];
  for (const k of kw) { if (name.includes(k)) return true; }
  return false;
}

function isHot(league) {
  const name = (league || '').toLowerCase();
  const kw = ['世界杯','world cup','中超','csl','wnba','nba','cba',
    '中冠','冰岛超','icelandic','巴西乙','国际赛'];
  for (const k of kw) { if (name.includes(k)) return true; }
  return false;
}

/* ── 构建VOD ── */
function buildVod(match) {
  if (!match) return null;
  const namiId = String(match.nami_id || match.id || match.match_id || '');
  const homeTeam = match.home_team || match.home || match.team1 || match.team_a || '';
  const awayTeam = match.away_team || match.away || match.team2 || match.team_b || '';
  const leagueName = match.league_name || match.league || match.tournament || match.series || '';
  const timeStr = match.match_time || match.time || match.start_time || match.date || '';

  // 格式化时间
  let remark = leagueName;
  if (timeStr) {
    const t = timeStr.replace(/T/, ' ').substring(0, 16);
    if (t.length >= 10) remark = leagueName + ' ' + t;
  }

  // 🟢 判断是否已开赛（比赛时间 ≤ 当前时间）
  if (timeStr) {
    const cleanTime = timeStr.replace(/T/, ' ').substring(0, 19);
    const matchTime = new Date(cleanTime);
    const now = new Date();
    if (!isNaN(matchTime.getTime()) && matchTime <= now) {
      remark = '●' + remark;
    }
  }

  // 主队Logo
  const logo = getTeamLogo(homeTeam);

  return {
    vod_id: 'dmz|' + namiId,
    vod_name: homeTeam + ' vs ' + awayTeam,
    vod_pic: logo || LOGO,
    vod_remarks: remark,
    vod_content: (leagueName || '体育直播') + '\n' + homeTeam + ' vs ' + awayTeam,
    type_name: leagueName || '全部'
  };
}

/* ── 分类定义 ── */
function getClasses() {
  return [
    { type_id: 'all', type_name: '全部' },
    { type_id: 'hot', type_name: '🔥 热门' },
    { type_id: 'football', type_name: '⚽ 足球' },
    { type_id: 'basketball', type_name: '🏀 篮球' }
  ];
}

/* ============================================================================
 *   爬虫接口
 * ============================================================================ */
async function init(cfg) { }

async function home(filter) {
  return JSON.stringify({ class: getClasses(), filters: {} });
}

async function homeVod() {
  return await category('all', 1, {}, {});
}

async function category(tid, pg, filter, extend) {
  tid = String((extend && extend.cateId) || tid || 'all');
  pg = parseInt(pg) || 1;
  let list = [];

  try {
    await loadTeamLogos();
    const matches = await fetchAllMatches();

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (!m) continue;
      const league = m.league_name || m.league || m.tournament || m.series || '';

      // 分类过滤
      if (tid === 'hot' && !isHot(league)) continue;
      if (tid === 'football' && !isFootball(league)) continue;
      if (tid === 'basketball' && !isBasketball(league)) continue;

      const vod = buildVod(m);
      if (vod) list.push(vod);
    }
  } catch(e) {}

  return JSON.stringify({
    code: 1, msg: '赛程列表', page: pg, pagecount: 1,
    limit: 200, total: list.length, list
  });
}

async function detail(ids) {
  const id = String(Array.isArray(ids) ? ids[0] : ids || '');
  const parts = id.split('|');
  const namiId = parts.length > 1 ? parts[1] : id;

  try {
    await loadTeamLogos();
    const matches = await fetchAllMatches();
    let target = null;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (!m) continue;
      if (String(m.nami_id || m.id || m.match_id || '') === namiId) {
        target = m;
        break;
      }
    }

    if (!target) {
      return JSON.stringify({ code: 1, msg: 'ok', page: 1, pagecount: 1, limit: 1, total: 0, list: [] });
    }

    const homeTeam = target.home_team || target.home || target.team1 || target.team_a || '';
    const awayTeam = target.away_team || target.away || target.team2 || target.team_b || '';
    const leagueName = target.league_name || target.league || target.tournament || target.series || '';
    const signals = target.signals || target.live_signals || [];

    // 构建播放列表
    let playUrls = [];
    if (signals.length > 0) {
      for (let si = 0; si < signals.length; si++) {
        const sig = signals[si];
        const name = sig.label || sig.name || sig.title || '线路' + (si + 1);
        const url = sig.url || sig.link || sig.src || '';
        if (url) {
          playUrls.push(name + '$' + url);
        }
      }
    }

    if (playUrls.length === 0) {
      playUrls.push('暂无信号$' + HOST);
    }

    const vod = {
      vod_id: id,
      vod_name: homeTeam + ' vs ' + awayTeam,
      vod_pic: getTeamLogo(homeTeam) || LOGO,
      vod_remarks: leagueName,
      vod_content: (leagueName || '体育直播') + '\n' + homeTeam + ' vs ' + awayTeam,
      vod_play_from: '大米直播',
      vod_play_url: playUrls.join('#')
    };

    return JSON.stringify({ code: 1, msg: '直播详情', page: 1, pagecount: 1, limit: 1, total: 1, list: [vod] });
  } catch(e) {
    return JSON.stringify({ code: 1, msg: 'ok', page: 1, pagecount: 1, limit: 1, total: 0, list: [] });
  }
}

async function search(wd, quick, pg) {
  const keyword = (wd || '').trim().toLowerCase();
  if (!keyword) {
    return JSON.stringify({ code: 1, msg: '搜索', page: 1, pagecount: 1, limit: 20, total: 0, list: [] });
  }

  try {
    await loadTeamLogos();
    const matches = await fetchAllMatches();
    const list = [];

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (!m) continue;
      const homeTeam = m.home_team || m.home || m.team1 || m.team_a || '';
      const awayTeam = m.away_team || m.away || m.team2 || m.team_b || '';
      const league = m.league_name || m.league || m.tournament || m.series || '';
      const searchText = (homeTeam + ' ' + awayTeam + ' ' + league).toLowerCase();

      if (searchText.indexOf(keyword) === -1) continue;

      const vod = buildVod(m);
      if (vod) list.push(vod);
    }

    return JSON.stringify({ code: 1, msg: '搜索结果', page: pg || 1, pagecount: 1, limit: 50, total: list.length, list });
  } catch(e) {
    return JSON.stringify({ code: 1, msg: '搜索', page: 1, pagecount: 1, limit: 20, total: 0, list: [] });
  }
}

async function play(flag, id, flags) {
  const url = String(id || '');
  if (/\.(m3u8|flv|mp4)(\?|$)/i.test(url)) {
    return JSON.stringify({
      parse: 0, url: url,
      header: {
        'User-Agent': UA,
        'Referer': HOST + '/',
        'Origin': HOST
      }
    });
  }
  return JSON.stringify({
    parse: 1, url: url,
    header: {
      'User-Agent': UA,
      'Referer': HOST + '/',
      'Origin': HOST
    }
  });
}

/* ============================================================================
 *   包装函数（统一响应格式）
 * ============================================================================ */
async function homeContent(f) {
  return safeJson(await home(f), { class: [], filters: {} });
}

async function homeVideoContent() {
  return safeJson(await homeVod(), { list: [] });
}

async function categoryContent(tid, pg, f, ext) {
  return safeJson(await category(tid, pg, f, ext || {}), { list: [] });
}

async function detailContent(ids) {
  return safeJson(await detail(ids), { list: [] });
}

async function searchContent(wd, q, pg) {
  return safeJson(await search(wd, q, pg || 1), { list: [] });
}

async function playerContent(flag, id, flags) {
  return safeJson(await play(flag, id, flags), { parse: 1, url: id });
}

/* ============================================================================
 *   引擎导出 — 全局函数模式
 * ============================================================================ */
export function __jsEvalReturn() {
  return {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    search: search,
    detail: detail,
    play: play,
    homeContent: homeContent,
    homeVideoContent: homeVideoContent,
    categoryContent: categoryContent,
    detailContent: detailContent,
    searchContent: searchContent,
    playerContent: playerContent
  };
}
