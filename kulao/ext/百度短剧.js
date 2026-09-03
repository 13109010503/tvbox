/*
@header({
  searchable: 1,
  filterable: 0,
  quickSearch: 1,
  title: '百度短剧',
  lang: 'cat'
})
*/
import { Crypto as CryptoJS } from 'assets://js/lib/cat.js';

let key = '百度短剧';
let siteName = '';
let siteKey = '';
let siteType = 0;
let shuaCache = [];  

let UA = "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36";
let clarity_order = {'蓝光': 1, '超清': 2, '标清': 3};

// ==================== URL配置集中管理 ====================
let rule = {
    host: 'https://mbd.baidu.com',
    detailHost: 'https://sv.baidu.com',
    listUrl: '/feedapi/v1/videoserver/playlets/list?service=bdbox',
    searchUrl: '/feedapi/v1/videoserver/playlets/search?service=bdbox',
    detailUrl: '/haokan/ui-video/playlet/rec/detail?log=vhk&tn=1020970b&ctn=1008350n&blur=1',
    playUrl: '/appui/api?cmd=video/relate&log=vhk&tn=1020970b&ctn=1008350n&blur=1',
};

function init(cfg) {
    siteName = (cfg.skey?.split('_')[1] || cfg.skey) || (cfg.key?.split('_')[1] || cfg.key) || '未知';
    siteKey = cfg.skey;
    siteType = cfg.stype;
}

function home(filter) {
    let he = ["全部", "新剧", "限时免费", "精选", "独播"];
    let ticailist = [
        "神医", "连续剧", "都市", "现代言情", "异能", "逆袭", "甜宠", "总裁", "萌宝", "战神", "宫斗宅斗", "神豪",
        "虐恋", "闪婚", "玄幻", "穿越重生", "年代", "家庭伦理", "古代言情", "武侠武打", "赘婿", "单元剧", "青春校园",
        "历史架空", "王妃", "鉴宝", "科幻", "军旅战争", "种田"
    ];
    
    let classes = he.map(name => ({
        type_id: name,
        type_name: name
    }));
    
    classes = classes.concat(ticailist.map(name => ({
        type_id: name === "全部" ? "全部题材" : name,
        type_name: name
    })));
    
    return JSON.stringify({
        class: classes,
        filters: {}
    });
}

async function homeVod() {
    const categoryResult = await category('新剧', 1, {}, {});
    const categoryList = JSON.parse(categoryResult).list;
    
    return JSON.stringify({
        list: [
            {
                vod_id: 'shua',
                vod_name: '发现精彩',
                vod_pic: 'https://t8.baidu.com/it/u=615012979,225344800&fm=193'
            },
            ...categoryList
        ]
    });
}

/**
 * 合并请求函数 - 统一处理 data 和 body，支持 form-urlencoded 和 JSON
 */
async function request(url, options = {}) {
    try {
        console.log(`【${siteName}】${options.method || 'GET'} ${url.split('?')[0]}`);
        
        // 准备基础配置
        let requestConfig = {
            method: options.method || 'GET',
            headers: { "User-Agent": UA, ...options.headers }
        };
        
        // 获取内容类型
        let contentType = requestConfig.headers['Content-Type'] || '';
        
        // 辅助函数：将对象转换为字符串
        function stringifyData(data, format) {
            if (format.includes('json')) {
                return JSON.stringify(data);
            } else {
                // 默认 form-urlencoded
                const parts = [];
                for (let key in data) {
                    let value = data[key];
                    if (typeof value === 'object' && value !== null) {
                        value = JSON.stringify(value);
                    }
                    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
                }
                return parts.join('&');
            }
        }
        
        // 处理数据 - 无论 data 还是 body，统一处理
        let requestData = options.data || options.body;
        
        if (requestData) {
            if (typeof requestData === 'string') {
                // 已经是字符串，直接使用
                requestConfig.body = requestData;
            } else if (typeof requestData === 'object') {
                // 对象，根据内容类型转换
                if (!contentType) {
                    // 没有指定内容类型，默认 form-urlencoded
                    contentType = 'application/x-www-form-urlencoded';
                    requestConfig.headers['Content-Type'] = contentType;
                }
                requestConfig.body = stringifyData(requestData, contentType);
            }
        }
        
        const res = await req(url, requestConfig);
        return res.content || '';
    } catch (e) {
        console.log(`【${siteName}】请求失败: ${e.message}`);
        return '';
    }
}

