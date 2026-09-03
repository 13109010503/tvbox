# -*- coding: utf-8 -*-
# XX01.COM 修复版 - 深度视频提取+简介修复+多CDN兜底
import os, json, re, sys, urllib.parse, time, base64, html
sys.path.append('..')
from base.spider import Spider

class Spider(Spider):
    def init(self, extend="{}"):
        self.err = ""
        try:
            cfg = json.loads(extend) if extend else {}
        except Exception as e:
            cfg = {}
            self.err = f"config解析失败:{e}"
        
        self.host = cfg.get('site', 'https://xx01.com')
        self.headers = {
            'referer': f'{self.host}/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
        
        try:
            from pyquery import PyQuery as pq
            self.pq = pq
        except Exception as e:
            self.pq = None
            self.err += f";缺pyquery:{e}"
        
        try:
            import requests
            self.req = requests
        except Exception as e:
            self.req = None
            self.err += f";缺requests:{e}"

    def getName(self):
        return "XX01"

    def isVideoFormat(self, url):
        return False

    def manualVideoCheck(self):
        return False

    def destroy(self):
        pass

    def localProxy(self, param):
        return {}

    def _log(self, msg):
        print(msg)

    # ==================== 网络请求工具 ====================
    def _fetch(self, url, timeout=15, retries=3):
        for i in range(retries):
            try:
                self._log(f"fetch [{i+1}/{retries}]: {str(url)[:100]}")
                r = self.req.get(url, headers=self.headers, timeout=timeout)
                if r.status_code == 200:
                    return r
                self._log(f"http {r.status_code}")
            except Exception as e:
                self._log(f"fetch err: {e}")
                if i < retries - 1:
                    time.sleep(1)
        return None

    # ==================== 视频链接深度提取 ====================
    def _extract_video_urls(self, text, source_name="page"):
        candidates = []
        if not text or len(text) < 10:
            return candidates
        text = html.unescape(text)
        
        # 1. 直接视频链接
        patterns = [
            r'(https?://[^\s"\'<>\[\]]+\.m3u8(?:\?[^\s"\'<>\[\]]*)?)',
            r'(https?://[^\s"\'<>\[\]]+\.mp4(?:\?[^\s"\'<>\[\]]*)?)',
            r'(https?://[^\s"\'<>\[\]]+\.flv(?:\?[^\s"\'<>\[\]]*)?)',
            r'(https?://pl\d+\.vvvvvvvv\.top/[^\s"\'<>\[\]]+)',
            r'(https?://[^\s"\'<>\[\]]*surrit\.com[^\s"\'<>\[\]]*)',
            r'(https?://[^\s"\'<>\[\]]*fourhoi\.com[^\s"\'<>\[\]]*)',
            r'(https?://[^\s"\'<>\[\]]*stream\.defeated\.xxx[^\s"\'<>\[\]]*)',
            r'(https?://[^\s"\'<>\[\]]*cdn\.transexjapan\.com[^\s"\'<>\[\]]*)',
            r'(https?://[^\s"\'<>\[\]]*tuaskbgnekr\.com[^\s"\'<>\[\]]*)',
            r'(https?://[^\s"\'<>\[\]]+/api/play\?url=[^\s"\'<>\[\]]+)',
            r'(https?://[^\s"\'<>\[\]]+/api/proxy/\?url=[^\s"\'<>\[\]]+)',
            r'src=["\']?(https?://[^\s"\'<>\[\]]+?\.(?:m3u8|mp4|flv))["\']?',
            r'data-(?:url|src|video|file)=["\']?(https?://[^\s"\'<>\[\]]+)["\']?',
            r'(?:var|let|const|window\.)\w*[Uu][Rr][Ll]\s*=\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
            r'["\']?url["\']?\s*:\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
            r'["\']?src["\']?\s*:\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
            r'["\']?file["\']?\s*:\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
            r'["\']?videoUrl["\']?\s*:\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
            r'["\']?playUrl["\']?\s*:\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
            r'["\']?m3u8["\']?\s*:\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
            r'["\']?mp4["\']?\s*:\s*["\'](https?://[^\s"\'<>\[\]]+)["\']',
        ]
        for pat in patterns:
            matches = re.findall(pat, text)
            for m in matches:
                if isinstance(m, tuple):
                    m = m[0] if m else ''
                if m:
                    candidates.append(m)
        
        # 2. 提取 surrit UUID 并构造完整链接
        uuid_pattern = r'["\']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["\']?'
        uuids = re.findall(uuid_pattern, text, re.IGNORECASE)
        for uid in uuids:
            candidates.append(f"https://surrit.com/{uid}/playlist.m3u8")
            candidates.append(f"https://surrit.com/{uid}/index.m3u8")
        
        # 3. 提取 fourhoi 的 vid 并构造链接（如果文本里有 fourhoi 相关引用）
        fourhoi_vid_pattern = r'fourhoi\.com/([a-zA-Z0-9\-]+)/'
        vids = re.findall(fourhoi_vid_pattern, text)
        for v in vids:
            candidates.append(f"https://fourhoi.com/{v}/playlist.m3u8")
            candidates.append(f"https://ig2.pppppppp.top/api/proxy/?url=https://fourhoi.com/{v}/playlist.m3u8")
        
        filtered = []
        for u in candidates:
            u = u.strip()
            if not u:
                continue
            if any(u.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.ico', '.css', '.js', '.json', '.xml']):
                continue
            if '/cover-' in u and ('.jpg' in u or '.webp' in u):
                continue
            # 跳过空 url 参数的残缺代理前缀（如 "...api/play?url=" + source）
            if re.search(r'[?&]url=$', u):
                continue
            # 跳过 JS 模板字符串占位（如 "...fourhoi.com${path}"）
            if '${' in u:
                continue
            # 确保是完整URL
            if not u.startswith('http'):
                continue
            filtered.append(u)
        
        self._log(f"[{source_name}] 提取到 {len(filtered)} 个候选")
        return filtered

    def _extract_from_scripts(self, html_obj, source_name="script"):
        """从所有script标签、noscript、以及inline JS中提取"""
        candidates = []
        try:
            # script 标签
            for script in html_obj('script').items():
                text = script.text() or ''
                if len(text) < 20:
                    continue
                candidates += self._extract_video_urls(text, f"{source_name}_inline")
                
                # 尝试解析可能的JSON
                try:
                    json_blocks = re.findall(r'\{[^{}]*"(?:url|src|file|video|m3u8|mp4)"[^{}]*\}', text)
                    for jb in json_blocks:
                        candidates += self._extract_video_urls(jb, f"{source_name}_json")
                except:
                    pass
                
                # base64 解码尝试
                try:
                    b64_matches = re.findall(r'["\']([A-Za-z0-9+/]{40,}={0,2})["\']', text)
                    for b64 in b64_matches:
                        try:
                            decoded = base64.b64decode(b64).decode('utf-8', errors='ignore')
                            if 'http' in decoded or 'm3u8' in decoded:
                                candidates += self._extract_video_urls(decoded, f"{source_name}_b64")
                        except:
                            pass
                except:
                    pass
            
            # 有时数据在 noscript 或 template 里
            for tag in html_obj('noscript, template, [type="application/json"]').items():
                text = tag.text() or ''
                if text:
                    candidates += self._extract_video_urls(text, f"{source_name}_hidden")
                    
        except Exception as e:
            self._log(f"script extract err: {e}")
        return candidates

    def _decode_proxy_url(self, url):
        if not url or 'url=' not in url:
            return url
        m = re.search(r'[?&]url=(https?://[^\s&"\'<>\[\]]+)', url)
        if m:
            decoded = urllib.parse.unquote(m.group(1))
            if 'url=' in decoded:
                return self._decode_proxy_url(decoded)
            return decoded
        return url

    def _pick_best_video(self, urls):
        def score(u):
            s = 0
            if '.m3u8' in u: s += 100
            if 'playlist.m3u8' in u: s += 50
            if 'surrit.com' in u: s += 40
            if 'fourhoi.com' in u and 'playlist' in u: s += 35
            if 'player.xxnet999.com' in u: s += 70
            if 'flicksbank' in u or 'console360.net' in u: s += 45
            if '.mp4' in u: s += 30
            if 'stream.defeated.xxx' in u: s += 25
            if 'vvvvvvvv.top' in u and 'api/play' in u: s += 20
            if 'vvvvvvvv.top' in u: s += 15
            if 'preview' in u and '.mp4' in u: s += 5
            if '.jpg' in u or '.png' in u or '.webp' in u: s -= 1000
            return s
        
        seen = set()
        unique = []
        for u in urls:
            if u not in seen:
                seen.add(u)
                unique.append(u)
        
        if not unique:
            return ''
        unique.sort(key=score, reverse=True)
        return self._decode_proxy_url(unique[0])

    def _guess_title_from_vid(self, vid):
        m = re.match(r'^([a-zA-Z]+-?\d+)', vid)
        if m:
            return m.group(1).upper()
        return vid

    def _is_special_category(self, vid):
        return any(vid.startswith(p) for p in ['PLANTSVSCUNTS-', 'masem-', 'kinostream-', 'timestudio-', 'video-'])

    def _is_timestudio(self, vid):
        return vid.startswith('timestudio-')

    def _is_kinostream(self, vid):
        return vid.startswith('kinostream-')

    # ==================== 业务接口 ====================
    def homeContent(self, filter):
        try:
            if self.err:
                return self._error(self.err)
            if not self.req or not self.pq:
                return self._error("缺少requests或pyquery依赖")
            
            r = self._fetch(f"{self.host}/", timeout=15)
            if not r:
                return self._error("首页请求失败")
            
            html = self.pq(r.content)
            classes = [
                {"type_id": "chinese-subtitle", "type_name": "中文字幕"},
                {"type_id": "madou", "type_name": "国产AV"},
                {"type_id": "genres/外国女优", "type_name": "欧美大片"},
                {"type_id": "PLANTSVSCUNTS", "type_name": "猎奇"},
                {"type_id": "masem", "type_name": "马赛姆"},
                {"type_id": "kinostream", "type_name": "kinostream"},
                {"type_id": "TIMESTUDIO", "type_name": "时间工作室"},
                {"type_id": "anime", "type_name": "成人动漫"},
                {"type_id": "new", "type_name": "最近更新"},
                {"type_id": "release", "type_name": "新作上市"},
                {"type_id": "uncensored-leak", "type_name": "无码流出"},
                {"type_id": "genres", "type_name": "类型"},
                {"type_id": "VR", "type_name": "VR"},
                {"type_id": "avtalk", "type_name": "AV解说"},
                {"type_id": "siro", "type_name": "SIRO"},
                {"type_id": "luxu", "type_name": "LUXU"},
                {"type_id": "gana", "type_name": "GANA"},
                {"type_id": "maan", "type_name": "PRESTIGE PREMIUM"},
                {"type_id": "scute", "type_name": "S-CUTE"},
                {"type_id": "ara", "type_name": "ARA"},
                {"type_id": "fc2", "type_name": "FC2"},
                {"type_id": "heyzo", "type_name": "HEYZO"},
                {"type_id": "tokyohot", "type_name": "東京熱"},
                {"type_id": "1pondo", "type_name": "一本道"},
                {"type_id": "caribbeancom", "type_name": "Caribbeancom"},
                {"type_id": "caribbeancompr", "type_name": "Caribbeancompr"},
                {"type_id": "10musume", "type_name": "10musume"},
                {"type_id": "pacopacomama", "type_name": "pacopacomama"},
                {"type_id": "gachinco", "type_name": "Gachinco"},
                {"type_id": "xxxav", "type_name": "XXX-AV"},
                {"type_id": "marriedslash", "type_name": "人妻斬"},
                {"type_id": "naughty4610", "type_name": "頑皮4610"},
                {"type_id": "naughty0930", "type_name": "頑皮0930"},
                {"type_id": "twav", "type_name": "TWAV"},
                {"type_id": "furuke", "type_name": "Furuke"},
                {"type_id": "klive", "type_name": "韓國直播"},
                {"type_id": "clive", "type_name": "中國直播"},
                {"type_id": "tiktok", "type_name": "抖阴视频"},
                {"type_id": "starface", "type_name": "明星换脸"},
                {"type_id": "cnlive", "type_name": "主播直播,国产主播"},
                {"type_id": "cmedia", "type_name": "国产传媒"},
                {"type_id": "playgirl", "type_name": "玩偶姐姐,网红头条"},
                {"type_id": "netdoor", "type_name": "网-曝-门,网曝黑料"},
            ]
            return {
                'class': classes,
                'filters': {},
                'list': self._parse_list(html)
            }
        except Exception as e:
            self._log(f"homeErr:{e}")
            return self._error(str(e))

    def homeVideoContent(self):
        try:
            if self.err:
                return self._error(self.err)
            r = self._fetch(f"{self.host}/", timeout=15)
            if not r:
                return self._error("首页请求失败")
            html = self.pq(r.content)
            return {'list': self._parse_list(html)}
        except Exception as e:
            self._log(f"homeVideoErr:{e}")
            return self._error(str(e))

    def categoryContent(self, tid, pg, filter, extend):
        try:
            pg = int(pg) if pg else 1
            url = f"{self.host}/{tid}"
            if pg > 1:
                url += f"?page={pg}"
            self._log(f"cat req: {url}")
            r = self._fetch(url, timeout=15)
            if not r:
                return {'list': [], 'page': pg, 'pagecount': 1, 'limit': 90, 'total': 0}
            html = self.pq(r.content)
            return {
                'list': self._parse_list(html),
                'page': pg,
                'pagecount': 9999,
                'limit': 90,
                'total': 999999
            }
        except Exception as e:
            self._log(f"catErr:{e}")
            return {'list': [], 'page': 1, 'pagecount': 1, 'limit': 90, 'total': 0}

    def detailContent(self, ids):
        vid = ids[0]
        url = f"{self.host}/{vid}"
        
        title = self._guess_title_from_vid(vid)
        content = ""
        pic = ""
        play = ""
        rec = []
        
        try:
            r = self._fetch(url, timeout=20, retries=3)
            if r:
                text = r.text
                html = self.pq(r.content)
                
                # ========== 标题提取 ==========
                h1 = html('h1').text().strip()
                og_title = html('meta[property="og:title"]').attr('content') or ''
                page_title = html('title').text().strip()
                h2 = html('h2').eq(0).text().strip()
                article_title = html('article h1, .video-title, .title, [class*="title"]').eq(0).text().strip()
                
                if h1:
                    title = h1
                elif article_title:
                    title = article_title
                elif og_title:
                    title = og_title
                elif page_title:
                    title = page_title.split('-')[0].strip()
                elif h2:
                    title = h2
                
                title = re.sub(r'\s*[-|]\s*XX01\.?COM.*$', '', title, flags=re.IGNORECASE).strip()
                title = re.sub(r'\s*[-|]\s*免費高清.*$', '', title, flags=re.IGNORECASE).strip()
                title = re.sub(r'\s*[-|]\s*Watch\s+JAV.*$', '', title, flags=re.IGNORECASE).strip()
                
                # 部分内容把整段简介塞进 h1，限制标题长度避免污染播放串
                if len(title) > 200:
                    title = title[:200].rstrip() + '...'
                
                # ========== 简介提取（大量选择器） ==========
                content_selectors = [
                    ('meta[name="description"]', 'attr'),
                    ('meta[property="og:description"]', 'attr'),
                    ('.text-nord4', 'text'),
                    ('.video-description', 'text'),
                    ('.description', 'text'),
                    ('.desc', 'text'),
                    ('.summary', 'text'),
                    ('.content', 'text'),
                    ('.details', 'text'),
                    ('.info', 'text'),
                    ('.nord-text', 'text'),
                    ('[class*="description"]', 'text'),
                    ('[class*="desc"]', 'text'),
                    ('[class*="summary"]', 'text'),
                    ('.video-info', 'text'),
                    ('.video-detail', 'text'),
                    ('.detail-content', 'text'),
                    ('article p', 'text'),
                    ('.post-content p', 'text'),
                    ('.excerpt', 'text'),
                    ('.synopsis', 'text'),
                    ('.plot', 'text'),
                    ('.story', 'text'),
                    ('.intro', 'text'),
                    ('.overview', 'text'),
                ]
                for sel, method in content_selectors:
                    try:
                        elem = html(sel)
                        if elem and len(elem) > 0:
                            if method == 'attr':
                                val = elem.attr('content') or ''
                            else:
                                val = elem.eq(0).text().strip()
                            if val and len(val) > 10:
                                if '免費高清日本 AV' in val and len(val) < 100:
                                    continue
                                if 'XX01' in val and len(val) < 50:
                                    continue
                                content = val
                                break
                    except:
                        continue
                
                # 兜底：找最长p标签
                if not content:
                    longest_p = ""
                    for p in html('p').items():
                        pt = p.text().strip()
                        if len(pt) > len(longest_p) and len(pt) > 20:
                            longest_p = pt
                    if longest_p:
                        content = longest_p
                
                # ========== 封面 ==========
                pic = html('meta[property="og:image"]').attr('content') or ''
                if not pic:
                    pic = html('meta[name="twitter:image"]').attr('content') or ''
                if not pic:
                    pic = html('.video-poster img, .thumbnail img, .cover img, article img').eq(0).attr('src') or ''
                if not pic:
                    pic = html('.poster img, .thumb img, .video-thumb img').eq(0).attr('data-src') or ''
                
                # ========== 视频链接深度提取 ==========
                all_candidates = []
                
                # 1. 全页面文本
                all_candidates += self._extract_video_urls(text, "main")
                
                # 2. 所有script深度扫描
                all_candidates += self._extract_from_scripts(html, "main")
                
                # 3. data-* 属性
                for elem in html('[data-url], [data-video], [data-src], [data-file], [data-play]').items():
                    for attr in ['data-url', 'data-video', 'data-src', 'data-file', 'data-play']:
                        val = elem.attr(attr)
                        if val and 'http' in val:
                            all_candidates.append(val)
                
                # 4. video/source 标签
                for elem in html('video source, video, audio source, audio').items():
                    src = elem.attr('src') or elem.attr('data-src') or ''
                    if src and 'http' in src:
                        all_candidates.append(src)
                
                # 5. iframe 递归
                iframe_list = []
                for iframe in html('iframe').items():
                    src = iframe.attr('src')
                    if not src:
                        continue
                    if src.startswith('/'):
                        src = self.host + src
                    elif src.startswith('//'):
                        src = 'https:' + src
                    if any(bad in src for bad in ['ad', 'tubiao', 'google', 'googletag', 'facebook', 'twitter', 'disqus']):
                        continue
                    iframe_list.append(src)
                
                for iframe_url in iframe_list:
                    try:
                        ir = self._fetch(iframe_url, timeout=10, retries=2)
                        if ir:
                            all_candidates += self._extract_video_urls(ir.text, "iframe")
                            all_candidates += self._extract_from_scripts(self.pq(ir.content), "iframe")
                    except Exception as e:
                        self._log(f"iframe err: {e}")
                
                # 6. 从页面中所有 a 标签 href 里找视频直链
                for a in html('a[href*=".m3u8"], a[href*=".mp4"], a[href*="surrit"], a[href*="fourhoi"]').items():
                    href = a.attr('href')
                    if href and href.startswith('http'):
                        all_candidates.append(href)
                
                # 7. 从 onclick 等事件属性中提取
                for elem in html('[onclick*="http"], [onclick*=".m3u8"], [data-link*="http"]').items():
                    onclick = elem.attr('onclick') or ''
                    data_link = elem.attr('data-link') or ''
                    all_candidates += self._extract_video_urls(onclick + ' ' + data_link, "event")
                
                play = self._pick_best_video(all_candidates)
                
                # ========== 相关推荐 ==========
                seen_rec = set()
                for item in html('.thumbnail.group').items():
                    a = item.find('a').eq(0)
                    h = a.attr('href')
                    if not h:
                        continue
                    h = h.strip('/')
                    if not h or h == vid or h in seen_rec or h.startswith('http'):
                        continue
                    seen_rec.add(h)
                    n = item.find('.truncate a, .text-secondary').eq(0).text()
                    if not n:
                        n = a.attr('alt') or h
                    rec.append(f"{n.strip()}${h}")
            else:
                self._log("详情页请求全部失败，走纯兜底")
        
        except Exception as e:
            self._log(f"detail exception: {e}")
        
        # ========== 兜底逻辑（按分类精确匹配） ==========
        if not play:
            if self._is_special_category(vid):
                play = f"嗅探${url}"
                self._log("特殊分类嗅探兜底")
            elif self._is_timestudio(vid):
                # timestudio 用原站嗅探
                play = f"嗅探${url}"
                self._log("timestudio嗅探兜底")
            elif self._is_kinostream(vid):
                # kinostream 用原站嗅探
                play = f"嗅探${url}"
                self._log("kinostream嗅探兜底")
            else:
                # JAV/国产/欧美：多CDN尝试
                # fourhoi 直链
                fourhoi_url = f"https://fourhoi.com/{vid}/playlist.m3u8"
                # 代理 fourhoi
                proxy_url = f"https://ig2.pppppppp.top/api/proxy/?url={urllib.parse.quote(fourhoi_url, safe='')}"
                # 也尝试不带代理的 surrit 构造（如果vid像UUID）
                if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', vid, re.I):
                    play = f"https://surrit.com/{vid}/playlist.m3u8"
                    self._log(f"surrit UUID兜底: {play}")
                else:
                    play = proxy_url
                    self._log(f"fourhoi代理兜底: {play}")
        
        # ========== 格式化最终play ==========
        if play.startswith('http') and not play.startswith('嗅探$'):
            is_direct = bool(re.search(r'\.(m3u8|mp4|flv|ts)(\?|$)', play, re.IGNORECASE))
            is_reliable = any(domain in play for domain in ['surrit.com', 'fourhoi.com', 'stream.defeated.xxx', 'cdn.transexjapan.com', 'player.xxnet999.com', 'flicksbank', 'console360.net'])
            if not is_direct and not is_reliable:
                play = f"嗅探${play}"
        
        self._log(f"最终play: {play[:120]}")
        
        froms = ['XX01']
        urls = [f"{title}${play}"]
        if rec:
            froms.append('推荐')
            urls.append('#'.join(rec[:20]))
        
        vod = {
            'vod_id': vid,
            'vod_name': title,
            'vod_pic': pic,
            'vod_actor': '',
            'vod_director': '',
            'vod_content': content,
            'vod_play_from': '$$$'.join(froms),
            'vod_play_url': '$$$'.join(urls)
        }
        return {'list': [vod]}

    def searchContent(self, key, quick, pg="1"):
        try:
            pg = int(pg) if pg else 1
            url = f"{self.host}/search/{key}"
            if pg > 1:
                url += f"?page={pg}"
            self._log(f"search req: {url}")
            r = self._fetch(url, timeout=15)
            if not r:
                return {'list': [], 'page': 1}
            html = self.pq(r.content)
            return {
                'list': self._parse_list(html),
                'page': pg
            }
        except Exception as e:
            self._log(f"searchErr:{e}")
            return {'list': [], 'page': 1}

    def playerContent(self, flag, id, vipFlags):
        try:
            if id.startswith('嗅探$'):
                return {'parse': 1, 'url': id[3:], 'header': self.headers, 'jx': 0}
            
            if re.search(r'\.(m3u8|mp4|flv|ts)(\?|$)', id, re.IGNORECASE):
                return {'parse': 0, 'url': id, 'header': self.headers, 'jx': 0}
            
            if re.search(r'(surrit\.com|fourhoi\.com|stream\.defeated\.xxx|cdn\.transexjapan\.com)', id, re.IGNORECASE):
                return {'parse': 0, 'url': id, 'header': self.headers, 'jx': 0}
            
            if re.search(r'(vvvvvvvv\.top|/api/play\?url=|/api/proxy/\?url=)', id, re.IGNORECASE):
                return {'parse': 1, 'url': id, 'header': self.headers, 'jx': 0}
            
            if id.startswith('http'):
                return {'parse': 1, 'url': id, 'header': self.headers, 'jx': 0}
            
            return {'parse': 1, 'url': id, 'header': self.headers, 'jx': 0}
        except Exception as e:
            self._log(f"playErr:{e}")
            return {'parse': 1, 'url': id, 'header': self.headers, 'jx': 0}

    def _parse_list(self, html):
        ret = []
        seen = set()
        try:
            selectors = [
                '.grid .thumbnail.group',
                '#list1 .thumbnail.group',
                '.thumbnail.group',
                '.item-wrapper .thumbnail.group',
                '.grid.grid-cols-2 .thumbnail.group',
                '.video-list .thumbnail.group',
                '[class*="grid"] .thumbnail.group',
            ]
            items = None
            for sel in selectors:
                items = html(sel)
                if items is not None and len(items) > 0:
                    self._log(f"list selector: {sel}, count: {len(items)}")
                    break
            
            if items is None or len(items) == 0:
                self._log("no list items found")
                return ret
            
            for item in items.items():
                try:
                    a = item.find('a').eq(0)
                    href = a.attr('href')
                    if not href:
                        continue
                    
                    vid = href.strip('/')
                    if not vid or vid in seen or vid.startswith('http') or vid.startswith('#') or vid.startswith('javascript'):
                        continue
                    seen.add(vid)
                    
                    name = ''
                    name_selectors = [
                        '.truncate a',
                        '.text-secondary',
                        '.video-title',
                        '.title',
                        'h3',
                        'h2',
                        'img'
                    ]
                    for nsel in name_selectors:
                        ne = item.find(nsel).eq(0)
                        if ne:
                            if nsel == 'img':
                                name = ne.attr('alt') or ne.attr('title') or ''
                            else:
                                name = ne.text().strip()
                            if name:
                                break
                    
                    if not name:
                        name = a.attr('title') or vid
                    
                    pic = ''
                    img = item.find('img').eq(0)
                    if img:
                        pic = img.attr('data-src') or img.attr('data-original') or img.attr('src') or ''
                    
                    remarks = ''
                    remark_selectors = [
                        '.badge',
                        '.tag',
                        '.duration',
                        '.label',
                        '.quality',
                        '[class*="badge"]',
                        '[class*="tag"]',
                        '[class*="duration"]'
                    ]
                    for rsel in remark_selectors:
                        re = item.find(rsel).eq(0)
                        if re:
                            remarks = re.text().strip()
                            if remarks:
                                break
                    
                    ret.append({
                        'vod_id': vid,
                        'vod_name': name,
                        'vod_pic': pic,
                        'vod_remarks': remarks
                    })
                except Exception as e:
                    self._log(f"parse item err: {e}")
                    continue
                    
        except Exception as e:
            self._log(f"parse_list err: {e}")
        return ret

    def _error(self, msg):
        return {'class': [], 'list': [], 'msg': msg}
