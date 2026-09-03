// ============================================================
// zuqiu200直播爬虫 v1 (CatVod格式)
// 将Python版本转换为TVBox兼容的JS格式
// ============================================================

const API_HOST = 'https://enskweeseey8kp2frvb06.k8v4dh4.app';
const HOST = 'https://zuqiu200.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ========== 工具函数 ==========
function getHeaders() {
    return {
        'User-Agent': UA,
        'Referer': HOST + '/',
        'Origin': HOST,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    };
}

async function fetchJson(url) {
    try {
        const hd = getHeaders();
        if (typeof Java !== 'undefined' && Java && Java.req) {
            const r = await Java.req(url, { headers: hd });
            if (typeof r === 'string') return JSON.parse(r);
            const code = Number((r && (r.statusCode || r.status || r.code)) || 0);
            const body = String((r && (r.body || r.content || r.data)) || '');
            if (code >= 200 && code < 300 && body) return JSON.parse(body);
            return {};
        }
        const r2 = await req(url, { headers: hd });
        if (typeof r2 === 'string') return JSON.parse(r2);
        const code2 = Number((r2 && (r2.statusCode || r2.status || r2.code)) || 0);
        const body2 = String((r2 && (r2.content || r2.body || r2.data)) || '');
        if (code2 >= 200 && code2 < 300 && body2) return JSON.parse(body2);
        return {};
    } catch (e) {
        return {};
    }
}

function fmtTime(tsSec) {
    if (!tsSec) return '';
    try {
        const d = new Date(tsSec * 1000);
        const pad = n => String(n).padStart(2, '0');
        return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) {
        return '';
    }
}

function getLogoUrl(sportId, logo) {
    if (!logo) return '';
    if (logo.startsWith('http')) return logo;
    if (logo.includes('/')) return 'https://img0.aiscore.com/' + logo;
    const prefix = {1: 'football', 2: 'basketball', 3: 'v2', 4: 'volleyball'};
    return 'https://img0.aiscore.com/' + (prefix[sportId] || 'football') + '/team/' + logo;
}

// ========== 分类 ==========
function getClasses() {
    return [
        { type_id: '1', type_name: '足球' },
        { type_id: '2', type_name: '篮球' },
        { type_id: '3', type_name: '网球' },
        { type_id: '4', type_name: '排球' },
        { type_id: 'all', type_name: '全部' }
    ];
}

