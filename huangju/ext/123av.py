# -*- coding: utf-8 -*-
import json
import sys
import re
import html as html_parser
from urllib.parse import quote, urlsplit, parse_qs

sys.path.append('..')
from base.spider import Spider


class Spider(Spider):
    def init(self, extend=""):
        self.host = "https://123av.com"
        # 站点无 Cloudflare 质询，普通请求即可
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8',
            'Referer': f'{self.host}/',
        }

    def getName(self):
        return "123AV"

    # ---------------- 工具方法 ----------------

    def _fetch(self, path):
        """请求站内路径，返回文本；失败返回空串"""
        url = path if path.startswith('http') else f"{self.host}{path}"
        try:
            resp = self.fetch(url, headers=self.headers)
            return resp.text if resp is not None else ''
        except:
            return ''

    def _title_of(self, text):
        return html_parser.unescape(re.sub(r'<[^>]+>', '', text)).strip()

    def _cr_link(self, tid, name):
        return f'[a=cr:{{"id":"{tid}","name":"{name}"}}/]{name}[/a]'

    def _parse_pagecount(self, html):
        pages = [int(p) for p in re.findall(r'(?:[?&]|&amp;)page=(\d+)', html)]
        return max(pages) if pages else 1

    # ---------------- 列表解析 ----------------

    def parse_vod_list(self, html):
        """解析服务端渲染的视频卡片（/cn/recent、/cn/new、/cn/hot、分类、搜索通用）"""
        vods = []
        seen = set()
        for block in re.split(r'<div[^>]*class="[^"]*\bcard\b[^"]*"', html):
            m = re.search(r'href="(/cn/v/[^"]+)"', block)
            if not m:
                continue
            vid = self.host + m.group(1)
            if vid in seen:
                continue
            seen.add(vid)

            pic = ''
            pm = re.search(r'class="card__img"[^>]*src="([^"]+)"', block)
            if pm:
                pic = html_parser.unescape(pm.group(1))

            title = ''
            tm = re.search(r'class="card__title"[^>]*>\s*<a[^>]*>(.*?)</a>', block, re.S)
            if tm:
                title = self._title_of(tm.group(1))
            if not title:
                title = vid.rstrip('/').split('/')[-1]

            remarks = ''
            vm = re.search(r'class="card__views"[^>]*>.*?</svg>(.*?)</span>', block, re.S)
            if vm:
                remarks = self._title_of(vm.group(1))

            vods.append({
                'vod_id': vid,
                'vod_name': title,
                'vod_pic': pic,
                'vod_remarks': remarks
            })
        return vods

    def parse_genres(self, html):
        """解析 /cn/genres 索引页，返回类别文件夹列表"""
        items = []
        seen = set()
        for m in re.finditer(r'<a[^>]*href="(/cn/genres/[^"]+)"[^>]*>(.*?)</a>', html, re.S):
            tid = m.group(1)[1:].rstrip('/')          # cn/genres/xxx
            if tid in seen or tid == 'cn/genres':
                continue
            name = self._title_of(m.group(2))
            if not name:
                continue
            seen.add(tid)
            items.append({
                'vod_id': tid,
                'vod_name': name,
                'vod_pic': '',
                'vod_remarks': '类别',
                'vod_tag': 'folder'
            })
        return items

    # ---------------- 播放地址解析 ----------------

    def _parse_player(self, html):
        """从详情页 x-data 的 player(JSON.parse('...')) 中提取剧集列表
        返回 (play_parts, poster)：play_parts 形如 ['1$https://...']"""
        raw = ''
        m = re.search(r"player\(JSON\.parse\('(.+?)'\)", html, re.S)
        if m:
            raw = m.group(1)
            raw = raw.replace('\\u0022', '"')
            raw = re.sub(r'\\+/', '/', raw)   # 还原被转义的路径斜杠
            try:
                eps = json.loads(raw)
            except:
                eps = []
        else:
            eps = []

        parts = []
        poster = ''
        for ep in eps if isinstance(eps, list) else []:
            url = ep.get('url') or ''
            if not url:
                continue
            # embed 链接的 poster 参数即高清封面
            try:
                q = parse_qs(urlsplit(url).query)
                if not poster and q.get('poster'):
                    poster = q['poster'][0]
            except:
                pass
            name = str(ep.get('name') or ep.get('number') or len(parts) + 1)
            parts.append(f"{name}${url}")
        return parts, poster

    def _parse_info(self, html):
        """解析详情页 watch__info-row 元信息表
        返回 {key: {'text': 纯文本, 'links': [(tid, name), ...]}}"""
        info = {}
        for m in re.finditer(r'<dt>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>', html, re.S):
            key = self._title_of(m.group(1))
            body = m.group(2)
            links = []
            for am in re.finditer(r'<a[^>]*href="(/cn/(?:actresses|genres|makers|series|tags)/[^"]+)"[^>]*>(.*?)</a>', body, re.S):
                tid = am.group(1)[1:].rstrip('/')
                name = self._title_of(am.group(2))
                if tid and name:
                    links.append((tid, name))
            info[key] = {'text': self._title_of(body), 'links': links}
        return info

    # ---------------- TVBox 接口 ----------------

    def homeContent(self, filter):
        classes = [
            {'type_name': '最近更新', 'type_id': 'recent'},
            {'type_name': '全新上市', 'type_id': 'new'},
            {'type_name': '热门影片', 'type_id': 'hot'},
            {'type_name': '今日趋势', 'type_id': 'trend_today'},
            {'type_name': '本周趋势', 'type_id': 'trend_week'},
            {'type_name': '本月趋势', 'type_id': 'trend_month'},
            {'type_name': '有码', 'type_id': 'censored'},
            {'type_name': '无码', 'type_id': 'uncensored'},
            {'type_name': '无码泄露', 'type_id': 'uncensored-leaked'},
            {'type_name': '全部影片', 'type_id': 'all'},
            {'type_name': '类别', 'type_id': 'genres'}
        ]
        sort_filter = [{"key": "sort", "name": "排序", "value": [
            {"n": "默认", "v": ""},
            {"n": "今天最热", "v": "sort=most_viewed_today"},
            {"n": "本周最热", "v": "sort=most_viewed_week"},
            {"n": "本月最热", "v": "sort=most_viewed_month"},
            {"n": "观看最多", "v": "sort=most_viewed"},
            {"n": "最多收藏", "v": "sort=most_favourited"}
        ]}]
        filters = {}
        for item in classes:
            if item['type_id'] not in ('genres',):
                filters[item['type_id']] = sort_filter
        # 首页推荐列表：取最近更新页（首页卡片为前端渲染，无法直接抓取）
        content = self._fetch('/cn/recent')
        return {'class': classes, 'filters': filters,
                'list': self.parse_vod_list(content) if content else []}

    def categoryContent(self, tid, pg, filter, extend):
        page = int(pg) if pg else 1
        try:
            # 类别：文件夹列表
            if tid == 'genres':
                content = self._fetch('/cn/genres')
                if not content:
                    return {'list': []}
                return {'list': self.parse_genres(content),
                        'page': page, 'pagecount': 1}

            # 组装 URL
            if tid in ('trend_today', 'trend_week', 'trend_month'):
                path = f"/cn/all?sort={tid.split('_')[1]}"
            elif '/' in tid:
                path = f"/{tid}"
            else:
                path = f"/cn/{tid}"

            sep = '&' if '?' in path else '?'
            if page > 1:
                path += f"{sep}page={page}"

            sort_v = (extend or {}).get('sort', '')
            if sort_v:
                path += ('&' if '?' in path else '?') + sort_v

            content = self._fetch(path)
            if not content:
                return {'list': []}
            vods = self.parse_vod_list(content)
            return {'list': vods, 'page': page,
                    'pagecount': max(self._parse_pagecount(content), page)}
        except:
            return {'list': [], 'page': page, 'pagecount': 1}

    def detailContent(self, ids):
        vid = ids[0]
        url = vid if str(vid).startswith('http') else f"{self.host}/cn/v/{vid}"
        try:
            html = self._fetch(url)
            if not html:
                return {'list': []}

            # 标题
            title = ''
            hm = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)
            if hm:
                title = self._title_of(hm.group(1))
            title = re.sub(r'\s*[-—|]\s*123AV\s*$', '', title, flags=re.I).strip()
            # 番号与描述拆分展示
            code = ''
            cm = re.split(r'\s+[-—]\s+', title, 1)
            if len(cm) == 2:
                code, desc = cm[0].strip(), cm[1].strip()
            else:
                desc = title

            # 播放剧集与封面
            parts, poster = self._parse_player(html)
            if not poster:
                pm = re.search(r'property="og:image" content="([^"]+)"', html)
                if pm and 'logo' not in pm.group(1):
                    poster = pm.group(1)

            # 元信息
            info = self._parse_info(html)
            year = info.get('发布日期', {}).get('text', '')
            actors = [self._cr_link(t, n)
                      for t, n in info.get('演员', {}).get('links', [])]
            makers = [self._cr_link(t, n)
                      for t, n in info.get('制作商', {}).get('links', [])]
            series = [self._cr_link(t, n)
                      for t, n in info.get('系列', {}).get('links', [])]
            cats = [self._cr_link(t, n)
                    for t, n in info.get('类别', {}).get('links', [])]
            tags = [self._cr_link(t, n)
                    for t, n in info.get('标签', {}).get('links', [])]

            return {'list': [{
                'vod_id': vid,
                'vod_name': code or title,
                'vod_pic': poster,
                'vod_year': year,
                'vod_content': desc or title,
                'vod_actor': ' '.join(actors),
                'vod_director': ' '.join(makers + series),
                'vod_remarks': ' '.join(cats + tags),
                'vod_play_from': '123AV',
                'vod_play_url': '#'.join(parts)
            }]}
        except:
            return {'list': []}

    def searchContent(self, key, quick, pg="1", extend=None):
        page = int(pg) if pg else 1
        try:
            path = f"/cn/search?keyword={quote(key)}"
            if page > 1:
                path += f"&page={page}"
            content = self._fetch(path)
            if not content:
                return {'list': []}
            return {'list': self.parse_vod_list(content), 'page': page,
                    'pagecount': max(self._parse_pagecount(content), page)}
        except:
            return {'list': []}

    def playerContent(self, flag, id, vipFlags):
        # 播放源为 javplayer 等 embed 页，交给播放器嗅探真实 m3u8
        headers = {
            'User-Agent': self.headers['User-Agent'],
            'Referer': f'{self.host}/'
        }
        return {'parse': 1, 'url': id, 'header': headers}
