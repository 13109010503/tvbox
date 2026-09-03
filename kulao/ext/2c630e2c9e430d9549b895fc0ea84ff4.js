// qiuba V6.6
const HOST = 'https://www.qiuba001.vip';
const API = HOST + '/api';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

function getHeaders(ref) {
    return {
        'User-Agent': UA,
        'Referer': ref || HOST + '/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Origin': HOST
    };
}

function getVideoHeaders() {
    return {
        'User-Agent': UA,
        'Referer': HOST + '/',
        'Origin': HOST,
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9'
    };
}

async function fetchJson(url, method, body) {
    const hd = getHeaders();
    const isPost = method && method.toUpperCase() === 'POST';
    if (isPost) hd['Content-Type'] = 'application/json';
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    
    // 方式1: Java.req（优先）
    if (typeof Java !== 'undefined' && Java && Java.req) {
        try {
            const opts = { headers: hd, method: isPost ? 'POST' : 'GET' };
            if (bodyStr) opts.body = bodyStr;
            const r = await Java.req(url, opts);
            if (typeof r === 'string') return JSON.parse(r);
            if (r && typeof r === 'object') {
                const code = Number((r.statusCode || r.status || r.code) || 0);
                const body = String((r.body || r.content || r.data) || '');
                if (code >= 200 && code < 300 && body) return JSON.parse(body);
                // 兼容201等非标准状态码
                if (code === 201 && body) {
                    try { return JSON.parse(body); } catch (e) {}
                }
                if (body) return JSON.parse(body);
            }
        } catch (e) {}
    }
    
    // 方式2: req函数
    if (typeof req === 'function') {
        try {
            const opts = { headers: hd, method: isPost ? 'POST' : 'GET' };
            if (bodyStr) opts.body = bodyStr;
            const r = await req(url, opts);
            if (typeof r === 'string') return JSON.parse(r);
            if (r && typeof r === 'object') {
                const code = Number((r.statusCode || r.status || r.code) || 0);
                const body = String((r.content || r.body || r.data) || '');
                if (code >= 200 && code < 300 && body) return JSON.parse(body);
                // 兼容201等非标准状态码
                if (code === 201 && body) {
                    try { return JSON.parse(body); } catch (e) {}
                }
                if (body) return JSON.parse(body);
            }
        } catch (e) {}
    }
    
    // 方式3: fetch
    if (typeof fetch === 'function') {
        try {
            const opts = { method: isPost ? 'POST' : 'GET', headers: hd };
            if (isPost && bodyStr) opts.body = bodyStr;
            const resp = await fetch(url, opts);
            const text = await resp.text();
            if (text) return JSON.parse(text);
        } catch (e) {}
    }
    
    return {};
}

function cleanText(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/"/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function formatTime(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        const utc8 = new Date(d.getTime() + 8 * 3600 * 1000);
        const mm = String(utc8.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(utc8.getUTCDate()).padStart(2, '0');
        const hh = String(utc8.getUTCHours()).padStart(2, '0');
        const mi = String(utc8.getUTCMinutes()).padStart(2, '0');
        return mm + '-' + dd + ' ' + hh + ':' + mi;
    } catch (e) {
        return isoStr.split('T')[1] ? isoStr.split('T')[1].substring(0, 5) : '';
    }
}

function getStatus(status) {
    const map = { 'live': '🔴', 'not_started': '⚪', 'finished': '⚫' };
    return map[status] || '';
}

function parseMatch(item) {
    try {
        const matchId = String(item.id || '');
        const homeTeam = item.home_team || {};
        const awayTeam = item.away_team || {};
        const comp = item.competition || {};
        const homeName = homeTeam.name || '主队';
        const awayName = awayTeam.name || '客队';
        const compName = comp.name || '未知联赛';
        const status = item.status || 'not_started';
        const homeScore = item.home_score;
        const awayScore = item.away_score;
        const score = (homeScore !== null && awayScore !== null) ? homeScore + ':' + awayScore : 'vs';
        const signalCount = item.signal_count || 0;
        const startTime = item.start_time || '';
        const timeStr = formatTime(startTime);
        const statusText = getStatus(status);
        
        let name = homeName + ' vs ' + awayName;
        if (status === 'live') name = homeName + ' ' + score + ' ' + awayName;
        
        let remarks = statusText;
        if (timeStr) remarks += ' ' + timeStr;
        if (compName) remarks += ' ' + compName;
        if (signalCount > 0) remarks += ' | ' + signalCount + '路';
        
        const pic = homeTeam.logo || awayTeam.logo || '';
        
        return {
            vod_id: matchId,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remarks
        };
    } catch (e) {
        return null;
    }
}