// ========== 获取直播数据 ==========
async function getLivestreams() {
    const ts = Date.now();
    const url = API_HOST + '/api/c5/business/livehouse/index?lang=zh&timestamp=' + ts;
    const json = await fetchJson(url);
    if (!json || !json.success) return [];
    
    const result = [];
    const seen = new Set();
    const sportPrefix = {1: 'football', 2: 'basketball', 3: 'v2', 4: 'volleyball'};
    
    const matchStreams = (json.data && json.data.matchLivestreams) || [];
    const houseTimeMap = {};
    const houseStreamMap = {};
    
    // 构建houseId到比赛时间和流的映射
    for (let i = 0; i < matchStreams.length; i++) {
        const item = matchStreams[i];
        const matchData = item.result && item.result.match;
        if (!matchData) continue;
        const matchTime = matchData.matchTime || 0;
        const statusId = matchData.statusId || 0;
        const anchors = item.reservedAnchors || [];
        for (let j = 0; j < anchors.length; j++) {
            const hId = anchors[j].houseId;
            if (hId) houseTimeMap[hId] = [matchTime, statusId];
        }
    }
    
    // 处理正在进行的直播流
    const ongoing = (json.data && json.data.ongoingLivestreams) || [];
    for (let i = 0; i < ongoing.length; i++) {
        const item = ongoing[i];
        const houseId = item.houseId;
        const streamUrl = item.playStreamAddress;
        const streamM3u8 = item.playStreamAddress2;
        let validStream = '';
        if (streamUrl && streamUrl.startsWith('http') && streamUrl !== 'www') validStream = streamUrl;
        else if (streamM3u8 && streamM3u8.startsWith('http') && streamM3u8 !== 'www') validStream = streamM3u8;
        if (houseId && validStream) houseStreamMap[houseId] = validStream;
    }
    
    // 处理主播直播流
    const anchorStreams = (json.data && json.data.anchorLivestreams) || [];
    for (let i = 0; i < anchorStreams.length; i++) {
        const item = anchorStreams[i];
        const houseId = item.houseId;
        const streamUrl = item.playStreamAddress;
        const streamM3u8 = item.playStreamAddress2;
        let validStream = '';
        if (streamUrl && streamUrl.startsWith('http') && streamUrl !== 'www') validStream = streamUrl;
        else if (streamM3u8 && streamM3u8.startsWith('http') && streamM3u8 !== 'www') validStream = streamM3u8;
        if (houseId && validStream) houseStreamMap[houseId] = validStream;
    }
    
    // 处理比赛流
    for (let i = 0; i < matchStreams.length; i++) {
        const item = matchStreams[i];
        const matchData = item.result && item.result.match;
        if (!matchData) continue;
        const competition = matchData.competition || {};
        const homeTeamData = matchData.homeTeam || {};
        const awayTeamData = matchData.awayTeam || {};
        const homeTeam = homeTeamData.name || '';
        const awayTeam = awayTeamData.name || '';
        const league = competition.name || '';
        const videoUrl = matchData.videoUrl || '';
        const sportId = matchData.sportId;
        const statusId = matchData.statusId || 0;
        const matchName = homeTeam && awayTeam ? homeTeam + ' vs ' + awayTeam : '';
        if (!matchName) continue;
        
        let effectiveVideoUrl = '';
        if (videoUrl && videoUrl.startsWith('http') && videoUrl !== 'https') {
            effectiveVideoUrl = videoUrl;
        } else {
            const anchors = item.reservedAnchors || [];
            for (let j = 0; j < anchors.length; j++) {
                const anchorStream = anchors[j].playStreamAddress || '';
                const anchorStream2 = anchors[j].playStreamAddress2 || '';
                if (anchorStream && anchorStream.startsWith('http') && anchorStream !== 'www') {
                    effectiveVideoUrl = anchorStream;
                    break;
                } else if (anchorStream2 && anchorStream2.startsWith('http') && anchorStream2 !== 'www') {
                    effectiveVideoUrl = anchorStream2;
                    break;
                }
            }
            if (!effectiveVideoUrl) {
                for (let j = 0; j < anchors.length; j++) {
                    const hId = anchors[j].houseId;
                    if (hId && houseStreamMap[hId]) {
                        effectiveVideoUrl = houseStreamMap[hId];
                        break;
                    }
                }
            }
        }
        
        const matchId = matchData.id || '';
        const matchTime = matchData.matchTime || 0;
        const timeStr = fmtTime(matchTime);
        const isLive = effectiveVideoUrl && (statusId === 2 || statusId === 4);
        const isUpcoming = !effectiveVideoUrl && (statusId === 1 || statusId === 2 || statusId === 3);
        const prefix = isLive ? '🟢 ' : isUpcoming ? '⏳ ' : '';
        const remarks = timeStr && league ? prefix + timeStr + ' ' + league : timeStr ? prefix + timeStr : league ? prefix + league : '';
        const homeLogo = homeTeamData.logo || '';
        const homeLogoUrl = getLogoUrl(sportId, homeLogo);
        const key = matchName + '_' + league;
        if (seen.has(key)) continue;
        seen.add(key);
        const finalUrl = effectiveVideoUrl ? effectiveVideoUrl : (matchId ? 'https://zuqiu200.app/match/' + matchId : '');
        
        result.push({
            vod_id: matchId,
            vod_name: matchName,
            vod_pic: homeLogoUrl,
            vod_play_from: league || '直播',
            vod_play_url: finalUrl,
            vod_remarks: remarks,
            sport_id: String(sportId || '')
        });
    }
    
    // 处理进行中的直播
    for (let i = 0; i < ongoing.length; i++) {
        const item = ongoing[i];
        const houseId = item.houseId;
        const houseName = item.houseName || '';
        const streamUrl = item.playStreamAddress;
        const streamM3u8 = item.playStreamAddress2;
        const raceTypeId = item.raceTypeId;
        const houseImage = item.houseImage || '';
        
        let validStream = '';
        if (streamUrl && streamUrl.startsWith('http') && streamUrl !== 'www') validStream = streamUrl;
        else if (streamM3u8 && streamM3u8.startsWith('http') && streamM3u8 !== 'www') validStream = streamM3u8;
        
        if (houseId && houseName && validStream) {
            const parts = houseName.split('|');
            const league = parts.length > 0 ? parts[0].trim() : '';
            const matchInfo = parts.length > 1 ? parts[1].trim() : houseName;
            let teamParts = matchInfo.split('VS');
            if (teamParts.length < 2) teamParts = matchInfo.split('vs');
            const homeTeam = teamParts.length > 0 ? teamParts[0].trim() : '';
            const awayTeam = teamParts.length > 1 ? teamParts[1].trim() : '';
            const matchName = homeTeam && awayTeam ? homeTeam + ' vs ' + awayTeam : houseName;
            const mt = houseTimeMap[houseId] || [0, 0];
            const timeStr = fmtTime(mt[0]);
            const remarks = timeStr && league ? '🟢 ' + timeStr + ' ' + league : timeStr ? '🟢 ' + timeStr : league ? '🟢 ' + league : '🟢 直播中';
            const key = matchName + '_' + league;
            if (seen.has(key)) continue;
            seen.add(key);
            
            result.push({
                vod_id: houseId,
                vod_name: matchName,
                vod_pic: houseImage,
                vod_play_from: league || '直播',
                vod_play_url: validStream,
                vod_remarks: remarks,
                sport_id: String(raceTypeId || '')
            });
        }
    }
    
    return result;
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
        const allVideos = await getLivestreams();
        if (tid === 'all') {
            list = allVideos;
        } else {
            list = allVideos.filter(v => v.sport_id === tid);
        }
        
        const pageSize = 20;
        const start = (pg - 1) * pageSize;
        const end = start + pageSize;
        list = list.slice(start, end);
    } catch (e) {
        list = [];
    }
    
    return JSON.stringify({
        code: 1,
        msg: '数据列表',
        page: pg,
        pagecount: Math.ceil(list.length / 20) || 1,
        limit: 20,
        total: list.length,
        list: list
    });
}