async function category(tid, pg, filter, extend) {
    pg = pg <= 0 ? 1 : pg;
    let sub = ["新剧", "限时免费", "精选", "独播"].includes(tid) ? tid : "新剧";
    let tcsub = tid === "全部" || tid === "全部题材" ? "" : tid;
    
    let t = Math.floor(Date.now() / 1000);
    let version = await md5(t + "v2");
    
    // 直接传对象
    let postData = {
        'data': {
            "data": {
                "extRequest": { "flow_tabid": "13" },
                "from": "feed",
                "page": "channel_video_landing",
                "pd": "feed",
                "refreshIndex": pg,
                "cursor": "",
                "theme": "",
                "timestamp": t,
                "version": version,
                "themes": [
                    { "kind": "综合", "names": [sub] },
                    { "kind": "题材", "names": [tcsub] }
                ]
            }
        }
    };
    
    let html = await request(`${rule.host}${rule.listUrl}`, {
        method: 'POST',
        headers: {
            "Connection": "Keep-Alive",
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: postData  // 可以用 data
    });
    
    let res = JSON.parse(html);
    let items = res.data.items;
    
    let videos = items.map(it => ({
        vod_id: it.collId,
        vod_name: it.title,
        vod_pic: it.img,
        vod_remarks: it.updateStatus,
        vod_content: it.description
    }));
    
    return JSON.stringify({
        page: pg,
        pagecount: pg + 1,
        limit: 20,
        total: items.length * (pg + 1),
        list: videos
    });
}

async function detail(id) {
    if (id === 'shua') {
        return JSON.stringify({
            list: [{
                vod_id: 'shua',
                vod_name: '发现精彩',
                vod_pic: 'https://t8.baidu.com/it/u=615012979,225344800&fm=193',
                vod_play_from: '百度短剧',
                vod_play_url: '刷刷看$shua',
                vod_tag: '[SHUA][JUMP][V]'
            }]
        });
    }
    
    // 也可以用 body
    let html = await request(`${rule.detailHost}${rule.detailUrl}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: {  // body 传对象也会自动处理
            playlet_id: id,
            vid: "undefined"
        }
    });
    
    let res = JSON.parse(html);
    let dthtml = res.data;
    let vids = dthtml.vid_list;
    let playArr = vids.map((vid, index) => `第${index + 1}集$${vid}`);
    
    const vod = {
        vod_id: id,
        vod_name: dthtml.playlet_title,
        vod_pic: dthtml.playlet_poster,
        vod_content: dthtml.description,
        vod_remarks: `共${vids.length}集 热度值:${dthtml.hot_value} 集数:${dthtml.episodes_num}`,
        vod_director: dthtml.tag_text,
        vod_year: dthtml.create_time,
        vod_play_from: "百度短剧",
        vod_play_url: playArr.join('#')
    };
    
    return JSON.stringify({ list: [vod] });
}

async function play(flag, id, flags) {
    if (id == 'shua') {
        if (shuaCache.length == 0) {
            const randomPage = getRnd(1, 20);
            const categories = ["新剧", "限时免费", "精选", "独播"];
            const randomCate = categories[Math.floor(Math.random() * categories.length)];
            
            const categoryResult = await category(randomCate, randomPage, {}, {});
            const res = JSON.parse(categoryResult);
            const videos = [];
            
            for (const it of res.list.slice(0, 10)) {
                const detailResult = await detail(it.vod_id);
                const detailObj = JSON.parse(detailResult);
                const vod = detailObj.list[0];
                
                const match = vod.vod_remarks.match(/(\d+)/);
                const episodeCount = match[1];
                
                videos.push({
                    parse: 0,
                    url: it.vod_id,
                    shuaTitle: vod.vod_name,
                    shuaDes: '共' + episodeCount + '集 | ' + vod.vod_content.replace(/\s/g, ''),
                    shuaActions: { play: it.vod_id },
                    errorPlayNext: true
                });
            }
            shuaCache.push(...videos);
        }
        
        const cache = shuaCache.shift();
        const detailResult = await detail(cache.url);
        const detailObj = JSON.parse(detailResult);
        const vod = detailObj.list[0];
        
        const playUrls = vod.vod_play_url.split('#');
        const firstEpisode = playUrls[0];
        const vid = firstEpisode.split('$')[1];
        
        const playHtml = await request(`${rule.detailHost}${rule.playUrl}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: {  // 用 data 或 body 都可以
                method: "post",
                vid: vid
            }
        });
        
        const playRes = JSON.parse(playHtml);
        const playJson = playRes["video/relate"].data.cur_video;
        const urls = [];
        
        for (const item of playJson.clarityUrl) {
            urls.push({
                title: item.title,
                url: item.url,
                order: clarity_order[item.title] || 999
            });
        }
        urls.sort(function (a, b) { return a.order - b.order; });
        cache.url = urls[0].url;
        
        return JSON.stringify(cache);
    }
    
    const html = await request(`${rule.detailHost}${rule.playUrl}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: {  // body 传对象
            method: "post",
            vid: id
        }
    });
    
    const res = JSON.parse(html);
    const json = res["video/relate"].data.cur_video;
    const urls = [];
    
    for (const item of json.clarityUrl) {
        urls.push({
            title: item.title,
            url: item.url,
            order: clarity_order[item.title] || 999
        });
    }
    urls.sort(function (a, b) { return a.order - b.order; });
    
    const flat = [];
    for (const item of urls) {
        flat.push(item.title);
        flat.push(item.url);
    }
    
    return JSON.stringify({
        parse: 0,
        url: flat,
        header: { 
            'User-Agent': UA,
            'Referer': rule.host
        }
    });
}

async function search(wd, quick, pg) {
    pg = pg <= 0 ? 1 : pg;
    
    let postData = {
        'data': {
            "data": {
                "query": wd,
                "page": pg,
                "attribute": ["title"],
                "fe_page_type": "search",
                "extra": {
                    "tab_id": "216",
                    "flow_tabid": "13",
                    "shortplay_source": "feed",
                    "from": "feed",
                    "tab_type": "搜索",
                    "sub_template": "playlet_search_result"
                }
            }
        }
    };
    
    let html = await request(`${rule.host}${rule.searchUrl}`, {
        method: 'POST',
        headers: {
            "Connection": "Keep-Alive",
            "Accept-Encoding": "gzip",
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: postData  // 用 data
    });
    
    let res = JSON.parse(html);
    let items = res.data.itemList;
    
    let videos = items.map(it => ({
        vod_id: it.nid.split("_")[1],
        vod_name: it.title,
        vod_pic: it.img,
        vod_remarks: it.collNum + '集',
        vod_content: it.description
    }));
    
    return JSON.stringify({
        page: pg,
        pagecount: pg + 1,
        limit: 20,
        total: items.length * (pg + 1),
        list: videos
    });
}

function getRnd(min, max, hexNum, isUpper) {
    var r = parseInt(Math.random() * (max - min + 1) + min, 10);
    if (hexNum) {
        r = isUpper ? r.toString(hexNum).toUpperCase() : r.toString(hexNum);
    }
    return r;
}

async function md5(str) {
  return CryptoJS.MD5(str).toString(CryptoJS.enc.Hex).toLowerCase();
}

async function action(action, value) {
    if (action === 'shuaPlay') {
        return JSON.stringify({
            action: {
                actionId: '__detail__',
                ids: value,
                keep: true
            }
        });
    }
}

export function __jsEvalReturn() {
    return {
        init: init,
        home: home,
        homeVod: homeVod,
        category: category,
        detail: detail,
        play: play,
        search: search,
        action: action
    };
}