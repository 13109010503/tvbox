
const HOST = 'http://www.zhibome.net';
const LIVE_HOST = 'http://www.livezhibomi.xyz';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const LOGO = 'http://www.zhibome.net/images/app.png';

/* ========== 工具函数 ========== */
function clean(s) {
    return String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function absUrl(url, base) {
    if (!url) return LOGO;
    url = String(url).trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (url[0] === '/') return (base || HOST).replace(/\/$/, '') + url;
    return (base || HOST).replace(/\/$/, '') + '/' + url;
}

function safeJson(text, def) {
    try { return JSON.parse(text || '{}'); } catch (e) { return def || {}; }
}

function headers() {
    return {
        'User-Agent': UA,
        'Referer': HOST + '/',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9'
    };
}

/* ========== HTTP 请求 ========== */
async function fetchText(url, timeout) {
    const hd = headers();
    const to = timeout || 10000;
    try {
        if (typeof Java !== 'undefined' && Java && Java.req) {
            const r = await Java.req(url, { headers: hd, timeout: to });
            if (typeof r === 'string') return r;
            return String((r && (r.body || r.content || r.data)) || '');
        }
        const r2 = await req(url, { headers: hd, timeout: to });
        if (typeof r2 === 'string') return r2;
        return String((r2 && (r2.content || r2.body || r2.data)) || '');
    } catch (e) {
        return '';
    }
}

/* ========== 缓存 ========== */
let cacheTime = 0;
let cacheHtml = '';

async function fetchHome(force) {
    if (!force && cacheHtml && Date.now() - cacheTime < 30000) return cacheHtml;
    try {
        const html = await fetchText(HOST + '/m.html');
        if (html && html.length > 100) {
            cacheHtml = html;
            cacheTime = Date.now();
            return html;
        }
    } catch (e) {}
    return cacheHtml || '';
}

/* ========== 页面解析 ========== */

/**
 * 从 m.html 的 <ul data-role="listview"> 中提取全部比赛项
 * 返回数组: [{ id, league, time, status, name }]
 */
function parseAllMatches(html) {
    var matches = [];
    var ulStart = html.indexOf('<ul data-role="listview"');
    if (ulStart < 0) return matches;
    var ulEnd = html.indexOf('</ul>', ulStart);
    if (ulEnd < 0) ulEnd = html.length;
    var listSection = html.substring(ulStart, ulEnd);
    
    var reg = /<a\s+href="#page_(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = reg.exec(listSection)) !== null) {
        var id = m[1];
        var anchorContent = m[2];
        
        // 提取联赛名
        var leagueMatch = anchorContent.match(/<span\s+class=["']league["'][^>]*>\s*([^<]*)\s*<\/span>/i);
        var league = leagueMatch ? clean(leagueMatch[1]) : '';
        
        // 提取状态/时间（兼容单引号和双引号）
        var isLive = anchorContent.indexOf("class='live'") >= 0 || anchorContent.indexOf('class="live"') >= 0;
        var timeMatch = anchorContent.match(/<span\s+class=["'](?:live|close)["'][^>]*>\s*([^<]*)\s*<\/span>/i);
        var time = timeMatch ? clean(timeMatch[1]) : '';
        if (!time) {
            var textAfterLeague = anchorContent.replace(/<span[^>]*>[\s\S]*?<\/span>/gi, ' ').trim();
            var timeTextMatch = textAfterLeague.match(/(\d{2}:\d{2})/);
            if (timeTextMatch) time = timeTextMatch[1];
        }
        
        // 提取比赛名称（清理 HTML 标签后的纯净文本）
        var rawText = clean(anchorContent);
        var matchName = rawText;
        if (league && matchName.indexOf(league) >= 0) matchName = matchName.replace(league, '');
        if (time && matchName.indexOf(time) >= 0) matchName = matchName.replace(time, '');
        matchName = matchName.replace(/\s+/g, ' ').trim();
        
        if (!league && !matchName) continue;
        
        matches.push({
            id: id,
            league: league,
            time: time,
            status: isLive ? 'live' : (time ? 'close' : ''),
            name: matchName
        });
    }
    return matches;
}

/**
 * 从 m.html 提取唯一联赛列表（用作分类）
 */
function getClasses(html) {
    var matches = parseAllMatches(html);
    var seen = {};
    var classes = [];
    for (var i = 0; i < matches.length; i++) {
        var league = matches[i].league;
        if (league && !seen[league]) {
            seen[league] = true;
            classes.push({ type_id: league, type_name: league });
        }
    }
    classes.unshift({ type_id: 'all', type_name: '全部赛程' });
    classes.unshift({ type_id: 'live', type_name: '直播中' });
    return classes;
}

/**
 * 从 m.html 提取指定分类/全部的列表（TVBox 列表格式）
 */
function parseList(html, tid) {
    var matches = parseAllMatches(html);
    var list = [];
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        
        if (tid && tid !== 'all') {
            if (tid === 'live') {
                if (m.status !== 'live') continue;
            } else {
                if (m.league !== tid) continue;
            }
        }
        
        var fullName = m.name;
        
        var remarks = '';
        if (m.status === 'live') remarks = '●直播中' + (m.time ? ' ' + m.time : '');
        else if (m.time) remarks = m.time;
        else remarks = '待定';
        if (m.league) remarks = remarks + ' ' + m.league;
        
        list.push({
            vod_id: m.id,
            vod_name: fullName,
            vod_pic: LOGO,
            vod_remarks: remarks,
            vod_tag: m.league
        });
    }
    return list;
}

/**
 * 从 m.html 中提取指定 ID 的详情页内容
 */
function getDetailFromHtml(html, id) {
    var result = { league: '', time: '', name: '', pluUrl: '', bbUrl: '', otherUrls: [] };
    
    var pageId = 'page_' + id;
    var startMark = 'id="' + pageId + '"';
    var startIdx = html.indexOf(startMark);
    if (startIdx < 0) return result;
    
    var divStart = html.lastIndexOf('<div', startIdx);
    if (divStart < 0) divStart = startIdx;
    
    var nextPageDiv = html.indexOf('<div data-role="page"', divStart + 5);
    if (nextPageDiv < 0) nextPageDiv = html.indexOf('</body>', divStart);
    if (nextPageDiv < 0) nextPageDiv = html.length;
    
    var detailSection = html.substring(divStart, nextPageDiv);
    
    var contentMatch = detailSection.match(/<div[^>]*data-role="content"[^>]*class="link"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*data-role="footer"/i);
    if (!contentMatch) {
        contentMatch = detailSection.match(/<div[^>]*data-role="content"[^>]*>([\s\S]*?)<\/div>/i);
    }
    if (!contentMatch) return result;
    
    var contentHtml = contentMatch[1];
    
    var lm = contentHtml.match(/<span\s+class=["']league["'][^>]*>\s*([^<]*)\s*<\/span>/i);
    if (lm) result.league = clean(lm[1]);
    
    var tm = contentHtml.match(/<span\s+class=["'](?:live|close)["'][^>]*>\s*([^<]*)\s*<\/span>/i);
    if (tm) result.time = clean(tm[1]);
    if (!result.time) {
        var ttm = contentHtml.match(/(\d{2}:\d{2})/);
        if (ttm) result.time = ttm[1];
    }
    
    var rawText = clean(contentHtml);
    if (result.league) rawText = rawText.replace(result.league, '');
    if (result.time) rawText = rawText.replace(result.time, '');
    result.name = rawText.replace(/\s+/g, ' ').trim();
    
    var pluMatch = contentHtml.match(/<a[^>]*href="(https?:\/\/[^"]*plu-[^"]*)"[^>]*>/i);
    if (pluMatch) result.pluUrl = pluMatch[1];
    
    var bbMatch = contentHtml.match(/<a[^>]*href="(https?:\/\/[^"]*bb-[^"]*)"[^>]*>/i);
    if (bbMatch) result.bbUrl = bbMatch[1];
    
    var allLinks = contentHtml.match(/<a[^>]*href="(https?:\/\/[^"]+(?:plu|bb|qqlive|live)[^"]*)"[^>]*>/gi);
    if (allLinks) {
        for (var i = 0; i < allLinks.length; i++) {
            var hrefMatch = allLinks[i].match(/href="([^"]+)"/);
            if (hrefMatch) {
                var href = hrefMatch[1];
                if (href !== result.pluUrl && href !== result.bbUrl) {
                    result.otherUrls.push(href);
                }
            }
        }
    }
    
    return result;
}

/* ========== TVBox 接口函数 ========== */

async function init(cfg) {}

async function home(filter) {
    var html = await fetchHome(false);
    if (!html) return JSON.stringify({ class: [], filters: {} });
    var c = getClasses(html);
    return JSON.stringify({ class: c, filters: {} });
}

async function homeVod() {
    var html = await fetchHome(false);
    if (!html) return JSON.stringify({ code: 1, msg: '直播迷', page: 1, pagecount: 1, limit: 0, total: 0, list: [] });
    
    var allMatches = parseAllMatches(html);
    var list = [];
    for (var i = 0; i < allMatches.length && list.length < 30; i++) {
        var m = allMatches[i];
        var fullName = m.name;
        
        list.push({
            vod_id: m.id,
            vod_name: fullName,
            vod_pic: LOGO,
            vod_remarks: (m.status === 'live' ? '🔴直播中' + (m.time ? ' ' + m.time : '') : (m.time || '待定')) + (m.league ? ' ' + m.league : ''),
            vod_tag: m.league
        });
    }
    
    return JSON.stringify({
        code: 1,
        msg: '直播迷',
        page: 1,
        pagecount: 1,
        limit: list.length,
        total: list.length,
        list: list
    });
}

async function category(tid, pg, filter, extend) {
    var html = await fetchHome(false);
    if (!html) return JSON.stringify({ code: 1, msg: '直播迷', page: 1, pagecount: 1, limit: 0, total: 0, list: [] });
    
    var list = parseList(html, tid || 'all');
    
    return JSON.stringify({
        code: 1,
        msg: '直播迷',
        page: parseInt(pg) || 1,
        pagecount: 1,
        limit: list.length,
        total: list.length,
        list: list
    });
}

async function detail(ids) {
    var id = Array.isArray(ids) ? ids[0] : ids;
    id = String(id || '');
    if (!id) return JSON.stringify({ code: 1, msg: '直播迷', page: 1, pagecount: 1, limit: 0, total: 0, list: [] });
    
    var html = await fetchHome(false);
    if (!html) return JSON.stringify({ code: 1, msg: '直播迷', page: 1, pagecount: 1, limit: 0, total: 0, list: [] });
    
    var detailInfo = getDetailFromHtml(html, id);
    
    var playUrls = [];
    if (detailInfo.pluUrl) {
        playUrls.push('原画$' + detailInfo.pluUrl);
    }
    if (detailInfo.bbUrl) {
        playUrls.push('备用$' + detailInfo.bbUrl);
    }
    for (var i = 0; i < detailInfo.otherUrls.length; i++) {
        var label = '线路' + (i + 1);
        playUrls.push(label + '$' + detailInfo.otherUrls[i]);
    }
    
    if (playUrls.length === 0) {
        playUrls.push('直播$' + LIVE_HOST + '/tv/plu-' + id + '.html');
    }
    
    var vodName = detailInfo.name || ('直播-' + id);
    if (detailInfo.league) vodName = '【' + detailInfo.league + '】' + vodName;
    
    return JSON.stringify({
        code: 1,
        msg: '直播迷',
        page: 1,
        pagecount: 1,
        limit: 1,
        total: 1,
        list: [{
            vod_id: id,
            vod_name: vodName,
            vod_pic: LOGO,
            vod_remarks: detailInfo.time ? (detailInfo.time) : '直播中',
            vod_content: '直播迷体育直播 - ' + (detailInfo.league || '') + ' ' + (detailInfo.name || ''),
            vod_play_from: '直播迷',
            vod_play_url: playUrls.join('#')
        }]
    });
}

async function search(wd, quick, pg) {
    return JSON.stringify({
        code: 1,
        msg: '直播迷',
        page: parseInt(pg) || 1,
        pagecount: 1,
        limit: 20,
        total: 0,
        list: []
    });
}

async function play(flag, id, flags) {
    var url = String(id || '');
    
    var ref = LIVE_HOST + '/tv/';
    if (url.indexOf('wtmdjxkq.com') >= 0) {
        ref = LIVE_HOST + '/tv/';
    } else if (url.indexOf('livezhibomi.xyz') >= 0) {
        ref = HOST + '/m.html';
    } else if (url.indexOf('zhibome.net') >= 0) {
        ref = HOST + '/';
    }
    
    var hd = {
        'User-Agent': UA,
        'Referer': ref,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9'
    };
    
    var isDirect = /\.(m3u8|mp4|flv|ts)(\?|$)/i.test(url);
    
    return JSON.stringify({
        parse: isDirect ? 0 : 1,
        url: url,
        header: hd
    });
}

/* ========== 包装函数 ========== */

async function homeContent(filter) {
    return safeJson(await home(filter), { class: [], filters: {} });
}
async function homeVideoContent() {
    return safeJson(await homeVod(), { list: [] });
}
async function categoryContent(tid, pg, filter, extend) {
    return safeJson(await category(tid, pg, filter, extend || {}), { list: [] });
}
async function detailContent(ids) {
    return safeJson(await detail(ids), { list: [] });
}
async function searchContent(wd, quick, pg) {
    return safeJson(await search(wd, quick, pg || 1), { list: [] });
}
async function playerContent(flag, id, flags) {
    return safeJson(await play(flag, id, flags), { parse: 1, url: id });
}

export function __jsEvalReturn() {
    return {
        init, home, homeVod, category, search, detail, play,
        homeContent, homeVideoContent, categoryContent, detailContent,
        searchContent, playerContent
    };
}