async function detail(ids) {
    const id = String(Array.isArray(ids) ? ids[0] : ids || '');
    if (!id) return JSON.stringify({ code: 1, list: [] });
    
    try {
        const allVideos = await getLivestreams();
        for (let i = 0; i < allVideos.length; i++) {
            if (allVideos[i].vod_id === id) {
                const detail = Object.assign({}, allVideos[i]);
                return JSON.stringify({
                    code: 1,
                    list: [detail]
                });
            }
        }
    } catch (e) {}
    
    return JSON.stringify({ code: 1, list: [] });
}

async function search(wd, quick, pg) {
    pg = parseInt(pg) || 1;
    let results = [];
    
    try {
        const allVideos = await getLivestreams();
        const keywordLower = wd.toLowerCase();
        
        for (let i = 0; i < allVideos.length; i++) {
            const video = allVideos[i];
            const name = video.vod_name.toLowerCase();
            if (name.includes(keywordLower) || video.vod_play_from.includes(wd)) {
                results.push(video);
            }
        }
        
        const pageSize = 20;
        const start = (pg - 1) * pageSize;
        const end = start + pageSize;
        results = results.slice(start, end);
    } catch (e) {
        results = [];
    }
    
    return JSON.stringify({
        code: 1,
        msg: '搜索结果',
        page: pg,
        pagecount: Math.ceil(results.length / 20) || 1,
        limit: 20,
        total: results.length,
        list: results
    });
}

async function play(flag, id, flags) {
    const url = String(id || '');
    if (!url) {
        return JSON.stringify({
            parse: 0,
            url: '',
            header: ''
        });
    }
    
    return JSON.stringify({
        parse: 0,
        url: url,
        header: {
            'User-Agent': UA,
            'Referer': HOST + '/',
            'Origin': HOST
        }
    });
}

// ========== 导出接口 ==========
async function homeContent(filter) {
    try {
        return JSON.parse(await home(filter));
    } catch (e) {
        return { class: [], list: [], filter: {} };
    }
}

async function homeVideoContent() {
    try {
        return JSON.parse(await category('all', 1, false, {}));
    } catch (e) {
        return { list: [] };
    }
}

async function categoryContent(tid, pg, filter, extend) {
    try {
        return JSON.parse(await category(tid, pg, filter, extend || {}));
    } catch (e) {
        return { list: [] };
    }
}

async function detailContent(ids) {
    try {
        return JSON.parse(await detail(ids));
    } catch (e) {
        return { list: [] };
    }
}

async function searchContent(wd, quick, pg) {
    try {
        return JSON.parse(await search(wd, quick, pg || 1));
    } catch (e) {
        return { list: [] };
    }
}

async function playerContent(flag, id, flags) {
    try {
        return JSON.parse(await play(flag, id, flags));
    } catch (e) {
        return { parse: 0, url: id || '', header: '' };
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