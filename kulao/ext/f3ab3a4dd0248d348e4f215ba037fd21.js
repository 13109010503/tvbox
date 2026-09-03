/*
@header({
  searchable: 0,
  filterable: 0,
  quickSearch: 0,
  title: 'JRS直播[体]',
  author: 'OpenClaw',
  lang: 'cat',
  style: { type: 'rect', ratio: 1.5 }
})
 * @version V43
 */

let host = 'https://m.sportsteam53.com';
const hosts = ['https://m.sportsteam53.com', 'https://m.jrskk.com', 'https://m.jrs21.com', 'https://www.jrs33.com', 'https://3.swjrzx.com', 'https://m.sportsteam356.com'];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const defaultPic = 'https://im-imgs-bucket.oss-accelerate.aliyuncs.com/icon-192.png';
let cacheTime = 0;
let cacheHtml = '';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function absUrl(url, base) {
    url = String(url || '').trim();
    base = base || host;
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (url.charAt(0) === '/') {
        var m = String(base).match(/^(https?:\/\/[^/]+)/i);
        return (m ? m[1] : host) + url;
    }
    return base + '/' + url;
}

function utf8ToBase64Url(str) {
    str = unescape(encodeURIComponent(String(str || '')));
    let out = '';
    for (let i = 0; i < str.length; i += 3) {
        const c1 = str.charCodeAt(i);
        const c2 = str.charCodeAt(i + 1);
        const c3 = str.charCodeAt(i + 2);
        out += B64_CHARS.charAt(c1 >> 2);
        out += B64_CHARS.charAt(((c1 & 3) << 4) | ((c2 || 0) >> 4));
        out += isNaN(c2) ? '=' : B64_CHARS.charAt(((c2 & 15) << 2) | ((c3 || 0) >> 6));
        out += isNaN(c3) ? '=' : B64_CHARS.charAt(c3 & 63);
    }
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUtf8(str) {
    str = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    let bytes = [];
    for (let i = 0; i < str.length; i += 4) {
        const c1 = B64_CHARS.indexOf(str.charAt(i));
        const c2 = B64_CHARS.indexOf(str.charAt(i + 1));
        const c3 = B64_CHARS.indexOf(str.charAt(i + 2));
        const c4 = B64_CHARS.indexOf(str.charAt(i + 3));
        if (c1 < 0 || c2 < 0) continue;
        const n = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4);
        bytes.push((n >> 16) & 255);
        if (str.charAt(i + 2) !== '=') bytes.push((n >> 8) & 255);
        if (str.charAt(i + 3) !== '=') bytes.push(n & 255);
    }
    let raw = '';
    for (let j = 0; j < bytes.length; j++) raw += String.fromCharCode(bytes[j]);
    try {
        return decodeURIComponent(escape(raw));
    } catch (e) {
        return raw;
    }
}

function safeJson(text, def) {
    try {
        return JSON.parse(text || '{}');
    } catch (e) {
        return def || {};
    }
}

function matchCategory(tid, league, name, stype, hot) {
    tid = String(tid || 'all');
    const text = league + ' ' + name;
    if (tid === 'all' || tid === 'live') return true;
    if (tid === 'hot') return !!hot || /(NBA|CBA|英超|西甲|意甲|德甲|法甲|欧冠|中超|世界杯|世俱杯|亚冠|热门)/i.test(text);
    if (tid === 'basketball') return stype === 'lq' || /(NBA|CBA|WNBA|NBL|篮球|篮)/i.test(text);
    if (tid === 'football') return stype === 'zq' || (/(足球|英超|西甲|意甲|德甲|法甲|欧冠|欧联|中超|亚冠|足协|世界杯|世俱|巴西甲|巴西乙|日职|韩K|联赛|杯)/i.test(text) && !/(NBA|CBA|WNBA|NBL|篮球|篮)/i.test(text));
    if (tid === 'other') return !matchCategory('basketball', league, name, stype, hot) && !matchCategory('football', league, name, stype, hot);
    return true;
}

