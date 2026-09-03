// 006直播 V1.3 - 修复足球频道提取：支持/live-1/和/live-2/两种路径
const HOST = 'https://hot.006shipin.com';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

function getHeaders() {
    return {
        'User-Agent': UA,
        'Referer': HOST + '/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'keep-alive'
    };
}

async function fetchHtml(url) {
    const hd = getHeaders();
    // Java.req
    try {
        if (typeof Java !== 'undefined' && Java && Java.req) {
            const r = await Java.req(url, { headers: hd, method: 'GET' });
            if (typeof r === 'string' && r.length > 1000) return r;
            if (r && typeof r === 'object') {
                for (const f of ['body', 'content', 'data', 'bodyRaw', 'text']) {
                    if (r[f] && String(r[f]).length > 1000) return String(r[f]);
                }
            }
        }
    } catch (e) {}
    // req
    try {
        if (typeof req === 'function') {
            const r = await req(url, { headers: hd, method: 'GET' });
            if (typeof r === 'string' && r.length > 1000) return r;
            if (r && typeof r === 'object') {
                for (const f of ['content', 'body', 'data', 'bodyRaw', 'text']) {
                    if (r[f] && String(r[f]).length > 1000) return String(r[f]);
                }
            }
        }
    } catch (e) {}
    // fetch
    try {
        if (typeof fetch === 'function') {
            const resp = await fetch(url, { method: 'GET', headers: hd });
            const t = await resp.text();
            if (t.length > 1000) return t;
        }
    } catch (e) {}
    // XHR
    try {
        if (typeof XMLHttpRequest !== 'undefined') {
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                for (const k in hd) xhr.setRequestHeader(k, hd[k]);
                xhr.onload = () => resolve(xhr.responseText || '');
                xhr.onerror = () => resolve('');
                xhr.send();
            });
        }
    } catch (e) {}
    return '';
}

function getToday() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return m + '月' + dd + '日';
}

function parseMatches(html) {
    const result = [];
    const today = getToday();
    const regex = /id="t_(\d+)"([\s\S]*?)(?=id="t_|$)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const matchId = match[1];
        const block = match[2];

        // 日期
        const dateM = block.match(/(\d{2}月\d{2}日)/);
        const currentDate = dateM ? dateM[1] : today;

        // 联赛名
        const leagueM = block.match(/<div[^>]*title="([^"]+)"[^>]*>/);
        const league = leagueM ? leagueM[1] : '未知赛事';

        // 时间
        const timeM = block.match(/<span>(\d{1,2}:\d{2})<\/span>/);
        const matchTime = timeM ? timeM[1] : '';

        // 状态 - 通过CSS class判断直播中
        const statusM = block.match(/<div class="text-12 relative text-nowrap[^"]*">([\s\S]*?)<\/div>/);
        let status = '';
        let isLive = false;
        if (statusM) {
            const fullTag = statusM[0];
            status = statusM[1].replace(/<[^>]+>/g, '').trim();
            if (fullTag.indexOf('text-error') !== -1) isLive = true;
        }

        // 主队
        const homeM = block.match(/<div class="flex-1 p-3 home-name max-w-full">(.*?)<\/div>/s);
        const homeTeam = homeM ? homeM[1].replace(/<[^>]+>/g, '').trim() : '';

        // 客队
        const awayM = block.match(/<div class="flex-1 p-3 away-name max-w-full">(.*?)<\/div>/s);
        const awayTeam = awayM ? awayM[1].replace(/<[^>]+>/g, '').trim() : '';

        // 比分
        const scoreM = block.match(/<div class="text-15 text-default">([\s\S]*?)<\/div>/);
        let score = 'VS';
        if (scoreM) {
            let scoreText = scoreM[1].replace(/<[^>]+>/g, '').trim();
            scoreText = scoreText.replace(/\s+/g, ' ').trim();
            if (/\d+\s*-\s*\d+/.test(scoreText)) {
                score = scoreText.replace(/\s+/g, '');
            }
        }

        // 显示比分
        let displayScore = '0:0';
        if (status !== '未' && status !== '') {
            displayScore = score !== 'VS' ? score.replace('-', ':') : '0:0';
        }

        const vodName = homeTeam + ' ' + displayScore + ' ' + awayTeam;
        const statusIcon = isLive ? '\u{1F7E2}' : '';  // 🟢

        // 备注
        let remarks = '';
        if (matchTime) {
            remarks = statusIcon + today + ' ' + matchTime + ' ' + league;
        } else {
            remarks = statusIcon + currentDate + ' ' + league;
        }

        const vodId = '006|' + matchId;

        // 队徽
        let vodPic = '';
        const picM = block.match(/src="(https?:\/\/[^"]+team[^"]+\.png[^"]*)"/);
        if (picM) vodPic = picM[1];

        // 频道
        const channelLinks = [];
        const chRegex = /<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/g;
        let chMatch;
        while ((chMatch = chRegex.exec(block)) !== null) {
            channelLinks.push({ name: chMatch[2], url: HOST + chMatch[1] });
        }
        const channelCount = channelLinks.length;
        if (channelCount > 0) {
            remarks += ' (' + channelCount + '路)';
        }

        // 运动类型
        let sportType = 'other';
        if (block.indexOf('basketball.png') !== -1) {
            sportType = 'basketball';
        } else if (block.indexOf('football.png') !== -1) {
            sportType = 'football';
        } else if (['篮球', 'NBA', 'CBA', 'WNBA', 'MPBL'].some(k => league.indexOf(k) !== -1)) {
            sportType = 'basketball';
        } else if (['足球', '联', '杯', '超', '甲', '乙', '杯赛'].some(k => league.indexOf(k) !== -1)) {
            sportType = 'football';
        }

        result.push({
            vod_id: vodId,
            vod_name: vodName,
            vod_pic: vodPic,
            vod_remarks: remarks,
            type_name: league,
            sport_type: sportType
        });
    }
    return result;
}