async function getMatches(tid, pg) {
    let url = API + '/matches?page=' + pg + '&page_size=20';
    if (tid && tid !== '0') url += '&category_id=' + tid;
    
    const data = await fetchJson(url);
    let items = [];
    
    if (data && data.items && Array.isArray(data.items)) {
        items = data.items;
    } else if (Array.isArray(data)) {
        items = data;
    } else if (data && data.data && Array.isArray(data.data)) {
        items = data.data;
    }
    
    return items.map(parseMatch).filter(Boolean);
}

// ========== 公开接口 ==========

async function init(cfg) {}

async function home(filter) {
    return JSON.stringify({
        class: [
            { type_id: '1', type_name: '足球' },
            { type_id: '2', type_name: '篮球' }
        ],
        filters: {}
    });
}

async function homeVod() {
    return await category('1', 1, false, {});
}

async function category(tid, pg, filter, extend) {
    tid = String((extend && extend.cateId) || tid || '1');
    pg = parseInt(pg) || 1;
    
    try {
        const list = await getMatches(tid, pg);
        return JSON.stringify({
            code: 1,
            msg: '数据列表',
            page: pg,
            pagecount: Math.ceil(list.length / 20) || 1,
            limit: 20,
            total: list.length,
            list: list
        });
    } catch (e) {
        return JSON.stringify({
            code: 1,
            msg: '获取失败',
            page: pg,
            pagecount: 1,
            limit: 20,
            total: 0,
            list: []
        });
    }
}

async function detail(ids) {
    const id = String(Array.isArray(ids) ? ids[0] : ids || '');
    if (!id) return JSON.stringify({ code: 1, list: [] });
    
    try {
        const matchData = await fetchJson(API + '/matches/' + id);
        if (!matchData) return JSON.stringify({ code: 1, list: [] });
        
        const parsed = parseMatch(matchData);
        if (!parsed) return JSON.stringify({ code: 1, list: [] });
        
        // 获取信号列表
        const signalData = await fetchJson(API + '/matches/' + id + '/signals');
        let signals = [];
        if (signalData && signalData.signals) signals = signalData.signals;
        else if (Array.isArray(signalData)) signals = signalData;
        
        // 构建播放列表 - 保持V6.0格式
        const playLines = [];
        if (signals.length > 0) {
            for (let i = 0; i < signals.length; i++) {
                const sig = signals[i];
                const sourceId = sig.source_id || '';
                const displayName = sig.display_name || ('信号' + (i + 1));
                const sigStatus = sig.status || '';
                let prefix = '⚪';
                if (sigStatus === 'recommended_online') prefix = '⭐';
                else if (sigStatus === 'online') prefix = '🟢';
                playLines.push(prefix + ' ' + displayName + '$qiuba|' + id + '|' + sourceId);
            }
        } else {
            playLines.push('默认直播$qiuba|' + id + '|default');
        }
        
        return JSON.stringify({
            code: 1,
            list: [{
                vod_id: id,
                vod_name: parsed.vod_name,
                vod_pic: parsed.vod_pic,
                vod_remarks: parsed.vod_remarks,
                vod_play_from: '球吧体育',
                vod_play_url: playLines.join('#')
            }]
        });
    } catch (e) {
        return JSON.stringify({ code: 1, list: [] });
    }
}

async function search(wd, quick, pg) {
    pg = parseInt(pg) || 1;
    
    try {
        const allMatches = await getMatches('0', 1);
        const keywordLower = wd.toLowerCase();
        const results = allMatches.filter(m => m.vod_name.toLowerCase().includes(keywordLower));
        
        return JSON.stringify({
            code: 1,
            msg: '搜索结果',
            page: pg,
            pagecount: Math.ceil(results.length / 20) || 1,
            limit: 20,
            total: results.length,
            list: results.slice((pg - 1) * 20, pg * 20)
        });
    } catch (e) {
        return JSON.stringify({
            code: 1,
            msg: '搜索失败',
            page: pg,
            pagecount: 1,
            limit: 20,
            total: 0,
            list: []
        });
    }
}