async function fetchText(url, referer) {
    const hd = {
        'User-Agent': UA,
        'Referer': referer || host + '/',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    };
    if (typeof Java !== 'undefined' && Java && Java.req) {
        const r = await Java.req(url, {
            headers: hd
        });
        if (typeof r === 'string') return r;
        return String((r && (r.body || r.content || r.data)) || '');
    }
    const r2 = await req(url, {
        headers: hd
    });
    return String((r2 && (r2.content || r2.body)) || '');
}

var DEAD_HOSTS = ['jrs03.com'];
function isDeadUrl(url) {
    for (var i = 0; i < DEAD_HOSTS.length; i++) {
        if (url.indexOf(DEAD_HOSTS[i]) !== -1) return true;
    }
    return false;
}
var PLAY_HOSTS = {
    line1: 'http://m.jw1104.com',
    line2: 'http://m.jw1104.com',
    line3: 'http://play.sportsteam356.com'
};

// ===== Pao link crypto (XXTEA + RC4) =====
var XXTEA_D = 2654435769;
var PAO_RC4_KEY = 'bjBa';
var PAO_XXTEA_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWX';

function _xxtea_tU32(r, e) {
    var t, n = r.length, o = n >> 2;
    0 != (3 & n) && ++o;
    e ? (t = new Array(o + 1))[o] = n : t = new Array(o);
    for (var a = 0; a < n; ++a) t[a >> 2] |= r.charCodeAt(a) << ((3 & a) << 3);
    return t;
}
function _xxtea_fU32(r, e) {
    var t = r.length, n = t << 2;
    if (e) {
        var o = r[t - 1];
        if (o < (n -= 4) - 3 || n < o) return null;
        n = o;
    }
    for (var a = 0; a < t; a++) r[a] = String.fromCharCode(255 & r[a], r[a] >>> 8 & 255, r[a] >>> 16 & 255, r[a] >>> 24 & 255);
    return e ? r.join('').substring(0, n) : r.join('');
}
function _xxtea_s(r) { return 4294967295 & r; }
function _xxtea_C(r, e, t, n, o, a) {
    return (t >>> 5 ^ e << 2) + (e >>> 3 ^ t << 4) ^ (r ^ e) + (a[3 & n ^ o] ^ t);
}
function xxteaDecrypt(binary, key) {
    if (null == binary || 0 === binary.length) return binary;
    var r = _xxtea_tU32(binary, false);
    var k = _xxtea_tU32(key, false);
    while (k.length < 4) k.push(0);
    var i = r.length, h = i - 1, t, n, o, a, c;
    for (t = r[0], o = _xxtea_s(Math.floor(6 + 52 / i) * XXTEA_D); 0 !== o; o = _xxtea_s(o - XXTEA_D)) {
        for (a = o >>> 2 & 3, c = h; 0 < c; --c)
            n = r[c - 1], t = r[c] = _xxtea_s(r[c] - _xxtea_C(o, t, n, c, a, k));
        n = r[h], t = r[0] = _xxtea_s(r[0] - _xxtea_C(o, t, n, 0, a, k));
    }
    return _xxtea_fU32(r, true);
}

