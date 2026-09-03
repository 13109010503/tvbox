
const DB_HOST = 'https://www.doubaozhibo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// ========== 工具函数 ==========
function cleanText(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function absUrl(url, base) {
    url = String(url || '').trim();
    base = base || DB_HOST;
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (url.charAt(0) === '/') return base.replace(/\/$/, '') + url;
    return base.replace(/\/$/, '') + '/' + url;
}

function fmtTime(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const pad = n => String(n).padStart(2, '0');
        return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) {
        return '';
    }
}

function getHeaders(ref) {
    return {
        'User-Agent': UA,
        'Referer': ref || DB_HOST + '/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    };
}

async function fetchText(url, ref) {
    const hd = getHeaders(ref || DB_HOST + '/');
    try {
        if (typeof Java !== 'undefined' && Java && Java.req) {
            const r = await Java.req(url, {
                headers: hd
            });
            if (typeof r === 'string') return r;
            const code = Number((r && (r.statusCode || r.status || r.code)) || 0);
            const loc = r && r.headers && r.headers.location;
            if (loc && code >= 300 && code < 400) return await fetchText(absUrl(loc, url), ref);
            return String((r && (r.body || r.content || r.data)) || '');
        }
        const r2 = await req(url, {
            headers: hd
        });
        if (typeof r2 === 'string') return r2;
        const code2 = Number((r2 && (r2.statusCode || r2.status || r2.code)) || 0);
        const loc2 = r2 && r2.headers && r2.headers.location;
        if (loc2 && code2 >= 300 && code2 < 400) return await fetchText(absUrl(loc2, url), ref);
        return String((r2 && (r2.content || r2.body || r2.data)) || '');
    } catch (e) {
        return '';
    }
}

async function fetchJson(url, ref) {
    try {
        const text = await fetchText(url, ref || DB_HOST + '/');
        return JSON.parse(text || '{}');
    } catch (e) {
        return {};
    }
}

// ========== 分类 ==========
function getClasses() {
    return [{
            type_id: 'all',
            type_name: '⚽全部'
        },
        {
            type_id: 'important',
            type_name: '⭐重要'
        },
        {
            type_id: 'football',
            type_name: '⚽足球'
        },
        {
            type_id: 'basketball',
            type_name: '🏀篮球'
        },
        {
            type_id: 'worldcup',
            type_name: '🌍世界杯'
        },
        {
            type_id: 'playback',
            type_name: '📺回放'
        }
    ];
}

// ========== m3u8 缓存 ==========
const m3u8Cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10分钟

function getCached(key) {
    const entry = m3u8Cache[key];
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry.url;
    return null;
}

function setCache(key, url) {
    m3u8Cache[key] = {
        url: url,
        time: Date.now()
    };
}

// ========== 解析 m3u8 ==========
async function resolveM3u8(playUrl) {
    if (!playUrl) return '';
    // 已经是直链
    if (/\.(m3u8|flv|mp4)(\?|$)/i.test(playUrl)) return playUrl;

    // 查缓存
    const cached = getCached(playUrl);
    if (cached) return cached;

    try {
        const html = await fetchText(playUrl, DB_HOST + '/replay');
        // 优先找 proxyUrl
        let m = html.match(/"proxyUrl"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (m) {
            try {
                const url = absUrl(JSON.parse('"' + m[1] + '"'), DB_HOST);
                if (/\.(m3u8|flv|mp4)(\?|$)/i.test(url)) {
                    setCache(playUrl, url);
                    return url;
                }
            } catch (e) {}
        }
        // 找直接 m3u8
        m = html.match(/(?:https?:)?\/\/[^"']+\.m3u8[^"'\s]*/i);
        if (m) {
            const url = absUrl(m[0], DB_HOST);
            setCache(playUrl, url);
            return url;
        }
        // 找 /hls/ 路径
        m = html.match(/\/hls\/[A-Za-z0-9._-]+\.m3u8/i);
        if (m) {
            const url = absUrl(m[0], DB_HOST);
            setCache(playUrl, url);
            return url;
        }
        // 兜底：iframe
        m = html.match(/https?:\/\/www\.kanqiuge\.com\/embed\/play\/[A-Za-z0-9._-]+/i);
        if (m) return m[0];
        return playUrl;
    } catch (e) {
        return playUrl;
    }
}

// ========== API 赛程解析 ==========
function parseApiSchedule(json, tid) {
    try {
        const days = json && json.data && Array.isArray(json.data.days) ? json.data.days : [];
        const list = [];
        for (let i = 0; i < days.length; i++) {
            const rows = Array.isArray(days[i].live) ? days[i].live : [];
            for (let j = 0; j < rows.length; j++) {
                const item = rows[j];
                const signals = Array.isArray(item.signals) ? item.signals : [];
                if (!signals.length) continue;
                const league = cleanText(item.league || '');
                const statusTag = item.status === 1 ? '🔴' : item.status === 2 ? '✅' : '';
                const teamA = cleanText(item.teamA || '');
                const teamB = cleanText(item.teamB || '');
                const dataType = String(item.dataType || '');
                // 分类过滤
                if (tid && tid !== 'all') {
                    if (tid === 'important' && !item.isImportant) continue;
                    if (tid === 'football' && dataType !== 'football') continue;
                    if (tid === 'basketball' && dataType !== 'basketball') continue;
                    if (tid === 'worldcup' && !/世界杯/i.test(league)) continue;
                }
                //原先name = [statusTag, fmtTime(item
                const name = [fmtTime(item.matchTime), league, teamA + ' vs ' + teamB].filter(Boolean).join(' ');
                const linkNames = signals.map(s => cleanText(s.name || s.label || '')).filter(Boolean).join('/');
                list.push({
                    vod_id: 'live_' + item.id,
                    vod_name: name,
                    vod_pic: absUrl(item.teamAImage || item.teamBImage || '', DB_HOST) || DB_HOST + '/logo.png',
                    vod_remarks: (statusTag ? statusTag + " " : "") + (linkNames || "直播")
                });
                // 存信号信息到缓存
                const sigData = signals.map(s => ({
                    name: cleanText(s.name || s.label || '信号'),
                    url: absUrl('/play/' + s.playId, DB_HOST)
                }));
                setCache('detail_' + item.id, JSON.stringify({
                    name: name,
                    signals: sigData
                }));
            }
        }
        return list;
    } catch (e) {
        return [];
    }
}

// ========== 回放列表解析 ==========
function parsePlaybackList(json, tid) {
    try {
        const list = json && json.data && Array.isArray(json.data.list) ? json.data.list : [];
        const result = [];
        for (let i = 0; i < list.length; i++) {
            const entry = list[i];
            const s = entry.schedule || {};
            const pb = entry.playback || {};
            const lines = Array.isArray(pb.lines) ? pb.lines : [];
            if (!lines.length) continue;
            const league = cleanText(s.league || '');
            const teamA = cleanText(s.teamA || '');
            const teamB = cleanText(s.teamB || '');
            const dataType = String(s.dataType || '');
            if (tid && tid !== 'all' && tid !== 'playback') {
                if (tid === 'important' && !s.isImportant) continue;
                if (tid === 'football' && dataType !== 'football') continue;
                if (tid === 'basketball' && dataType !== 'basketball') continue;
                if (tid === 'worldcup' && !/世界杯/i.test(league)) continue;
            }
            const scoreA = s.teamAscore !== undefined && s.teamAscore !== null ? s.teamAscore : '';
            const scoreB = s.teamBscore !== undefined && s.teamBscore !== null ? s.teamBscore : '';
            const scoreStr = (scoreA !== '' && scoreB !== '') ? (scoreA + '-' + scoreB) : '';
            const timeStr = fmtTime(s.matchTime);
            const name = [teamA + ' vs ' + teamB, scoreStr ? '(' + scoreStr + ')' : ''].filter(Boolean).join(' ');
            const remark = [timeStr, league, '回放'].filter(Boolean).join(' ');
            result.push({
                vod_id: 'pb_' + (pb.id || s.id || i),
                vod_name: name,
                vod_pic: absUrl(s.teamAImage || s.teamBImage || '', DB_HOST) || DB_HOST + '/logo.png',
                vod_remarks: remark
            });
            // 存回放信号
            const lineData = lines.map(l => ({
                name: cleanText(l.title || '信号'),
                url: absUrl(l.proxyUrl || '', DB_HOST)
            }));
            setCache('pb_detail_' + (pb.id || s.id || i), JSON.stringify({
                name: name,
                signals: lineData
            }));
        }
        return result;
    } catch (e) {
        return [];
    }
}

// ========== 首页 HTML 降级解析 ==========
function parseHomeHtml(html, tid) {
    try {
        const list = [];
        // 匹配比赛卡片 article
        const articleReg = /<article[^>]*class="[^"]*px-3 py-3 sm:px-4[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
        let m;
        while ((m = articleReg.exec(html)) !== null) {
            const block = m[0];
            // 提取 league
            const leagueMatch = block.match(/<p[^>]*class="[^"]*truncate[^"]*text-xs[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
            const league = leagueMatch ? cleanText(leagueMatch[1]) : '';
            if (tid === 'worldcup' && !/世界杯/i.test(league)) continue;

            // 提取队名
            const spanMatches = block.match(/<span[^>]*class="[^"]*truncate[^"]*"[^>]*>([\s\S]*?)<\/span>/gi);
            const teams = [];
            if (spanMatches) {
                for (let k = 0; k < spanMatches.length; k++) {
                    const t = cleanText(spanMatches[k].replace(/<[^>]+>/g, ''));
                    if (t && t.length > 1 && !/^信号|高清|返回|咪咕|CCTV|小红书|粤语|爱尔达|广东体育|澳门体育/.test(t)) {
                        teams.push(t);
                    }
                }
            }
            if (teams.length < 2) continue;

            // 提取信号链接
            const signals = [];
            const aMatches = block.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*home-signal-link[^"]*"[^>]*title="([^"]*)"[^>]*>/gi);
            if (aMatches) {
                for (let k = 0; k < aMatches.length; k++) {
                    const hrefMatch = aMatches[k].match(/href="([^"]+)"/i);
                    const titleMatch = aMatches[k].match(/title="([^"]+)"/i);
                    if (hrefMatch) {
                        signals.push({
                            name: titleMatch ? cleanText(titleMatch[1]) : ('信号' + (k + 1)),
                            url: absUrl(hrefMatch[1], DB_HOST)
                        });
                    }
                }
            }
            if (!signals.length) continue;

            // 比分
            let scoreText = '';
            const scoreDiv = block.match(/<div[^>]*class="[^"]*(?:home-score|bg-slate-100)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (scoreDiv) {
                const s = cleanText(scoreDiv[1]);
                if (s && s !== '-') scoreText = s;
            }

            const name = [league, teams.join(' vs '), scoreText ? '(' + scoreText + ')' : ''].filter(Boolean).join(' ');
            const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
            list.push({
                vod_id: 'html_' + Date.now() + '_' + list.length,
                vod_name: name,
                vod_pic: imgMatch ? absUrl(imgMatch[1], DB_HOST) : (DB_HOST + '/logo.png'),
                vod_remarks: signals.map(s => s.name).join('/') || '直播'
            });
            // 缓存信号
            setCache('detail_html_' + list.length, JSON.stringify({
                name: name,
                signals: signals
            }));
        }
        return list;
    } catch (e) {
        return [];
    }
}

// ========== 播放页 NUXT 解析 m3u8 ==========
function parsePlayPageM3u8(html) {
    if (!html) return '';
    // 找 proxyUrl
    let m = html.match(/"proxyUrl"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (m) {
        try {
            const url = absUrl(JSON.parse('"' + m[1] + '"'), DB_HOST);
            if (/\.(m3u8|flv|mp4)(\?|$)/i.test(url)) return url;
        } catch (e) {}
    }
    // 直接 m3u8
    m = html.match(/(?:https?:)?\/\/[^"']+\.m3u8[^"'\s]*/i);
    if (m) return absUrl(m[0], DB_HOST);
    // /hls/ 路径
    m = html.match(/\/hls\/[A-Za-z0-9._-]+\.m3u8/i);
    if (m) return absUrl(m[0], DB_HOST);
    return '';
}

// ========== 公开接口 ==========
async function init(cfg) {}

async function home(filter) {
    return JSON.stringify({
        class: getClasses(),
        filters: {}
    });
}

async function homeVod() {
    return await category('all', 1, false, {});
}

async function category(tid, pg, filter, extend) {
    tid = String((extend && extend.cateId) || tid || 'all');
    pg = parseInt(pg) || 1;
    let list = [];

    try {
        if (tid === 'playback') {
            // 回放
            const json = await fetchJson(DB_HOST + '/api/v1/playbacks?page=1&pageSize=30&dataType=all', DB_HOST + '/replay');
            list = parsePlaybackList(json, tid);
        } else {
            // 直播赛程 - 调 API
            const json = await fetchJson(DB_HOST + '/api/v1/schedules/public/local', DB_HOST + '/');
            list = parseApiSchedule(json, tid);
            // API 没数据则降级 HTML
            if (!list.length) {
                const html = await fetchText(DB_HOST + '/', DB_HOST + '/');
                list = parseHomeHtml(html, tid);
            }
        }
    } catch (e) {
        list = [];
    }

    return JSON.stringify({
        code: 1,
        msg: '数据列表',
        page: pg,
        pagecount: list.length >= 20 ? pg + 1 : 1,
        limit: 50,
        total: list.length,
        list: list
    });
}

async function detail(ids) {
    const id = String(Array.isArray(ids) ? ids[0] : ids || '');
    if (!id) return JSON.stringify({
        code: 1,
        list: []
    });

    // 直播详情
    if (id.indexOf('live_') === 0 || id.indexOf('html_') === 0) {
        const cacheKey = 'detail_' + id.replace(/^live_/, '').replace(/^html_/, '');
        let data = null;
        const cached = getCached('detail_' + (id.indexOf('live_') === 0 ? id.replace('live_', '') : ''));
        // 尝试不同 key 获取缓存
        const raw = getCached('detail_' + id.replace(/^(live_|html_)/, ''));
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch (e) {}
        }
        // 从首页缓存找
        if (!data) {
            // 从 signals 缓存中查找
            for (const key in m3u8Cache) {
                if (key.indexOf('detail_') === 0 && key.indexOf(id.replace(/^(live_|html_)/, '')) > 0) {
                    try {
                        data = JSON.parse(m3u8Cache[key].url);
                    } catch (e) {}
                    break;
                }
            }
        }
        if (!data) {
            // 最后尝试从 NUXT 解析
            try {
                const html = await fetchText(DB_HOST + '/', DB_HOST + '/');
                // 简单提取匹配的比赛
                data = {
                    name: '比赛',
                    signals: [{
                        name: '高清1',
                        url: DB_HOST + '/play/1-1-1'
                    }]
                };
            } catch (e) {
                data = {
                    name: '比赛',
                    signals: []
                };
            }
        }
        const signals = data && data.signals ? data.signals : [];
        if (!signals.length) {
            return JSON.stringify({
                code: 1,
                list: [{
                    vod_id: id,
                    vod_name: data && data.name ? data.name : '比赛',
                    vod_pic: DB_HOST + '/logo.png',
                    vod_remarks: '暂无信号',
                    vod_play_from: '豆包直播',
                    vod_play_url: '暂无$' + DB_HOST + '/',
                    vod_content: '暂无可用信号'
                }]
            });
        }

        const playUrls = signals.map(s => (s.name || '信号') + '$' + s.url).join('#');
        return JSON.stringify({
            code: 1,
            list: [{
                vod_id: id,
                vod_name: data.name || '比赛',
                vod_pic: DB_HOST + '/logo.png',
                vod_remarks: signals.length + '个信号',
                vod_play_from: '豆包直播',
                vod_play_url: playUrls,
                vod_content: data.name || ''
            }]
        });
    }

    // 回放详情
    if (id.indexOf('pb_') === 0) {
        const pbId = id.replace('pb_', '');
        // 从缓存拿回放信号
        const cached = getCached('pb_detail_' + pbId);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const signals = data.signals || [];
                if (signals.length) {
                    const playUrls = signals.map(s => (s.name || '信号') + '$' + s.url).join('#');
                    return JSON.stringify({
                        code: 1,
                        list: [{
                            vod_id: id,
                            vod_name: data.name || '回放',
                            vod_pic: DB_HOST + '/logo.png',
                            vod_remarks: signals.length + '个信号',
                            vod_play_from: '豆包直播',
                            vod_play_url: playUrls,
                            vod_content: data.name || ''
                        }]
                    });
                }
            } catch (e) {}
        }
        // 缓存没命中，调 API
        try {
            const json = await fetchJson(DB_HOST + '/api/v1/playbacks?page=1&pageSize=30&dataType=all', DB_HOST + '/replay');
            const list = json && json.data && Array.isArray(json.data.list) ? json.data.list : [];
            for (let i = 0; i < list.length; i++) {
                const entry = list[i];
                const s = entry.schedule || {};
                const pb = entry.playback || {};
                const lines = Array.isArray(pb.lines) ? pb.lines : [];
                // 匹配 playbackId 或 id
                if (String(pb.id) === pbId || String(s.id) === pbId) {
                    if (lines.length) {
                        const teamA = cleanText(s.teamA || '');
                        const teamB = cleanText(s.teamB || '');
                        const scoreA = s.teamAscore !== undefined ? s.teamAscore : '';
                        const scoreB = s.teamBscore !== undefined ? s.teamBscore : '';
                        const scoreStr = (scoreA !== '' && scoreB !== '') ? ' (' + scoreA + '-' + scoreB + ')' : '';
                        const name = teamA + ' vs ' + teamB + scoreStr;
                        const playUrls = lines.map(l => (cleanText(l.title) || '信号') + '$' + absUrl(l.proxyUrl || '', DB_HOST)).join('#');
                        return JSON.stringify({
                            code: 1,
                            list: [{
                                vod_id: id,
                                vod_name: name,
                                vod_pic: absUrl(s.teamAImage || s.teamBImage || '', DB_HOST) || DB_HOST + '/logo.png',
                                vod_remarks: lines.length + '个信号',
                                vod_play_from: '豆包直播',
                                vod_play_url: playUrls,
                                vod_content: name
                            }]
                        });
                    }
                }
            }
        } catch (e) {}
        // 兜底
        return JSON.stringify({
            code: 1,
            list: [{
                vod_id: id,
                vod_name: '回放',
                vod_pic: DB_HOST + '/logo.png',
                vod_remarks: '暂无信号',
                vod_play_from: '豆包直播',
                vod_play_url: '暂无$' + DB_HOST + '/',
                vod_content: '暂无可用信号'
            }]
        });
    }

    return JSON.stringify({
        code: 1,
        list: []
    });
}

async function search(wd, quick, pg) {
    return JSON.stringify({
        code: 1,
        list: []
    });
}

async function play(flag, id, flags) {
    const url = String(id || '');
    // 已经是直链 m3u8
    if (/\.(m3u8|flv|mp4)(\?|$)/i.test(url)) {
        return JSON.stringify({
            parse: 0,
            url: url,
            header: {
                'User-Agent': UA,
                'Referer': DB_HOST + '/',
                'Origin': 'https://www.doubaozhibo.com'
            }
        });
    }
    // 是 play 页面 URL，需要解析
    let m3u8 = getCached('m3u8_' + url);
    if (!m3u8) {
        m3u8 = await resolveM3u8(url);
        if (m3u8 && m3u8 !== url) setCache('m3u8_' + url, m3u8);
    }
    if (m3u8 && /\.(m3u8|flv|mp4)(\?|$)/i.test(m3u8)) {
        return JSON.stringify({
            parse: 0,
            url: m3u8,
            header: {
                'User-Agent': UA,
                'Referer': DB_HOST + '/',
                'Origin': 'https://www.doubaozhibo.com'
            }
        });
    }
    // 降级
    return JSON.stringify({
        parse: 1,
        url: url,
        header: {
            'User-Agent': UA,
            'Referer': DB_HOST + '/'
        }
    });
}

// ========== 导出 ==========
async function homeContent(filter) {
    try {
        return JSON.parse(await home(filter));
    } catch (e) {
        return {
            class: [],
            filters: {}
        };
    }
}
async function homeVideoContent() {
    try {
        return JSON.parse(await category('all', 1, false, {}));
    } catch (e) {
        return {
            list: []
        };
    }
}
async function categoryContent(tid, pg, filter, extend) {
    try {
        return JSON.parse(await category(tid, pg, filter, extend || {}));
    } catch (e) {
        return {
            list: []
        };
    }
}
async function detailContent(ids) {
    try {
        return JSON.parse(await detail(ids));
    } catch (e) {
        return {
            list: []
        };
    }
}
async function searchContent(wd, quick, pg) {
    try {
        return JSON.parse(await search(wd, quick, pg || 1));
    } catch (e) {
        return {
            list: []
        };
    }
}
async function playerContent(flag, id, flags) {
    try {
        return JSON.parse(await play(flag, id, flags));
    } catch (e) {
        return {
            parse: 1,
            url: id || ''
        };
    }
}

export function __jsEvalReturn() {
    return {
        init,
        home,
        homeVod,
        category,
        search,
        detail,
        play,
        homeContent,
        homeVideoContent,
        categoryContent,
        detailContent,
        searchContent,
        playerContent
    };
}