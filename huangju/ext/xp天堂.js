import cheerio from 'assets://js/lib/cheerio.min.js';


const sites = [
    'https://dzsx5k01kgm6y.cloudfront.net',//这个可以直连
    'https://attack.bjidvlyog.com',
    'https://agency.bjidvlyog.com/'
]
const baseUrl = sites[0];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function mylog() {
    const TAG = "xp天堂18+";
    console.log(TAG, ...arguments)
}
async function init(extend) { }


let cachedClasses = [];
let cachedFilters = {};
let hasParsed = false;

/**
 * 1. 动态获取并解析全量的一级分类 (class)
 */
async function home(filter) {
    try {
        // 1. 请求首页或者含有这个导航 container 的网页源码
        const html = await req(baseUrl).content; // 如果是在特定页面，把 baseUrl 改为对应路径
        const $ = cheerio.load(html);
        let classes = [];
        let filters = {};

        // 标准的排序规则
        const sortFilter = [
            {
                key: "sort",
                name: "排序",
                value: [
                    { n: "最近更新", v: "update" },
                    { n: "最高收藏", v: "favorite" },
                    { n: "近期最佳", v: "hot" },
                    { n: "最多观看", v: "watch" }
                ]
            }
        ];

        // 2. 扫一遍所有的 container 区块，全量榨干“选片”和“标签”
        $('.app-nav .container').each((index, element) => {
            // 抓取区块的标题（比如“选片”）
            const blockTitle = $(element).find('.title-box h2').text().trim();

            // === 自动解析【选片主题】块 ===
            if (blockTitle.includes("选片") || blockTitle.includes("主题")) {
                $(element).find('a.tjtagmanager').each((i, el) => {
                    const name = $(el).text().trim();
                    let href = $(el).attr('href') || '';

                    // 砍掉末尾自带的 /favorite/ 或 /update/，还原成纯净的 ID 路径
                    // 例如: /theme/detail/64/favorite/ -> /theme/detail/64
                    href = href.replace(/\/(favorite|update|hot|watch)\/?$/, '');

                    if (href && name) {
                        classes.push({ type_id: href, type_name: name });
                        filters[href] = sortFilter; // 给它绑定排序筛选
                    }
                });
            }

            // === 自动解析【平级标签】块 ===
            // 根据特征：含有 .tag 类的 a 标签
            if ($(element).find('a.tag').length > 0) {
                $(element).find('a.tag').each((i, el) => {
                    const name = $(el).text().trim();
                    let href = $(el).attr('href') || '';

                    // 砍掉末尾可能自带的排序后缀（如 /hot/）和开头的斜杠，还原成纯净的 ID 路径
                    // 例如: /tags/9540/hot/ -> /tags/9540
                    href = href.replace(/\/(favorite|update|hot|watch)\/?$/, '');

                    if (href && name) {
                        // 加上前缀或者小图标区分标签和主题
                        classes.push({ type_id: href, type_name: `🏷️ ${name}` });
                        filters[href] = sortFilter; // 给标签也绑定平级的排序筛选
                    }
                });
            }
        });

        // 3. 缓存结果，防止后续调用 homeFilter 时二次请求浪费时间   
        // 暂时过滤资讯和回家
        cachedClasses = classes.filter(item => !item.type_name.includes("资讯")&&!item.type_name.includes('回家'));
        cachedFilters = filters;
        hasParsed = true;
        return JSON.stringify({
            class: cachedClasses,
           filters: await homeFilter()
        });

    } catch (e) {
        console.error("❌ 全自动解析 class 失败: ", e.message);
        // 崩溃兜底，防止壳子黑屏
        return JSON.stringify({ class: [] });
    }
}

/**
 * 2. 完美的平级筛选逻辑
 */
async function homeFilter() {
    mylog("开始解析筛选逻辑");
    // 如果已经解析过了，直接扔出缓存结果
    if (hasParsed) {
        return cachedFilters;
    }
    // 理论上壳子会先执行 home 再执行 homeFilter，如果未解析则返回空对象防错
    return {};
}

function fixVodName(name = "") {
    return name.trim().split(" ").slice(1, -1).join("");
}

// async function parseArticleList(html) {
//     // 确保已经加载了 cheerio
//     const $ = cheerio.load(html);
//     const list = [];

//     // 针对每个视频卡片进行遍历
//     $('.video-img-box').each((index, element) => {
//         const titleEl = $(element).find('h3.title a.text');
//         const imgEl = $(element).find('img.zximg');
//         const descEl = $(element).find('p.sub-title');

//         // 提取核心数据
//         const vod_id = titleEl.attr('href') || '';
//         const vod_name = titleEl.text().trim();

//         // 关键点：提取自定义属性 z-image-loader-url
//         const vod_pic = imgEl.attr('z-image-loader-url') || '';