function _pao_customB64(str) {
    var alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
    str = String(str || '').replace(/=+$/, '');
    var out = '';
    for (var i = 0; i < str.length; i += 4) {
        var a = alpha.indexOf(str[i]), b = alpha.indexOf(str[i + 1] || 'A');
        var c = alpha.indexOf(str[i + 2] || 'A'), d = alpha.indexOf(str[i + 3] || 'A');
        if (a < 0 || b < 0) continue;
        var n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
        out += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    var pad = (4 - str.length % 4) % 4;
    return pad > 0 ? out.substring(0, out.length - pad) : out;
}
function _pao_rc4(data, key) {
    var S = [], i, j;
    for (i = 0; i < 256; i++) S[i] = i;
    j = 0;
    for (i = 0; i < 256; i++) {
        j = (j + S[i] + key.charCodeAt(i % key.length)) & 0xff;
        var tmp = S[i]; S[i] = S[j]; S[j] = tmp;
    }
    i = 0; j = 0; var out = '';
    for (var k = 0; k < data.length; k++) {
        i = (i + 1) & 0xff;
        j = (j + S[i]) & 0xff;
        var tmp = S[i]; S[i] = S[j]; S[j] = tmp;
        out += String.fromCharCode(data.charCodeAt(k) ^ S[(S[i] + S[j]) & 0xff]);
    }
    return out;
}

async function resolvePao(paoUrl, referer) {
    try {
        var paoHtml = await fetchText(paoUrl, referer || host + '/');
        if (!paoHtml || paoHtml.length <= 5) return null;
        var encMatch = paoHtml.match(/encodedStr\s*=\s*["']([^"']+)/i);
        if (!encMatch) { return null; }
        var encodedStr = encMatch[1];
        var encBinary = '';
        if (typeof Buffer !== 'undefined') {
            encBinary = Buffer.from(encodedStr, 'base64').toString('binary');
        } else {
            var b64 = encodedStr.replace(/=+$/, '');
            var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            for (var bi = 0; bi < b64.length; bi += 4) {
                var ba = chars.indexOf(b64[bi] || 'A'), bb = chars.indexOf(b64[bi+1] || 'A');
                var bc = chars.indexOf(b64[bi+2] || 'A'), bd = chars.indexOf(b64[bi+3] || 'A');
                var bn = (ba << 18) | (bb << 12) | ((bc < 0 ? 0 : bc) << 6) | (bd < 0 ? 0 : bd);
                encBinary += String.fromCharCode((bn >> 16) & 255, (bn >> 8) & 255, bn & 255);
            }
            var pad = (4 - b64.length % 4) % 4;
            if (pad) encBinary = encBinary.substring(0, encBinary.length - pad);
        }
        var m3u8raw = xxteaDecrypt(encBinary, PAO_XXTEA_KEY);
        if (!m3u8raw) return null;
        var m3u8 = m3u8raw;
        if (m3u8raw.charAt(0) === '{') {
            try { m3u8 = JSON.parse(m3u8raw).url || m3u8raw; } catch(e) {}
        }
        if (m3u8 && m3u8.indexOf('.m3u8') !== -1) {
            m3u8 = m3u8.replace(/\\\//g, '/');
            return fixM3u8Domain(m3u8);
        }
        return null;
    } catch (e) {
        return null;
    }
}

function resolveGetPlayUrl(jsContent) {
    return jsContent.replace(/getPlayUrl\(["'](\w+)["'],\s*["'](\d+)["']\)/g, function(_, line, id) {
        var base = PLAY_HOSTS[line] || '';
        return base ? (base + '/play/steam' + id + '.html') : 'javascript:void(0)';
    });
}

function jsToHtml(jsContent) {
    var resolved = resolveGetPlayUrl(jsContent);
    var reg = /document\.write\(([\s\S]*?)\);/g;
    var htmlParts = [];
    var m;
    while ((m = reg.exec(resolved)) !== null) {
        var expr = m[1].trim();
        var parts = [];
        var current = '';
        var inString = false;
        var stringChar = '';
        for (var i = 0; i < expr.length; i++) {
            var ch = expr.charAt(i);
            if (!inString && (ch === "'" || ch === '"')) {
                inString = true;
                stringChar = ch;
                continue;
            }
            if (inString && ch === stringChar) {
                inString = false;
                continue;
            }
            if (!inString && ch === '+') {
                parts.push(current.trim());
                current = '';
                continue;
            }
            current += ch;
        }
        if (current.trim()) parts.push(current.trim());
        var combined = '';
        for (var j = 0; j < parts.length; j++) {
            if (parts[j]) combined += parts[j];
        }
        htmlParts.push(combined);
    }
    return htmlParts.join('');
}

async function fetchHome(force) {
    if (!force && cacheHtml && Date.now() - cacheTime < 60000) return cacheHtml;
    for (let i = 0; i < hosts.length; i++) {
        try {
            const html = await fetchText(hosts[i] + '/', hosts[i] + '/');
            if (html && (/loc_match|lab_team|JRKAN|play\/steam/i).test(html)) {
                host = hosts[i];
                var jsContent = '';
                try {
                    var jsUrl = 'https://im-imgs-bucket.oss-accelerate.aliyuncs.com/index.js?t=' + Date.now();
                    jsContent = await fetchText(jsUrl, host + '/');
                } catch (e) {}
                var matchHtml = jsToHtml(jsContent);
                var fullHtml = html + matchHtml;
                cacheHtml = fullHtml;
                cacheTime = Date.now();
                return fullHtml;
            }
        } catch (e) {}
    }
    return cacheHtml || '';
}

function firstMatch(text, reg) {
    const m = String(text || '').match(reg);
    return m ? m[1] : '';
}

function looksLikePlayable(url) {
    if (!url) return false;
    var s = String(url);
    return /^https?:\/\//i.test(s) && s.length > 10 && s.indexOf(' ') === -1;
}

function extractM3u8FromPage(html, pageUrl) {
    if (!html) return null;
    var m = html.match(/<source[^>]+src=["']([^"']+\.(?:m3u8|mp4|flv)[^"']*)["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/<video[^>]+src=["']([^"']+\.(?:m3u8|mp4|flv)[^"']*)["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/videoUrl\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|flv)[^"']*)["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/videoSrc\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|flv)[^"']*)["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/["']url["']\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|flv)[^"']*)["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/["']src["']\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|flv)[^"']*)["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/<iframe[^>]+src=["']([^"']+m3u8[^"']*)["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/<iframe[^>]+src=["']([^"']*\?[^"']*id=([^"']+\.(?:m3u8|mp4|flv)[^"']*))["']/i);
    if (m) return absUrl(m[1], pageUrl);
    m = html.match(/(https?:\/\/[^"'\s<]+\.(?:m3u8|mp4|flv)[^"'\s<]*)/i);
    if (m) return m[1];
    return null;
}

async function resolveSmM3u8(smUrl) {
    try {
        var html = await fetchText(smUrl, host + '/');
        if (!html) return null;
        var direct = extractM3u8FromPage(html, smUrl);
        if (direct && looksLikePlayable(direct)) return direct;
        var iframeSrc = firstMatch(html, /<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i);
        if (!iframeSrc) return null;
        var originM = String(smUrl).match(/^(https?:\/\/[^/]+)/i);
        var origin = originM ? originM[1] : host;
        var iframeUrl = absUrl(iframeSrc, origin);
        var iframeHtml = await fetchText(iframeUrl, smUrl);
        if (!iframeHtml) return null;
        var result = extractM3u8FromPage(iframeHtml, iframeUrl);
        if (result && looksLikePlayable(result)) return result;
        var nestedIframe = firstMatch(iframeHtml, /<iframe[^>]+src=["']([^"']+)["']/i);
        if (nestedIframe) {
            var nestedUrl = absUrl(nestedIframe, origin);
            var nestedHtml = await fetchText(nestedUrl, iframeUrl);
            if (nestedHtml) {
                var nestedResult = extractM3u8FromPage(nestedHtml, nestedUrl);
                if (nestedResult && looksLikePlayable(nestedResult)) return nestedResult;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function parseSignals(html, playPageUrl) {
    const signals = [];
    var h = String(html || '');
    var chHtml = h;
    var chMatch = h.match(/<div\b[^>]*class=["'][^"']*sub_channel[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>|<!--)/i);
    if (chMatch) chHtml = chMatch[1];
    // V41: 去掉强依赖 class="ok me"，捕获所有带 data-play 的信号按钮（主播解说/中文高清/高清直播等）
    var reg = /<a\b([^>]*data-play=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi;
    var seenUrls = {};
    var m;
    while ((m = reg.exec(chHtml)) !== null) {
        var attrs = m[1];
        var inner = m[2];
        var dp = firstMatch(attrs, /data-play=["']([^"']+)["']/i);
        if (!dp) continue;
        var href = firstMatch(attrs, /href=["']([^"']+)["']/i);
        var target = dp || href;
        if (!target || target === 'javascript:void(0)' || target.indexOf('void') !== -1) continue;
        target = target.replace(/&amp;/g, '&');
        if (target.indexOf('=&') === 0 || target.length < 5) continue;
        // 信号名优先取 strong 文本，否则取标签内文字
        var name = stripHtml(firstMatch(inner, /<strong>([^<]*)<\/strong>/i) || inner);
        if (!name || name.length < 1) name = '信号' + (signals.length + 1);
        var fullUrl = absUrl(target, playPageUrl || host);
        if (seenUrls[fullUrl + name]) continue;
        seenUrls[fullUrl + name] = true;
        signals.push({ name: name, url: fullUrl });
    }
    // 兜底：若仍无 data-play 信号，尝试通用按钮
    if (!signals.length) {
        var reg2 = /<a\b([^>]*class=["'][^"']*me[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
        var m2;
        while ((m2 = reg2.exec(chHtml)) !== null) {
            var a = m2[1];
            var dp2 = firstMatch(a, /data-play=["']([^"']+)["']/i);
            var href2 = firstMatch(a, /href=["']([^"']+)["']/i);
            var t2 = dp2 || href2;
            if (!t2 || t2 === 'javascript:void(0)') continue;
            t2 = t2.replace(/&amp;/g, '&');
            var nm2 = stripHtml(firstMatch(m2[2], /<strong>([^<]*)<\/strong>/i) || m2[2]) || ('信号' + (signals.length + 1));
            var fu2 = absUrl(t2, playPageUrl || host);
            if (seenUrls[fu2 + nm2]) continue;
            seenUrls[fu2 + nm2] = true;
            signals.push({ name: nm2, url: fu2 });
        }
    }
    if (!signals.length && playPageUrl) {
        signals.push({ name: '直播', url: playPageUrl });
    }
    return signals;
}

function parseList(html, tid) {
    const list = [];
    const reg = /<ul\b[^>]*class=["'][^"']*item[^"']*["'][^>]*>[\s\S]*?<\/ul>/gi;
    let m;
    while ((m = reg.exec(String(html || ''))) !== null) {
        const item = m[0];
        if (!/class=["'][^"']*ok[^"']*me[^"']*["']/i.test(item)) continue;
        const links = [];
        const lineSeen = {};
        const areg = /<a\b([^>]*class=["'][^"']*ok[^"']*me[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
        let am;
        while ((am = areg.exec(item)) !== null) {
            const attrs = am[1];
            const href = firstMatch(attrs, /href=["']([^"']+)["']/i);
            const dataPlay = firstMatch(attrs, /data-play=["']([^"']+)["']/i);
            const targetUrl = dataPlay || href;
            if (!targetUrl || targetUrl === 'javascript:void(0)') continue;
            var fullUrl = absUrl(targetUrl, host);
            if (isDeadUrl(fullUrl)) continue;
            if (lineSeen[fullUrl]) continue;
            lineSeen[fullUrl] = true;
            links.push({ url: fullUrl });
        }
        if (!links.length) continue;

        const league = stripHtml(firstMatch(item, /class=["'][^"']*lab_events[^"']*["'][\s\S]*?<span[^>]*class=["']name["'][^>]*>([\s\S]*?)<\/span>/i));
        const time = stripHtml(firstMatch(item, /class=["'][^"']*lab_time[^"']*["'][^>]*>([\s\S]*?)<\/li>/i));
        const home = stripHtml(firstMatch(item, /class=["'][^"']*lab_team_home[^"']*["'][\s\S]*?<strong[^>]*class=["']name["'][^>]*>([\s\S]*?)<\/strong>/i));
        const away = stripHtml(firstMatch(item, /class=["'][^"']*lab_team_away[^"']*["'][\s\S]*?<strong[^>]*class=["']name["'][^>]*>([\s\S]*?)<\/strong>/i));
        const stype = firstMatch(item, /data-stype=["']([^"']+)["']/i);
        const hot = /class=["'][^"']*hot[^"']*["']/i.test(item);
        let name = [home, away].filter(Boolean).join(' vs ') || stripHtml(item).slice(0, 80) || '赛事直播';
        let remarks = [time, league].filter(Boolean).join(' ') || '直播';
        if (!matchCategory(tid, league, name, stype, hot)) continue;
        const pic = absUrl(firstMatch(item, /<img[^>]+src=["']([^"']+)["']/i) || defaultPic, host);
        const payload = {
            name,
            pic,
            urls: links.map(function(l) { return l.url; })
        };
        list.push({
            vod_id: 'jrs$' + utf8ToBase64Url(JSON.stringify(payload)),
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remarks
        });
    }
    return list;
}

function getClasses() {
    return [{
            type_id: 'all',
            type_name: '全部'
        },
        {
            type_id: 'football',
            type_name: '足球'
        },
        {
            type_id: 'basketball',
            type_name: '篮球'
        },
        {
            type_id: 'other',
            type_name: '其他'
        }
    ];
}

async function init(cfg) {
    if (cfg && cfg.ext && String(cfg.ext).indexOf('http') === 0) host = String(cfg.ext).replace(/\/$/, '');
}
async function home(filter) {
    return JSON.stringify({
        class: getClasses(),
        filters: {}
    });
}
async function homeVod() {
    return await category('live', 1, false, {});
}
async function category(tid, pg, filter, extend) {
    const html = await fetchHome(false);
    const list = parseList(html, tid || 'all');
    return JSON.stringify({
        code: 1,
        msg: '数据列表',
        page: parseInt(pg) || 1,
        pagecount: 1,
        limit: list.length,
        total: list.length,
        list
    });
}
async function detail(id) {
    id = Array.isArray(id) ? id[0] : id;
    var payload = null;
    id = String(id || '');
    if (id.indexOf('jrs$') === 0) payload = safeJson(base64UrlToUtf8(id.slice(4)), null);
    if (!payload && /^https?:\/\//i.test(id)) payload = { name: '赛事直播', pic: defaultPic, urls: [id] };
    if (!payload) return JSON.stringify({ code: 1, list: [], page: 1, pagecount: 1, total: 0 });
    var urls = payload.urls || (payload.url ? [payload.url] : []);
    var playPageUrls = [];
    for (var i = 0; i < urls.length; i++) {
        var u = urls[i];
        if (!u || u.indexOf('http') !== 0) continue;
        var urlPath = u.replace(/^https?:\/\/[^/]+/i, '');
        if (urlPath === '/.html' || urlPath.length < 3) continue;
        playPageUrls.push(u);
    }
    if (!playPageUrls.length && urls.length > 0) {
        var fallback = urls[0];
        var fPath = fallback.replace(/^https?:\/\/[^/]+/i, '');
        if (fPath !== '/.html' && fPath.length >= 3 && !/pao/i.test(fallback)) playPageUrls.push(fallback);
    }
    // V41: 合并所有线路页的信号为单场一行（最多取前6个线路页，每个页内全部信号），去掉硬限3路
    var allParts = [];
    var maxPages = Math.min(playPageUrls.length, 6);
    for (var pi = 0; pi < maxPages; pi++) {
        var playPageUrl = playPageUrls[pi];
        var signals = [];
        try {
            var ph = await fetchText(playPageUrl, host + '/');
            if (ph) signals = parseSignals(ph, playPageUrl);
        } catch (e) {}
        for (var si = 0; si < signals.length; si++) {
            var sig = signals[si];
            var resolved = await resolveSignal(sig.url, playPageUrl);
            // V41: 解析失败时仍保留按钮名+原始链接，不再直接跳过，保证8路全显示
            var finalUrl = resolved || sig.url;
            allParts.push(sig.name + '$' + finalUrl);
        }
    }
    // 若整场无信号页，回退到原始 url 解析
    if (!allParts.length) {
        for (var i = 0; i < urls.length; i++) {
            var u = urls[i];
            if (u && u.indexOf('http') === 0 && !/pao/i.test(u)) {
                var r = await resolveSignal(u, host + '/');
                if (r) {
                    allParts.push('直播$' + r);
                    break;
                }
            }
        }
    }
    var playFrom = 'JRKAN直播';
    var playUrl = allParts.join('#');
    if (!playUrl) return JSON.stringify({ code: 1, list: [], page: 1, pagecount: 1, total: 0 });
    return JSON.stringify({ code: 1, msg: '数据列表', page: 1, pagecount: 1, limit: 1, total: 1, list: [{ vod_id: id, vod_name: payload.name || '赛事直播', vod_pic: payload.pic || defaultPic, vod_remarks: '直播ing', vod_content: 'JRKAN 体育赛事直播。', vod_play_from: playFrom, vod_play_url: playUrl }] });
}
function fixM3u8Domain(url) {
    var s = String(url || '').replace(/hdl\d+\.remmuszs\.cn/g, function(m) { return m.replace('remmuszs.cn', 'szsummer.cn'); });
    // V43: 主播解说真实可播域名为 hanxi1688.com，站点编码异常导致解出 8861ixnah.com，强制纠偏
    s = s.replace(/hdl\d+\.8861ixnah\.com/g, function(m) { return m.replace('8861ixnah.com', 'hanxi1688.com'); });
    return s;
}

async function resolveSignal(sigUrl, referer) {
    if (/\/play\/(?:pao|kbs)\/\?/i.test(sigUrl)) {
        var paoResult = await resolvePao(sigUrl, referer);
        if (paoResult) return paoResult;
        // V41: pao 页未命中 encodedStr 时，直接取页内 m3u8 / iframe 兜底
        try {
            var pUrl = sigUrl;
            var pHtml = await fetchText(pUrl, referer || host + '/');
            if (pHtml) {
                var pdu = extractM3u8FromPage(pHtml, pUrl);
                if (pdu && looksLikePlayable(pdu)) { pdu = fixM3u8Domain(pdu); return pdu; }
                var pif = firstMatch(pHtml, /<iframe[^>]+src=["']([^"']+)["']/i);
                if (pif) {
                    if (pif.indexOf('http') !== 0) pif = absUrl(pif, pUrl);
                    var pifH = await fetchText(pif, pUrl);
                    if (pifH) { var pdu2 = extractM3u8FromPage(pifH, pif); if (pdu2 && looksLikePlayable(pdu2)) { pdu2 = fixM3u8Domain(pdu2); return pdu2; } }
                }
            }
        } catch (e) {}
        return '';
    }
    if (/\.(m3u8|mp4|flv)(\?|$)/i.test(sigUrl)) {
        var fixed = fixM3u8Domain(sigUrl);
        return fixed;
    }
    if (/sm\.html/i.test(sigUrl)) {
        var smId = firstMatch(sigUrl, /(?:^|[?&])id=([^&]+)/i);
        if (smId) {
            try {
                var iUrl = absUrl('/play/' + smId + '.html', sigUrl);
                var iHtml = await fetchText(iUrl, sigUrl);
                if (iHtml) {
                    // V43: 主播解说真实页用 encodedStr/XXTEA，复用 resolvePao 解码（之前漏调导致解出坏域名8861ixnah）
                    var paoFromInner = await resolvePao(iUrl, sigUrl);
                    if (paoFromInner) { paoFromInner = fixM3u8Domain(paoFromInner); return paoFromInner; }
                    var mm = iHtml.match(/src=["']([^"']*\/msss\.html\?id=([^"']+))["']/i);
                    if (mm) { var st = mm[2]; if (st.indexOf('//') === 0) st = 'https:' + st; st = fixM3u8Domain(st); return st; }
                    var du = extractM3u8FromPage(iHtml, iUrl);
                    if (du && looksLikePlayable(du)) { du = fixM3u8Domain(du); return du; }
                }
            } catch (e) {}
        }
        try { var sr = await resolveSmM3u8(sigUrl); if (sr) { sr = fixM3u8Domain(sr); return sr; } } catch (e) {}
        return '';
    }
    // V41: 新增三种信号格式解析（mgxl / wlive / wen），均复用 pao 的 XXTEA 解码（同 encodedStr 结构）
    if (/\/play\/(mgxl|wlive|wen)\//i.test(sigUrl)) {
        var pr = await resolvePao(sigUrl, referer || host + '/');
        if (pr) return pr;
        try {
            var wHtml = await fetchText(sigUrl, referer || host + '/');
            if (wHtml) {
                var wmm = wHtml.match(/src=["']([^"']*\/msss\.html\?id=([^"']+))["']/i);
                if (wmm) { var wst = wmm[2]; if (wst.indexOf('//') === 0) wst = 'https:' + wst; wst = fixM3u8Domain(wst); return wst; }
                var wdu = extractM3u8FromPage(wHtml, sigUrl);
                if (wdu && looksLikePlayable(wdu)) { wdu = fixM3u8Domain(wdu); return wdu; }
                var wif = firstMatch(wHtml, /<iframe[^>]+src=["']([^"']+)["']/i);
                if (wif) {
                    if (wif.indexOf('http') !== 0) wif = absUrl(wif, sigUrl);
                    var wifH = await fetchText(wif, sigUrl);
                    if (wifH) { var wdu2 = extractM3u8FromPage(wifH, wif); if (wdu2 && looksLikePlayable(wdu2)) { wdu2 = fixM3u8Domain(wdu2); return wdu2; } }
                }
            }
        } catch (e) {}
        return '';
    }
    try {
        var sHtml = await fetchText(sigUrl, referer || host + '/');
        if (sHtml) {
            var mm2 = sHtml.match(/src=["']([^"']*\/msss\.html\?id=([^"']+))["']/i);
            if (mm2) { var st2 = mm2[2]; if (st2.indexOf('//') === 0) st2 = 'https:' + st2; st2 = fixM3u8Domain(st2); return st2; }
            var du2 = extractM3u8FromPage(sHtml, sigUrl);
            if (du2 && looksLikePlayable(du2)) { du2 = fixM3u8Domain(du2); return du2; }
            var ifSrc = firstMatch(sHtml, /<iframe[^>]+src=["']([^"']+)["']/i);
            if (ifSrc) {
                if (ifSrc.indexOf('http') !== 0) ifSrc = absUrl(ifSrc, sigUrl);
                try {
                    var ifH = await fetchText(ifSrc, sigUrl);
                    if (ifH) { var du3 = extractM3u8FromPage(ifH, ifSrc); if (du3 && looksLikePlayable(du3)) { du3 = fixM3u8Domain(du3); return du3; } }
                } catch (e2) {}
            }
        }
    } catch (e) {}
    return '';
}
async function search(wd, quick, pg) {
    return JSON.stringify({
        code: 1,
        msg: '数据列表',
        page: parseInt(pg) || 1,
        pagecount: 1,
        limit: 20,
        total: 0,
        list: []
    });
}
// V42: 播放header统一（防盗链CDN必须带Referer/Origin）
function playHeaders() {
    return {
        'User-Agent': UA,
        'Referer': host + '/',
        'Origin': host
    };
}

async function play(flag, id, flags) {
    var raw = String(id || '');
    if (/\.(m3u8|mp4|flv)(\?|$)/i.test(raw)) {
        // V42: 直链也带 header，否则 kinxie/8861ixnah 等防盗链CDN会拒流（主播解说类播不出的根因）
        return JSON.stringify({ parse: 0, url: raw, header: playHeaders() });
    }
    // 相对路径兜底：detail传进来的若是站点相对地址，转绝对
    if (/^\//.test(raw)) {
        raw = (host || 'https://m.sportsteam53.com') + raw;
        return JSON.stringify({ parse: 0, url: raw, header: playHeaders() });
    }
    return JSON.stringify({ parse: 1, url: raw, header: playHeaders() });
}

async function homeContent(filter) {
    return safeJson(await home(filter), {
        class: [],
        filters: {}
    });
}
async function homeVideoContent() {
    return safeJson(await homeVod(), {
        list: []
    });
}
async function categoryContent(tid, pg, filter, extend) {
    return safeJson(await category(tid, pg, filter, extend || {}), {
        list: []
    });
}
async function detailContent(ids) {
    return safeJson(await detail(ids), {
        list: []
    });
}
async function searchContent(wd, quick, pg) {
    return safeJson(await search(wd, quick, pg || 1), {
        list: []
    });
}
async function playerContent(flag, id, flags) {
    return safeJson(await play(flag, id, flags), {
        parse: 1,
        url: id
    });
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