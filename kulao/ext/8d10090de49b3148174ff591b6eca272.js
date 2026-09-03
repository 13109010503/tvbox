/*
@header({
  searchable: 0,
  filterable: 1,
  quickSearch: 0,
  title: '鲸鱼直播[体]',
  author: 'OpenClaw',
  lang: 'cat',
  style: { type: 'rect', ratio: 1.5 }
})
@version V1
*/
const API = 'https://m.jytv12.com/webapi';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DEFAULT_PIC = 'https://cdn.jmsidc.net/images/2022070714043818606%E8%B6%B3%E7%90%83%E7%9B%B4%E6%92%AD.png';

async function apiPost(path, body) {
    if (typeof Java !== 'undefined' && Java && Java.req) {
        var r = await Java.req(API + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Referer': 'https://m.jytv12.com/', 'Origin': 'https://m.jytv12.com' },
            body: JSON.stringify(body || {})
        });
        return typeof r === 'string' ? JSON.parse(r) : JSON.parse((r && (r.body || r.content || r.data)) || '{}');
    }
    var r2 = await req(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Referer': 'https://m.jytv12.com/', 'Origin': 'https://m.jytv12.com' },
        body: JSON.stringify(body || {})
    });
    return JSON.parse((r2 && (r2.content || r2.body)) || '{}');
}

async function init(cfg) {}

async function home(filter) {
    var res = await apiPost('/live/getCategory');
    var classes = [{ type_id: '-1', type_name: '全部' }];
    if (res.status === 0 && res.data) {
        res.data.forEach(function(c) { classes.push({ type_id: String(c.id), type_name: c.title }); });
    }
    return JSON.stringify({ class: classes, filters: {} });
}

async function homeVod() { return await category('-1', 1, false, {}); }

async function category(tid, pg, filter, extend) {
    var body = {};
    if (tid && tid !== '-1') body.categoryid = parseInt(tid);
    var res = await apiPost('/home/get_all', body);
    var list = [];
    if (res.status === 0 && res.data && res.data.list) {
        res.data.list.forEach(function(item) {
            if (!item.pull_url) return;
            var catName = item.category_title || '';
            var anchorName = item.anchor && item.anchor.nick_name ? item.anchor.nick_name : '';
            list.push({
                vod_id: String(item.anchorid),
                vod_name: item.title || catName,
                vod_pic: item.thumb || DEFAULT_PIC,
                vod_remarks: (item.hot || 0) + '人 ' + catName
            });
        });
    }
    return JSON.stringify({ code: 1, msg: '数据列表', page: parseInt(pg) || 1, pagecount: 1, limit: list.length, total: list.length, list: list });
}

async function detail(id) {
    id = Array.isArray(id) ? id[0] : id;
    id = String(id || '');
    var res = await apiPost('/home/get_all');
    var found = null;
    if (res.status === 0 && res.data && res.data.list) {
        res.data.list.forEach(function(item) {
            if (String(item.anchorid) === id) found = item;
        });
    }
    if (!found) return JSON.stringify({ code: 1, list: [], page: 1, pagecount: 1, total: 0 });
    var streamUrl = found.pull_url || '';
    var catName = found.category_title || '';
    var anchorName = found.anchor && found.anchor.nick_name ? found.anchor.nick_name : '';
    var name = found.title || catName;
    var remarks = (found.hot || 0) + '人 ' + anchorName;
    return JSON.stringify({
        code: 1, msg: '数据列表', page: 1, pagecount: 1, limit: 1, total: 1,
        list: [{
            vod_id: id, vod_name: name, vod_pic: found.thumb || DEFAULT_PIC,
            vod_remarks: remarks, vod_content: '鲸鱼直播 - ' + catName,
            vod_play_from: '鲸鱼直播',
            vod_play_url: streamUrl ? ('直播$' + streamUrl) : ''
        }]
    });
}

async function play(flag, id, flags) {
    if (!id) return JSON.stringify({ parse: 1, url: '' });
    if (/\.m3u8(\?|$)/i.test(id)) return JSON.stringify({ parse: 0, url: id });
    if (/\.flv(\?|$)/i.test(id)) {
        var m3u8 = id.replace(/\.flv(\?.*)?$/i, '.m3u8$1');
        return JSON.stringify({ parse: 0, url: m3u8 });
    }
    return JSON.stringify({ parse: 0, url: id });
}

async function search(wd, quick, pg) {
    var res = await apiPost('/home/get_all');
    var list = [];
    if (res.status === 0 && res.data && res.data.list) {
        res.data.list.forEach(function(item) {
            var name = (item.title || '') + ' ' + (item.category_title || '') + ' ' + (item.anchor && item.anchor.nick_name ? item.anchor.nick_name : '');
            if (wd && name.indexOf(wd) === -1) return;
            if (!item.pull_url) return;
            list.push({
                vod_id: String(item.anchorid), vod_name: item.title || item.category_title || '',
                vod_pic: item.thumb || DEFAULT_PIC,
                vod_remarks: (item.hot || 0) + '人 ' + (item.category_title || '')
            });
        });
    }
    return JSON.stringify({ code: 1, msg: '数据列表', page: parseInt(pg) || 1, pagecount: 1, limit: list.length, total: list.length, list: list });
}

async function homeContent(filter) { return JSON.parse(await home(filter)); }
async function homeVideoContent() { return JSON.parse(await homeVod()); }
async function categoryContent(tid, pg, filter, extend) { return JSON.parse(await category(tid, pg, filter, extend || {})); }
async function detailContent(ids) { return JSON.parse(await detail(ids)); }
async function searchContent(wd, quick, pg) { return JSON.parse(await search(wd, quick, pg || 1)); }
async function playerContent(flag, id, flags) { return JSON.parse(await play(flag, id, flags)); }

export function __jsEvalReturn() {
    return {
        init, home, homeVod, category, search, detail, play,
        homeContent, homeVideoContent, categoryContent, detailContent, searchContent, playerContent
    };
}