//         // 提取备注（简介/日期）
//         const vod_remarks = descEl.text().trim();

//         // 过滤掉无效数据（如果没有链接或标题则跳过）
//         if (vod_id && vod_name) {
//             list.push({
//                 vod_id: vod_id,       // 对应详情页接口的参数
//                 vod_name: vod_name,   // 列表显示的标题
//                 vod_pic: vod_pic,     // 封面图
//                 vod_remarks: vod_remarks // 列表右上角的备注信息
//             });
//         }
//     });

//     return JSON.stringify({ list: list });
// }

// ⭐ 优化 1：分类页采用 Promise.all 并发多线程解析
async function category(tid, pg, filter, extend) {
    try {
        if(!tid) return JSON.stringify({ list: [] });
        pg = pg || 1;
        // const url = baseUrl + tid + (extend.type || '') + `/${pg}/`;

        const sort = extend.sort || '';


        let url = `${baseUrl}${tid}/${sort}/${pg}/`;
        mylog(`🚀 正在请求分类URL: ${url}`);

        // if (tid.includes('article')) {
        //     url = baseUrl + tid
        //     mylog(`🚀 正在请求分类URL: ${url}`);

        //     const html = (await req(url)).content;
        //     const $ = cheerio.load(html);
        //     return parseArticleList(html)
        // }


        const html = (await req(url)).content;
        const $ = cheerio.load(html);

        const videoElements = $('.col-6.col-sm-4.col-lg-3').toArray();

        // 将每一项的解析包装成独立的异步任务（不阻塞彼此）
        const tasks = videoElements.map(async (el) => {
            const item = $(el).find('.video-img-box a');
            const href = item.attr('href') || '';

            if (href.includes('/videos/')) {
                const vod_id = href;
                let vod_name = $(el).find('.title a').text().trim();
                vod_name = fixVodName(vod_name);

                const watchCount = $(el).find('span[class^="interaction_watch_count_"]').text().trim() || '';
                const vod_remarks = watchCount && (watchCount + "播放");
                const vod_year = $(el).find('.label').text().trim();

                let vod_pic = $(el).find('img.zximg').attr('z-image-loader-url') || '';

                // 并发执行：所有的图片解密网络请求同时发出
                vod_pic = await getRealImgurl(vod_pic);

                return {
                    vod_id,
                    vod_name,
                    vod_pic,
                    vod_year,
                    vod_remarks,
                    land: 1,
                    ratio: 1.78
                };
            }
            return null;
        });

        // ⭐ 核心：静静等待所有并发任务一起完成
        const results = await Promise.all(tasks);
        // 过滤掉广告（null数据）
        let list = results.filter(item => item !== null);

        // 分页逻辑
        let total = $('ul.dx-pager ').attr("data-rec-total");
        let perPageCount = $('ul.dx-pager ').attr("data-rec-per-page");
        const pagecount = Math.ceil(total / perPageCount);

        mylog(`category 成功并发抓取有效视频数: ${list.length}`);

        return JSON.stringify({ list, pagecount });

    } catch (e) {
        mylog(e);
        return JSON.stringify({ list: [] });
    }
}


/**
 * 专用函数：解析“文章类型”页面
 */
// async function parseArticleDetail($, id) {
//     const vod_name = $('h1').text().trim();
//     // 优先读取 textarea 的 Markdown 内容
//     const vod_content = $('textarea').text().trim() || $('.text-content').text().trim();

//     let play_url = "";

//     // 逻辑：从 Markdown 内容中正则提取播放地址
//     const match = vod_content.match(/\(\/(videos|play)\/([^\/]+)\/\)/);
//     if (match) {
//         play_url = match[0].replace(/[()]/g, '');
//     } else {
//         // 兜底：搜索页面上的链接
//         const link = $('a[href*="/videos/"]').first().attr('href');
//         if (link) play_url = link;
//     }