// ========== 旧版接口(返回JSON字符串) ==========

async function home(filter) {
    const classes = [
        { type_id: 'all', type_name: '\u5168\u90E8' },
        { type_id: 'football', type_name: '\u8DB3\u7403' },
        { type_id: 'basketball', type_name: '\u7BEE\u7403' },
        { type_id: 'other', type_name: '\u7EFC\u5408' }
    ];
    return JSON.stringify({ class: classes, list: [], filters: {} });
}

async function category(tid, pg, filter, extend) {
    const html = await fetchHtml(HOST + '/');
    if (!html || html.length < 1000) {
        return JSON.stringify({ page: 1, pagecount: 1, limit: 30, total: 0, list: [] });
    }
    let matches = parseMatches(html);
    if (tid !== 'all') {
        matches = matches.filter(m => m.sport_type === tid);
    }
    return JSON.stringify({ page: 1, pagecount: 1, limit: 30, total: matches.length, list: matches });
}

async function detail(ids) {
    try {
        let vid = '';
        if (Array.isArray(ids) && ids.length > 0) {
            const first = ids[0];
            vid = (typeof first === 'object' && first !== null && first.vod_id) ? first.vod_id : String(first);
        } else {
            vid = ids ? String(ids) : '';
        }
        if (!vid) return JSON.stringify({ list: [] });

        const parts = vid.split('|');
        if (parts.length < 2) return JSON.stringify({ list: [] });
        const matchId = parts[1];

        const html = await fetchHtml(HOST + '/');
        if (!html || html.length < 1000) return JSON.stringify({ list: [] });

        const matches = parseMatches(html);
        for (const m of matches) {
            const mid = m.vod_id.split('|').pop();
            if (mid === matchId) {
                const homeTeam = m.vod_name.split(' ')[0] || '';
                const channelLinks = [];
                const blockRegex = new RegExp('id="t_' + matchId + '"([\\s\\S]*?)(?=id="t_|$)');
                const blockM = html.match(blockRegex);
                if (blockM) {
                    const chRegex = /<a[^>]*href="(\/live-[12]\/\d+\?_tv=\d+)"[^>]*title="([^"]+)"/g;
                    let chMatch;
                    while ((chMatch = chRegex.exec(blockM[1])) !== null) {
                        channelLinks.push({ name: chMatch[2], url: HOST + chMatch[1] });
                    }
                }
                let fromNames = channelLinks.map(c => c.name);
                let fromUrls = channelLinks.map(c => c.url);
                if (fromNames.length === 0) {
                    fromNames = [homeTeam || '\u9ED8\u8BA4\u76F4\u64AD'];
                    fromUrls = [HOST + '/live-2/' + matchId];
                }
                const detail = {
                    vod_id: vid,
                    vod_name: m.vod_name,
                    vod_pic: m.vod_pic || '',
                    vod_remarks: m.vod_remarks || '',
                    type_name: m.type_name || '\u76F4\u64AD',
                    vod_year: '',
                    vod_lang: '',
                    vod_area: '',
                    vod_director: '',
                    vod_actor: '',
                    vod_content: '',
                    vod_play_from: fromNames.join('$$$'),
                    vod_play_url: fromUrls.join('$$$')
                };
                return JSON.stringify({ list: [detail] });
            }
        }
        return JSON.stringify({ list: [] });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

async function search(wd, quick, pg) {
    const html = await fetchHtml(HOST + '/');
    if (!html || html.length < 1000) {
        return JSON.stringify({ page: 1, pagecount: 1, limit: 30, total: 0, list: [] });
    }
    const allMatches = parseMatches(html);
    const kw = (wd || '').toLowerCase();
    const result = allMatches.filter(m =>
        (m.vod_name || '').toLowerCase().indexOf(kw) !== -1 ||
        (m.type_name || '').toLowerCase().indexOf(kw) !== -1
    );
    return JSON.stringify({ page: 1, pagecount: 1, limit: 30, total: result.length, list: result });
}

async function play(flag, id, flags) {
    let url = id ? String(id) : '';
    if (url && url.indexOf('http') !== 0) {
        url = HOST + url;
    }
    return JSON.stringify({ parse: 1, url: url, header: getHeaders() });
}

// ========== 新版接口(返回对象) ==========

async function homeContent(filter) {
    try { return JSON.parse(await home(filter)); }
    catch (e) { return { class: [], list: [], filters: {} }; }
}

async function homeVideoContent() {
    try { return JSON.parse(await category('all', 1, false, {})); }
    catch (e) { return { page: 1, pagecount: 1, limit: 30, total: 0, list: [] }; }
}

async function categoryContent(tid, pg, filter, extend) {
    try { return JSON.parse(await category(tid, pg, filter, extend)); }
    catch (e) { return { page: 1, pagecount: 1, limit: 30, total: 0, list: [] }; }
}

async function detailContent(ids) {
    try { return JSON.parse(await detail(ids)); }
    catch (e) { return { list: [] }; }
}

async function playerContent(flag, id, flags) {
    try { return JSON.parse(await play(flag, id, flags)); }
    catch (e) { return { parse: 1, url: id || '', header: {} }; }
}

async function searchContent(wd, quick, pg) {
    try { return JSON.parse(await search(wd, quick, pg)); }
    catch (e) { return { page: 1, pagecount: 1, limit: 30, total: 0, list: [] }; }
}

export function __jsEvalReturn() {
    return {
        init: function () {},
        home, homeVod: category, category, detail, play, search,
        homeContent, homeVideoContent, categoryContent, detailContent, playerContent, searchContent
    };
}