async function play(flag, id, flags) {
    const url = String(id || '');
    
    // 处理 qiuba|matchId|sourceId 格式 - 保持V6.0逻辑
    if (url.indexOf('qiuba|') === 0) {
        const parts = url.split('|');
        if (parts.length >= 3) {
            const matchId = parts[1];
            let sourceId = parts[2];
            
            // 如果是默认信号，获取第一个在线信号
            if (sourceId === 'default') {
                const signalData = await fetchJson(API + '/matches/' + matchId + '/signals');
                let signals = [];
                if (signalData && signalData.signals) signals = signalData.signals;
                else if (Array.isArray(signalData)) signals = signalData;
                
                if (signals.length > 0) {
                    // 优先选择推荐在线的信号
                    for (const sig of signals) {
                        if (sig.status === 'recommended_online') {
                            sourceId = sig.source_id || '';
                            break;
                        }
                    }
                    if (sourceId === 'default') sourceId = signals[0].source_id || '';
                }
            }
            
            // 获取播放地址
            if (sourceId && sourceId !== 'default') {
                const sessionData = await fetchJson(API + '/play/session', 'POST', { source_id: sourceId });
                if (sessionData && sessionData.real_url_encrypted) {
                    const encrypted = sessionData.real_url_encrypted;
                    if (encrypted.indexOf('crawler_b64:') === 0) {
                        const b64 = encrypted.split(':', 2)[1];
                        if (b64) {
                            try {
                                // 调试日志：输出原始Base64字符串
                                console.log('=== Base64解码调试 ===');
                                console.log('原始加密字符串:', encrypted);
                                console.log('提取的Base64:', b64);
                                console.log('Base64长度:', b64.length);
                                console.log('Base64模4余数:', b64.length % 4);
                                
                                let m3u8 = '';
                                // 预处理Base64：确保长度能被4整除
                                let fixedB64 = b64;
                                const padCount = fixedB64.length % 4;
                                if (padCount === 2) fixedB64 += '==';
                                else if (padCount === 3) fixedB64 += '=';
                                console.log('填充后Base64:', fixedB64);
                                
                                // 手动解码函数 - 最可靠的方式
                                function manualBase64Decode(str) {
                                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                                    const lookup = {};
                                    for (let i = 0; i < 64; i++) lookup[chars[i]] = i;
                                    
                                    // 处理URL安全Base64
                                    let padded = str.replace(/-/g, '+').replace(/_/g, '/');
                                    
                                    // 方法1：使用Uint8Array和TextDecoder（更可靠）
                                    try {
                                        const bytes = new Uint8Array(Math.floor(padded.length / 4) * 3);
                                        let byteIndex = 0;
                                        
                                        for (let i = 0; i < padded.length; i += 4) {
                                            const a = lookup[padded.charAt(i)] || 0;
                                            const b = lookup[padded.charAt(i + 1)] || 0;
                                            const c = padded.charAt(i + 2) === '=' ? 0 : (lookup[padded.charAt(i + 2)] || 0);
                                            const d = padded.charAt(i + 3) === '=' ? 0 : (lookup[padded.charAt(i + 3)] || 0);
                                            
                                            const triplet = (a << 18) + (b << 12) + (c << 6) + d;
                                            bytes[byteIndex++] = (triplet >> 16) & 0xFF;
                                            if (padded.charAt(i + 2) !== '=') bytes[byteIndex++] = (triplet >> 8) & 0xFF;
                                            if (padded.charAt(i + 3) !== '=') bytes[byteIndex++] = triplet & 0xFF;
                                        }
                                        
                                        // 截取实际长度
                                        const actualBytes = bytes.slice(0, byteIndex);
                                        
                                        // 尝试TextDecoder
                                        if (typeof TextDecoder !== 'undefined') {
                                            const decoder = new TextDecoder('utf-8', { fatal: false });
                                            const result = decoder.decode(actualBytes);
                                            if (result && result.indexOf('http') === 0) {
                                                return result;
                                            }
                                        }
                                        
                                        // 回退到String.fromCharCode
                                        let result = '';
                                        for (let i = 0; i < actualBytes.length; i++) {
                                            result += String.fromCharCode(actualBytes[i]);
                                        }
                                        return result.replace(/\0/g, '');
                                    } catch (e) {
                                        // 方法2：直接使用String.fromCharCode
                                        let result = '';
                                        for (let i = 0; i < padded.length; i += 4) {
                                            const a = lookup[padded.charAt(i)] || 0;
                                            const b = lookup[padded.charAt(i + 1)] || 0;
                                            const c = padded.charAt(i + 2) === '=' ? 0 : (lookup[padded.charAt(i + 2)] || 0);
                                            const d = padded.charAt(i + 3) === '=' ? 0 : (lookup[padded.charAt(i + 3)] || 0);
                                            
                                            const triplet = (a << 18) + (b << 12) + (c << 6) + d;
                                            result += String.fromCharCode((triplet >> 16) & 0xFF);
                                            if (padded.charAt(i + 2) !== '=') result += String.fromCharCode((triplet >> 8) & 0xFF);
                                            if (padded.charAt(i + 3) !== '=') result += String.fromCharCode(triplet & 0xFF);
                                        }
                                        return result.replace(/\0/g, '');
                                    }
                                }
                                
                                // 解码策略：直接使用填充后的Base64
                                console.log('使用手动解码策略');
                                m3u8 = manualBase64Decode(fixedB64);
                                console.log('解码结果:', m3u8);
                                
                                // 如果解码结果不是有效URL，尝试其他方式
                                if (!m3u8 || m3u8.indexOf('http') !== 0) {
                                    console.log('解码结果无效，尝试其他方式');
                                    
                                    // 尝试1：使用原始Base64手动解码
                                    const originalResult = manualBase64Decode(b64);
                                    console.log('原始Base64解码结果:', originalResult);
                                    if (originalResult && originalResult.indexOf('http') === 0) {
                                        m3u8 = originalResult;
                                        console.log('使用原始Base64解码成功');
                                    }
                                    // 尝试2：使用base64Decode函数
                                    else if (typeof base64Decode === 'function') {
                                        try {
                                            const decoded = base64Decode(fixedB64);
                                            console.log('base64Decode(fixedB64):', decoded);
                                            if (decoded && decoded.indexOf('http') === 0) {
                                                m3u8 = decoded;
                                                console.log('使用base64Decode成功');
                                            }
                                        } catch (e) {
                                            console.log('base64Decode异常:', e.message);
                                        }
                                    }
                                    // 尝试3：使用atob函数
                                    else if (typeof atob === 'function') {
                                        try {
                                            const decoded = atob(fixedB64);
                                            console.log('atob(fixedB64):', decoded);
                                            if (decoded && decoded.indexOf('http') === 0) {
                                                m3u8 = decoded;
                                                console.log('使用atob成功');
                                            }
                                        } catch (e) {
                                            console.log('atob异常:', e.message);
                                        }
                                    }
                                }
                                
                                // 最终清理
                                m3u8 = m3u8.replace(/\0/g, '');
                                console.log('最终解码结果:', m3u8);
                                
                                // 增强直链判断：检查标准后缀或域名特征
                                const isDirectUrl = m3u8 && (
                                    m3u8.indexOf('.m3u8') !== -1 || 
                                    m3u8.indexOf('.mp4') !== -1 || 
                                    m3u8.indexOf('.flv') !== -1 ||
                                    m3u8.indexOf('stream.sports3.win') !== -1 ||
                                    m3u8.indexOf('hls.live123.fans') !== -1 ||
                                    m3u8.indexOf('/live/') !== -1 ||
                                    m3u8.indexOf('signal-') !== -1 ||
                                    m3u8.indexOf('iptv') !== -1 ||
                                    m3u8.indexOf('live/') !== -1 ||
                                    (m3u8.indexOf('http') === 0 && m3u8.length > 20)
                                );
                                
                                if (isDirectUrl) {
                                    return JSON.stringify({
                                        parse: 0,
                                        url: m3u8,
                                        header: getVideoHeaders()
                                    });
                                }
                            } catch (e) {}
                        }
                    }
                }
            }
            
            // 降级到播放页面 - 增强羊壳兼容性
            // 对于羊壳，尝试添加更多兼容性处理
            return JSON.stringify({
                parse: 1,
                url: HOST + '/live/' + matchId,
                header: {
                    ...getVideoHeaders(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
        }
    }
    
    // 直链处理 - 保持V6.0逻辑
    if (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1 || url.indexOf('.flv') !== -1) {
        return JSON.stringify({
            parse: 0,
            url: url,
            header: getVideoHeaders()
        });
    }
    
    return JSON.stringify({
        parse: 1,
        url: url,
        header: getVideoHeaders()
    });
}

// ========== 导出接口 ==========

async function homeContent(filter) {
    try { return JSON.parse(await home(filter)); }
    catch (e) { return { class: [], filters: {} }; }
}

async function homeVideoContent() {
    try { return JSON.parse(await category('1', 1, false, {})); }
    catch (e) { return { code: 1, msg: '获取失败', page: 1, pagecount: 1, limit: 20, total: 0, list: [] }; }
}

async function categoryContent(tid, pg, filter, extend) {
    try { return JSON.parse(await category(tid, pg, filter, extend || {})); }
    catch (e) { return { code: 1, msg: '获取失败', page: Number(pg), pagecount: 1, limit: 20, total: 0, list: [] }; }
}

async function detailContent(ids) {
    try { return JSON.parse(await detail(ids)); }
    catch (e) { return { code: 1, list: [] }; }
}

async function searchContent(wd, quick, pg) {
    try { return JSON.parse(await search(wd, quick, pg)); }
    catch (e) { return { code: 1, msg: '搜索失败', page: Number(pg || 1), pagecount: 1, limit: 20, total: 0, list: [] }; }
}

async function playerContent(flag, id, flags) {
    try { 
        const result = await play(flag, id, flags);
        return JSON.parse(result); 
    }
    catch (e) { 
        return { 
            parse: 0, 
            url: id || '', 
            header: getVideoHeaders()
        }; 
    }
}

export function __jsEvalReturn() {
    return {
        init,
        home,
        homeVod,
        category,
        detail,
        play,
        search,
        homeContent,
        homeVideoContent,
        categoryContent,
        detailContent,
        playerContent,
        searchContent
    };
}