//     return JSON.stringify({
//         list: [{
//             vod_name: vod_name,
//             vod_content: vod_content,
//             vod_play_from: play_url ? "XP天堂" : "文章内容",
//             vod_play_url: play_url ? `立即播放$${play_url}` : ""
//         }]
//     });
// }
async function detail(vid) {
    try {
        const url = baseUrl + vid;
        const html = (await req(url)).content;
        const $ = cheerio.load(html);

        // if (vid.includes('/article/')) {
        //     return await parseArticleDetail($, vid);
        // }

        let vod_name = $('h1.my-foldable-content').text().trim();
        let vod_pic = $('#player').attr('data-src') || '';
        vod_pic = await getRealImgurl(vod_pic);

        // 🔍 1. 精准提取标签，确保没有任何前后空格
        let tagsArray = [];
        $('h5.tags a').each((i, el) => {
            let tagName = $(el).text().trim();
            if (tagName) tagsArray.push(tagName);
        });

        let vod_actor = tagsArray.join('/');
        let vod_class = tagsArray.join(' ');

        // 🔍 3. 备用保险：利用 CLICKER 规则，在简介里生成绝对能跳转的超链接
        let vod_content = "(todo)标签快捷搜索：\n";
        tagsArray.forEach(tag => {
            // 拼接蜂蜜专属的底层的 CLICKER 格式
            vod_content += `[a=cr:{"action":"category","key":"${tag}"}/]【${tag}】[/a]   `;
        });

        // 提取播放地址
        const regex = /https?:\/\/[^\s"'`]+\.m3u8(?:\?[^\s"'`]+)?/g;
        const match = html.match(regex);
        let hlsUrl = match ? match[0] : '';

        const lines = ["hls线路"];
        const vod_play_from = lines.join("$$$");
        const playlistArray = [`正片\$${hlsUrl}`];
        const vod_play_url = playlistArray.join('$$$');

        const watchCount = $('.video-info span[class^="interaction_watch_count_"]').text().trim().toUpperCase() || '';
        const favorite_count = $('#bind_collect_count').text().trim().toUpperCase() || '';
        let vod_remarks = watchCount && (watchCount + "播放");
        vod_remarks += favorite_count && (" | " + favorite_count + "收藏");

        const back = {
            vod_id: vid,
            vod_remarks,
            vod_name: vod_name,
            vod_pic: vod_pic,
            vod_content: vod_content, // 👈 简介里会显示高亮可点击的标签
            vod_actor: vod_actor,     // 👈 演员药丸标签（已剔除空格坑）
            vod_class: vod_class,     // 👈 类型标签（多重兼容兜底）
            vod_play_from,
            vod_play_url
        };

        return JSON.stringify({ list: [back] });
    } catch (e) {
        mylog(e);
        return JSON.stringify({ list: [] });
    }
}
// ⭐ 优化 2：搜索页同样采用 Promise.all 并发加速
async function search(key, quick, page) {
    try {
        page = page || 1;

        const url = baseUrl + `/search/${key}/${page}/`;
        mylog(`正在搜索: ${url}`);

        const html = (await req(url)).content;
        const $ = cheerio.load(html);

        const searchElements = $('.video-img-box').toArray();

        const tasks = searchElements.map(async (el) => {
            const a = $(el).find('.img-box > a');
            const vod_id = $(a).attr('href') || '';
            const vod_name = $(a).find('img').attr('alt') || '';
            let vod_pic = $(a).find('img.zximg').attr('z-image-loader-url') || '';

            if (vod_pic) {
                vod_pic = await getRealImgurl(vod_pic);
            }

            const vod_remarks = $(el).find('.absolute-bottom-right .label').text().trim();

            return {
                vod_id: vod_id,
                vod_name: fixVodName(vod_name),
                vod_pic: vod_pic,
                vod_remarks: vod_remarks
            };
        });

        const list = await Promise.all(tasks);

        // 分页逻辑
        let total = $('ul.dx-pager ').attr("data-rec-total");
        let perPageCount = $('ul.dx-pager ').attr("data-rec-per-page");
        const pagecount = Math.ceil(total / perPageCount);
        return JSON.stringify({
            list,
            pagecount
        });
    } catch (e) {
        mylog(e);
        return JSON.stringify({ list: [] });
    }
}
async function play(flag, id, vipFlags) {
    return JSON.stringify({
        parse: 0,
        url: id,
        header: { "User-Agent": UA, "Referer": baseUrl }
    });
}
async function getRealImgurl(imgurl) {
    try {
        if (!imgurl) return "";
        let res = await req(imgurl, {
            method: "get",
            headers: {
                "User-Agent": UA,
                "Referer": "https://wuabeza.gyqspl.cn/"
            },
            buffer: 2
        });

        const encryptedBase64 = res.content;
        if (!encryptedBase64) return "";

        let realImageBase64 = aesX(
            "AES/CBC/No",
            false,
            encryptedBase64,
            true,
            "f5d965df75336270",
            "97b60394abc2fbe1",
            true
        );

        if (!realImageBase64) return "";

        let ext = "jpeg";
        if (imgurl.toLowerCase().indexOf(".gif") !== -1) {
            ext = "gif";
        } else if (imgurl.toLowerCase().indexOf(".png") !== -1) {
            ext = "png";
        }

        const back = "data:image/" + ext + ";base64," + realImageBase64;

        // ⭐ 优化 3：【核心改动】删除了原先直接打印超长 base64 的 mylog，改为只打印长度，解放系统 CPU 
        // mylog("[base64] ", back); 

        return back;
    } catch (e) {
        return "";
    }
}

export default { init, home, category, detail, search, play };