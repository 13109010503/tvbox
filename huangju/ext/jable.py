# -*- coding: utf-8 -*-
import json
import sys
import re
import html as html_parser
from urllib.parse import quote

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.append('..')
from base.spider import Spider


class Spider(Spider):
    def init(self, extend=""):
        self.host = "https://jable.tv"
        # jable 列表页每页 24 条，分页参数为偏移量 from
        self.page_size = 24

        # 桌面端完整浏览器指纹，尽量降低 Cloudflare 拦截概率
        self.ua = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        self.headers = {
            'User-Agent': self.ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': f'{self.host}/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        }
        # 移动端备用指纹：桌面端被拦时换装重试
        self.mobile_ua = ('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')

        # Session 跨请求保持 Cookie（参考 91porn.py 做法）
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update(self.headers)

        # extend 可选配置（JSON）：
        # {"cf_clearance":"浏览器复制的值","ua":"与该Cookie配套的UA","host":"https://镜像域名"}
        # cf_clearance 获取方法：电脑浏览器访问 jable.tv 通过人机验证后，
        # F12 -> Application -> Cookies -> jable.tv -> 复制 cf_clearance 的值
        if extend:
            try:
                cfg = json.loads(extend) if isinstance(extend, str) and extend.strip() else {}
            except:
                cfg = {}
            if isinstance(cfg, dict):
                try:
                    if cfg.get('host'):
                        self.host = str(cfg['host']).rstrip('/')
                except:
                    pass
                try:
                    if cfg.get('ua'):
                        self.ua = str(cfg['ua'])
                        self.headers['User-Agent'] = self.ua
                except:
                    pass
                try:
                    if cfg.get('cf_clearance'):
                        domain = self.host.split('//', 1)[1]
                        self.session.cookies.set(
                            'cf_clearance', str(cfg['cf_clearance']), domain=domain)
                except:
                    pass

        self.headers['Referer'] = f'{self.host}/'
        self.session.headers.update(self.headers)

        # 预热：先取一次首页，收集服务端下发的基础 Cookie
        try:
            self.session.get(f'{self.host}/', timeout=10, allow_redirects=True)
        except:
            pass

    def getName(self):
        return "Jable"

    # ---------------- 网络与工具方法 ----------------

    def _blocked(self, html):
        """命中 Cloudflare 安全验证页时返回 True"""
        if not html:
            return True
        marks = ['cf-wrapper', 'Just a moment', 'challenge-platform',
                 '安全驗證', '安全验证', 'Attention Required']
        return any(m in html for m in marks)

    def _fetch_html(self, url, depth=0):
        """请求页面；被 CF 拦截且未配置 cf_clearance 时，换移动端指纹重试一次"""
        try:
            resp = self.session.get(url, headers=self.headers,
                                    timeout=15, allow_redirects=True)
            text = resp.text if resp is not None else ''
        except:
            text = ''

        if not self._blocked(text) or depth >= 1:
            return '' if self._blocked(text) else text

        # 换移动端 UA 再试一次（仅当未绑定 cf_clearance 时才可能有效）
        if 'cf_clearance' not in self.session.cookies:
            self.headers['User-Agent'] = self.mobile_ua
            self.session.headers['User-Agent'] = self.mobile_ua
            try:
                resp = self.session.get(url, headers=self.headers,
                                        timeout=15, allow_redirects=True)
                text = resp.text if resp is not None else ''
            except:
                text = ''
            if self._blocked(text):
                # 仍然被拦，恢复桌面指纹，避免影响后续请求
                self.headers['User-Agent'] = self.ua
                self.session.headers['User-Agent'] = self.ua
        return '' if self._blocked(text) else text

    def _meta(self, content, prop):
        m = re.search(r'<meta[^>]+(?:property|name)=["\']' + prop + r'["\'][^>]+content=["\']([^"\']*)["\']', content)
        if not m:
            m = re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + prop + r'["\']', content)
        return html_parser.unescape(m.group(1)).strip() if m else ''

    def _tid_from_href(self, href):
        # https://jable.tv/categories/xxx/  ->  categories/xxx
        m = re.search(r'(?:jable\.tv|^)/?((?:categories|tags|models)/[^/?#"\']+)', href)
        return m.group(1).rstrip('/') if m else ''

    def _cr_link(self, tid, name):
        return f'[a=cr:{{"id":"{tid}","name":"{name}"}}/]{name}[/a]'

    def _parse_pagecount(self, html, cur_page):
        pages = set()
        for off in re.findall(r'[?&]from=(\d+)', html):
            try:
                pages.add(int(off) // self.page_size + 1)
            except:
                pass
        for m in re.finditer(r'class="page-link"[^>]*>\s*(\d+)\s*<', html):
            pages.add(int(m.group(1)))
        for m in re.finditer(r'[?&]page=(\d+)', html):
            pages.add(int(m.group(1)))
        return max(pages) if pages else cur_page + 1

    # ---------------- 列表解析 ----------------

    def parse_vod_list(self, html):
        """解析视频卡片列表（最新/热门/分类/标签/女优/搜索通用）"""
        vods = []
        seen = set()
        for block in re.split(r'<div[^>]*class="[^"]*video-img-box[^"]*"', html):
            m = re.search(r'href=["\'](?:https?://jable\.tv)?(/videos/[^"\']+/)["\']', block)
            if not m:
                continue
            vid_url = self.host + m.group(1)
            if vid_url in seen:
                continue
            seen.add(vid_url)

            pic = ''
            pm = re.search(r'data-src=["\']([^"\']+)["\']', block)
            if not pm:
                pm = re.search(r'<img[^>]*src=["\']([^"\']+)["\']', block)
            if pm:
                pic = html_parser.unescape(pm.group(1))

            title = ''
            tm = re.search(r'class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*>(.*?)</a>', block, re.S)
            if not tm:
                tm = re.search(r'class="[^"]*title[^"]*"[^>]*>([^<]+)<', block, re.S)
            if tm:
                title = html_parser.unescape(re.sub(r'<[^>]+>', '', tm.group(1))).strip()
            if not title:
                title = vid_url.rstrip('/').split('/')[-1]

            dur = ''
            dm = re.search(r'absolute-bottom-right[^>]*>([^<]*)<', block)
            if dm:
                dur = dm.group(1).strip()

            vods.append({
                'vod_id': vid_url,
                'vod_name': title,
                'vod_pic': pic,
                'vod_remarks': dur
            })
        return vods

    def parse_folder_list(self, html):
        """解析 /categories/ 页：主题分类卡片 + 标签云，返回文件夹项"""
        items = []
        seen = set()

        # 1. 主题分类卡片（带封面）
        for block in re.split(r'<div[^>]*class="[^"]*video-img-box[^"]*"', html):
            m = re.search(r'href=["\'](?:https?://jable\.tv)?(/categories/[^"\']+/)["\']', block)
            if not m:
                continue
            tid = m.group(1).strip('/')
            if tid in seen:
                continue
            seen.add(tid)

            name = ''
            nm = re.search(r'<h4[^>]*>(.*?)</h4>', block, re.S)
            if nm:
                name = html_parser.unescape(re.sub(r'<[^>]+>', '', nm.group(1))).strip()
            if not name:
                sm = re.search(r'absolute-center[^>]*>.*?<span[^>]*>(.*?)</span>', block, re.S)
                if sm:
                    name = html_parser.unescape(re.sub(r'<[^>]+>', '', sm.group(1))).strip()

            pic = ''
            pm = re.search(r'<img[^>]*src=["\']([^"\']+)["\']', block)
            if pm:
                pic = html_parser.unescape(pm.group(1))

            count = ''
            cm = re.search(r'absolute-center[^>]*>(?:(?!</?span).)*<span[^>]*>.*?</span>\s*<span[^>]*>(.*?)</span>', block, re.S)
            if cm:
                count = html_parser.unescape(re.sub(r'<[^>]+>', '', cm.group(1))).strip()

            items.append({
                'vod_id': tid,
                'vod_name': name or tid.split('/')[-1],
                'vod_pic': pic,
                'vod_remarks': count,
                'vod_tag': 'folder',
                'style': {'type': 'rect', 'ratio': 1}
            })

        # 2. 标签云
        for am in re.finditer(r'<a\b([^>]*?)>(.*?)</a>', html, re.S):
            attrs, inner = am.group(1), am.group(2)
            hm = re.search(r'href=["\']([^"\']+)["\']', attrs)
            if not hm:
                continue
            tid = self._tid_from_href(hm.group(1))
            if not tid.startswith('tags/') or tid in seen:
                continue
            name = html_parser.unescape(re.sub(r'<[^>]+>', '', inner)).strip()
            if not name:
                continue
            seen.add(tid)
            items.append({
                'vod_id': tid,
                'vod_name': name,
                'vod_pic': '',
                'vod_remarks': '标签',
                'vod_tag': 'folder'
            })
        return items

    # ---------------- TVBox 接口 ----------------

    def homeContent(self, filter):
        classes = [
            {'type_name': '最近更新', 'type_id': 'latest-updates'},
            {'type_name': '全新上市', 'type_id': 'new-release'},
            {'type_name': '热门影片', 'type_id': 'hot'},
            {'type_name': '中文字幕', 'type_id': 'categories/chinese-subtitle'},
            {'type_name': '主题&标签', 'type_id': 'categories'}
        ]
        hot_filters = [{"key": "sort_by", "name": "时间", "value": [
            {"n": "今日热门", "v": "sort_by=video_viewed_today"},
            {"n": "本周热门", "v": "sort_by=video_viewed_week"},
            {"n": "本月热门", "v": "sort_by=video_viewed_month"},
            {"n": "所有时间", "v": "sort_by=video_viewed"}
        ]}]
        sort_filters = [{"key": "sort_by", "name": "排序", "value": [
            {"n": "近期最佳", "v": "sort_by=post_date_and_popularity"},
            {"n": "最近更新", "v": "sort_by=post_date"},
            {"n": "最多观看", "v": "sort_by=video_viewed"},
            {"n": "最高收藏", "v": "sort_by=most_favourited"}
        ]}]
        filters = {
            'hot': hot_filters,
            'categories/chinese-subtitle': sort_filters
        }
        return {'class': classes, 'filters': filters}

    def categoryContent(self, tid, pg, filter, extend):
        page = int(pg) if pg else 1
        try:
            # 主题&标签：进入文件夹列表
            if tid == 'categories':
                content = self._fetch_html(f"{self.host}/categories/")
                if not content:
                    return {'list': []}
                return {'list': self.parse_folder_list(content), 'page': page, 'pagecount': 1}

            params = []
            if page > 1:
                params.append(f"from={(page - 1) * self.page_size}")
            sort_v = (extend or {}).get('sort_by', '')
            if sort_v:
                params.append(sort_v.lstrip('&'))

            url = f"{self.host}/{tid}/"
            if params:
                url += "?" + "&".join(params)

            content = self._fetch_html(url)
            if not content:
                return {'list': []}
            vods = self.parse_vod_list(content)
            return {'list': vods, 'page': page, 'pagecount': self._parse_pagecount(content, page)}
        except:
            return {'list': []}

    def detailContent(self, ids):
        vid = ids[0]
        url = vid if str(vid).startswith('http') else f"{self.host}/videos/{str(vid).strip('/')}/"
        try:
            content = self._fetch_html(url)
            if not content:
                return {'list': []}

            title = self._meta(content, 'og:title')
            if not title:
                tm = re.search(r'<title>(.*?)</title>', content, re.S)
                if tm:
                    title = html_parser.unescape(tm.group(1)).strip()
            title = re.sub(r'\s*[-|]\s*Jable(\.tv)?\s*$', '', title, flags=re.I).strip()

            pic = self._meta(content, 'og:image')
            if not pic:
                pm = re.search(r'<video[^>]*poster=["\']([^"\']+)["\']', content)
                if pm:
                    pic = pm.group(1)

            # 播放地址：页面内联变量 hlsUrl
            play_url = ''
            hm = re.search(r'hlsUrl\s*=\s*["\']([^"\']+)["\']', content)
            if hm:
                play_url = hm.group(1)
            if not play_url:
                for u in re.findall(r'https?://[^\s"\'<>]+?\.m3u8[^\s"\'<>]*', content):
                    if 'ad' not in u.lower():
                        play_url = u
                        break
            play_url = html_parser.unescape(play_url).replace('&amp;', '&')

            # 女优（名字在 img 的 data-original-title 上）
            actors = []
            for mm in re.finditer(r'<a\b([^>]*class="[^"]*model[^"]*"[^>]*)>(.*?)</a>', content, re.S):
                attrs, inner = mm.group(1), mm.group(2)
                href = re.search(r'href=["\']([^"\']+)["\']', attrs)
                name_m = re.search(r'data-original-title=["\']([^"\']+)["\']', inner)
                if not name_m:
                    name_m = re.search(r'title=["\']([^"\']+)["\']', inner)
                if href and name_m:
                    tid = self._tid_from_href(href.group(1))
                    name = html_parser.unescape(name_m.group(1)).strip()
                    if tid and name:
                        actors.append(self._cr_link(tid, name))

            # 分类 / 标签
            cats, tags = [], []
            for am in re.finditer(r'<a\b([^>]*?)>(.*?)</a>', content, re.S):
                attrs, inner = am.group(1), am.group(2)
                hm = re.search(r'href=["\']([^"\']+)["\']', attrs)
                if not hm:
                    continue
                href = hm.group(1)
                name = html_parser.unescape(re.sub(r'<[^>]+>', '', inner)).strip()
                if not name:
                    continue
                if '/categories/' in href:
                    tid = self._tid_from_href(href)
                    if tid and tid != 'categories':
                        cats.append(self._cr_link(tid, name))
                elif '/tags/' in href and '/models/' not in href:
                    tid = self._tid_from_href(href)
                    if tid and tid != 'tags':
                        tags.append(self._cr_link(tid, name))

            return {'list': [{
                'vod_id': vid,
                'vod_name': title,
                'vod_pic': pic,
                'vod_play_from': 'Jable',
                'vod_play_url': f"高清${play_url}" if play_url else '',
                'vod_actor': ' '.join(actors + cats),
                'vod_remarks': ' '.join(tags),
                'vod_content': title
            }]}
        except:
            return {'list': []}

    def searchContent(self, key, quick, pg="1", extend=None):
        page = int(pg) if pg else 1
        try:
            url = f"{self.host}/search/{quote(key)}/"
            if page > 1:
                url += f"?from={(page - 1) * self.page_size}"
            content = self._fetch_html(url)
            if not content:
                return {'list': []}
            vods = self.parse_vod_list(content)
            return {'list': vods, 'page': page, 'pagecount': self._parse_pagecount(content, page)}
        except:
            return {'list': []}

    def playerContent(self, flag, id, vipFlags):
        # m3u8 直链，播放时必须带原站 Referer
        headers = {
            'User-Agent': self.headers['User-Agent'],
            'Referer': f'{self.host}/'
        }
        return {'parse': 0, 'url': id, 'header': headers}
