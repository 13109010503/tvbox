# -*- coding: utf-8 -*-
import sys
import re
import json
import base64
import html as htmlmod
from urllib.parse import quote, unquote, urljoin

try:
    import requests
except ImportError:
    requests = None

try:
    from lxml import etree
except ImportError:
    etree = None

try:
    from base.spider import Spider as BaseSpider
except ImportError:
    class BaseSpider:
        def init(self, extend=""): pass
        def homeContent(self, filter): return {}
        def homeVideoContent(self): return {}
        def categoryContent(self, tid, pg, filter, extend): return {}
        def detailContent(self, ids): return {}
        def playerContent(self, flag, id, vipFlags): return {}
        def searchContent(self, key, quick, pg="1"): return {}
        def isVideoFormat(self, url): return False
        def manualVideoCheck(self): return False
        def localProxy(self, param): return [200, "text/plain", b""]
        def destroy(self): pass
        def getName(self): return "Base"

class Spider(BaseSpider):
    def __init__(self):
        self.host = "https://sjsfcd6h.shaofu36.xyz"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": self.host + "/"
        }
        self.session = None
        if requests:
            self.session = requests.Session()
            self.session.headers.update(self.headers)
        self.seen = set()

    def init(self, extend=""):
        if extend and extend.startswith("http"):
            self.host = extend.rstrip("/")
            self.headers["Referer"] = self.host + "/"
            if self.session:
                self.session.headers.update(self.headers)

    def getName(self):
        return "shaofu36"

    def destroy(self):
        if self.session:
            self.session.close()

    def isVideoFormat(self, url):
        return ".m3u8" in url or ".mp4" in url or ".flv" in url or ".ts" in url

    def manualVideoCheck(self):
        return False

    def localProxy(self, param):
        return [200, "video/MP2T", b"", {}]

    def _req(self, url):
        if not self.session:
            return ""
        try:
            r = self.session.get(url, headers=self.headers, timeout=15, verify=False)
            r.encoding = "utf-8"
            return r.text
        except Exception:
            return ""

    def _fix(self, url):
        if not url:
            return ""
        if url.startswith("//"):
            return "https:" + url
        if url.startswith("/"):
            return urljoin(self.host, url)
        if url.startswith("http"):
            return url
        return urljoin(self.host, "/" + url)

    def _clean(self, text):
        if not text:
            return ""
        return htmlmod.unescape(re.sub(r"<[^>]+>", "", str(text))).strip()

    def _extract_title(self, html_text):
        """多层兜底提取标题"""
        title = ""
        # 1. 从<title>标签提取 (最可靠)
        m = re.search(r'<title>([^<]+)</title>', html_text, re.I)
        if m:
            title = m.group(1).strip()
            # 去掉后缀
            title = re.sub(r'详情介绍.*$', '', title)
            title = re.sub(r'在线观看.*$', '', title)
            title = re.sub(r'迅雷下载.*$', '', title)
            title = title.strip("- ")
        if title:
            return self._clean(title)
        # 2. h1标签
        m = re.search(r'<h1[^>]*>(.*?)</h1>', html_text, re.S | re.I)
        if m:
            title = self._clean(m.group(1))
        if title:
            return title
        # 3. h2标签
        m = re.search(r'<h2[^>]*>(.*?)</h2>', html_text, re.S | re.I)
        if m:
            title = self._clean(m.group(1))
        if title:
            return title
        # 4. 包含title的div
        m = re.search(r'<div[^>]*class=["\'][^"\']*title[^"\']*["\'][^>]*>(.*?)</div>', html_text, re.S | re.I)
        if m:
            title = self._clean(m.group(1))
        if title:
            return title
        # 5. strong.title
        m = re.search(r'<strong[^>]*class=["\']title["\'][^>]*>(.*?)</strong>', html_text, re.S | re.I)
        if m:
            title = self._clean(m.group(1))
        if title:
            return title
        return ""

    def _extract_pic(self, html_text):
        """提取封面图"""
        # data-src
        m = re.search(r'<img[^>]+data-src=["\']([^"\']+)["\'][^>]*>', html_text, re.I)
        if m:
            return self._fix(m.group(1))
        # data-original
        m = re.search(r'<img[^>]+data-original=["\']([^"\']+)["\'][^>]*>', html_text, re.I)
        if m:
            return self._fix(m.group(1))
        # src
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\'][^>]*class=["\'][^"\']*(?:poster|cover|thumb)[^"\']*["\']', html_text, re.I)
        if m:
            return self._fix(m.group(1))
        m = re.search(r'<img[^>]+class=["\'][^"\']*(?:poster|cover|thumb)[^"\']*["\'][^>]+src=["\']([^"\']+)["\']', html_text, re.I)
        if m:
            return self._fix(m.group(1))
        return ""

    def _extract_content(self, html_text):
        """提取简介"""
        # 先尝试找description meta
        m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']', html_text, re.I)
        if m:
            return self._clean(m.group(1))
        m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']', html_text, re.I)
        if m:
            return self._clean(m.group(1))
        # 找内容区域
        m = re.search(r'<div[^>]*class=["\'][^"\']*(?:content|desc|summary|intro|vod-content)[^"\']*["\'][^>]*>(.*?)</div>', html_text, re.S | re.I)
        if m:
            return self._clean(m.group(1))
        return ""

    def _extract_playlist(self, html_text):
        """提取播放列表，返回 [(source_name, [episodes...]), ...]"""
        sources = []
        play_urls = []

        # 使用lxml解析DOM结构
        if etree:
            doc = etree.HTML(html_text)
            if doc is not None:
                # 查找所有播放面板
                panels = doc.xpath('//div[contains(@class,"play") or contains(@class,"playlist") or contains(@class,"source") or contains(@class,"panel")]')
                for panel in panels:
                    try:
                        # 源名称
                        sname_list = panel.xpath('.//h3/text() | .//span[contains(@class,"name") or contains(@class,"title") or contains(@class,"tab")]/text() | .//div[contains(@class,"from")]/text()')
                        sname = self._clean(sname_list[0]) if sname_list else "默认线路"
                        # 剧集
                        eps = panel.xpath('.//a[contains(@href,"/vodplay/") or contains(@href,"/play/")]')
                        if not eps:
                            eps = panel.xpath('.//a[contains(@href,"vodplay")]')
                        ep_list = []
                        for ep in eps:
                            try:
                                ep_title_list = ep.xpath('./text()')
                                ep_title = self._clean(ep_title_list[0]) if ep_title_list else "播放"
                                ep_href_list = ep.xpath('./@href')
                                ep_href = ep_href_list[0] if ep_href_list else ""
                                if ep_href:
                                    ep_list.append(ep_title + "$" + self._fix(ep_href))
                            except Exception:
                                continue
                        if ep_list:
                            sources.append(sname)
                            play_urls.append("#".join(ep_list))
                    except Exception:
                        continue

        # 如果lxml没提取到，用正则兜底
        if not sources:
            # 查找所有包含vodplay的链接
            eps = re.findall(r'<a[^>]+href=["\'](/vodplay/[^"\']+)["\'][^>]*>(.*?)</a>', html_text, re.S | re.I)
            if eps:
                ep_list = []
                for href, title in eps:
                    title = self._clean(title)
                    if not title:
                        title = "播放"
                    ep_list.append(title + "$" + self._fix(href))
                if ep_list:
                    sources = ["默认线路"]
                    play_urls = ["#".join(ep_list)]

        return sources, play_urls

    def _play(self, html_text):
        """从播放页HTML提取真实视频链接"""
        # 1. player_data
        m = re.search(r'var\s+player_data\s*=\s*(\{.*?\});', html_text, re.DOTALL)
        if not m:
            m = re.search(r'player_data\s*=\s*(\{.*?\});', html_text, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(1))
                url = data.get("url", "")
                encrypt = data.get("encrypt", "0")
                if encrypt == "1" or encrypt == 1:
                    url = unquote(url)
                elif encrypt == "2" or encrypt == 2:
                    url = unquote(base64.b64decode(url).decode("utf-8"))
                return url
            except Exception:
                pass
        # 2. 直接匹配
        m = re.search(r'(https?://[^\s"\']+\.m3u8[^\s"\']*)', html_text)
        if m:
            return m.group(1)
        m = re.search(r'(https?://[^\s"\']+\.mp4[^\s"\']*)', html_text)
        if m:
            return m.group(1)
        m = re.search(r'var\s*now\s*=\s*["\']([^"\']+)["\']', html_text)
        if m:
            return m.group(1)
        # 3. iframe
        m = re.search(r'<iframe[^>]+src=["\']([^"\']+)["\']', html_text)
        if m:
            try:
                u = self._fix(m.group(1))
                h = self._req(u)
                if h:
                    return self._play(h)
            except Exception:
                pass
        return ""

    def homeContent(self, filter):
        classes = [
            {"type_name": "国产精品", "type_id": "55"},
            {"type_name": "华语精品", "type_id": "63"},
            {"type_name": "黑料吃瓜", "type_id": "58"},
            {"type_name": "欧美", "type_id": "60"},
            {"type_name": "动漫", "type_id": "57"},
            {"type_name": "学生合集", "type_id": "65"},
            {"type_name": "乱伦精品", "type_id": "64"},
            {"type_name": "探花约炮", "type_id": "61"},
            {"type_name": "日本有码", "type_id": "80"},
            {"type_name": "主播网红", "type_id": "81"},
            {"type_name": "国产视频", "type_id": "12"},
            {"type_name": "中文字幕", "type_id": "20"},
            {"type_name": "国产传媒", "type_id": "21"},
            {"type_name": "日本无码", "type_id": "23"},
            {"type_name": "欧美无码", "type_id": "24"},
            {"type_name": "强奸乱伦", "type_id": "69"},
            {"type_name": "制服诱惑", "type_id": "70"},
            {"type_name": "国产主播", "type_id": "71"},
            {"type_name": "激情动漫", "type_id": "72"},
            {"type_name": "明星换脸", "type_id": "25"},
            {"type_name": "抖阴视频", "type_id": "26"},
            {"type_name": "女优明星", "type_id": "88"},
            {"type_name": "网曝黑料", "type_id": "56"},
            {"type_name": "伦理三级", "type_id": "73"},
            {"type_name": "字幕解说", "type_id": "74"},
            {"type_name": "捆绑调教", "type_id": "75"},
            {"type_name": "萝莉少女", "type_id": "76"},
            {"type_name": "极品媚黑", "type_id": "77"},
            {"type_name": "女同性恋", "type_id": "78"},
            {"type_name": "网红头条", "type_id": "84"},
            {"type_name": "人妖系列", "type_id": "85"}
        ]
        return {"class": classes, "filters": {}}

    def homeVideoContent(self):
        return self.categoryContent("63", "1", False, {})

    def categoryContent(self, tid, pg, filter, extend):
        result = {"list": [], "page": int(pg), "pagecount": 1, "limit": 24, "total": 0}
        if int(pg) == 1:
            url = self.host + "/vodtype/" + tid + ".html"
        else:
            url = self.host + "/vodtype/" + tid + "-" + str(pg) + ".html"
        html_text = self._req(url)
        if not html_text:
            return result
        doc = etree.HTML(html_text) if etree else None
        if not doc:
            return result
        items = doc.xpath('//div[@class="item"]')
        if not items:
            items = doc.xpath('//div[contains(@class,"list-videos")]//div[@class="item"]')
        if not items:
            items = doc.xpath('//a[contains(@class,"popup-video-link")]')
        self.seen.clear()
        for item in items:
            try:
                if item.tag == "a":
                    a = item
                else:
                    alist = item.xpath('.//a[contains(@class,"popup-video-link")]')
                    if not alist:
                        continue
                    a = alist[0]
                tlist = a.xpath('.//strong[@class="title"]/text()')
                if not tlist:
                    tlist = a.xpath('./@title')
                if not tlist:
                    tlist = a.xpath('.//img/@alt')
                title = self._clean(tlist[0]) if tlist else ""
                hlist = a.xpath('./@href')
                href = hlist[0] if hlist else ""
                m = re.search(r'/voddetail/([0-9]+)\.html', href)
                vid = m.group(1) if m else href
                if vid in self.seen:
                    continue
                self.seen.add(vid)
                plist = a.xpath('.//img[@class="thumb lazy"]/@data-src')
                if not plist:
                    plist = a.xpath('.//img/@data-src')
                if not plist:
                    plist = a.xpath('.//img/@src')
                pic = self._fix(plist[0]) if plist else ""
                result["list"].append({"vod_id": vid, "vod_name": title, "vod_pic": pic, "vod_remarks": ""})
            except Exception:
                continue
        plinks = doc.xpath('//div[@class="pagination"]//a/@href')
        maxpg = 1
        for pl in plinks:
            m = re.search(r'/vodtype/\d+-(\d+)\.html', pl)
            if m:
                p = int(m.group(1))
                if p > maxpg:
                    maxpg = p
        if maxpg > 1:
            result["pagecount"] = maxpg
        else:
            result["pagecount"] = int(pg) + 1 if len(result["list"]) >= 24 else int(pg)
        return result

    def detailContent(self, ids):
        vid = ids[0] if isinstance(ids, list) else ids
        result = {"list": []}
        url = self.host + "/voddetail/" + str(vid) + ".html"
        html_text = self._req(url)
        if not html_text:
            return result

        # 提取标题 (多层兜底，确保不为空)
        title = self._extract_title(html_text)
        if not title:
            title = str(vid)

        # 提取图片
        pic = self._extract_pic(html_text)

        # 提取简介
        content = self._extract_content(html_text)

        # 提取播放列表
        sources, play_urls = self._extract_playlist(html_text)

        # 兜底：如果没有播放列表，构造一个
        if not play_urls:
            sources = ["默认线路"]
            # 尝试直接提取m3u8
            direct_url = self._play(html_text)
            if direct_url:
                play_urls.append("正片$" + direct_url)
            else:
                play_urls.append("播放$" + self.host + "/vodplay/" + str(vid) + "-1-1.html")

        result["list"].append({
            "vod_id": str(vid),
            "vod_name": title,
            "vod_pic": pic,
            "vod_content": content,
            "vod_play_from": "$$$".join(sources),
            "vod_play_url": "$$$".join(play_urls)
        })
        return result

    def playerContent(self, flag, id, vipFlags):
        result = {"parse": 0, "playUrl": "", "url": "", "header": ""}

        if self.isVideoFormat(id):
            result["url"] = id
            result["header"] = json.dumps({"Referer": self.host + "/", "User-Agent": self.headers["User-Agent"]})
            return result

        if "/vodplay/" in id or "/play/" in id:
            html_text = self._req(id)
            if html_text:
                purl = self._play(html_text)
                if purl:
                    result["url"] = purl
                    result["header"] = json.dumps({"Referer": self.host + "/", "User-Agent": self.headers["User-Agent"]})
                    return result
            result["parse"] = 1
            result["url"] = id
            result["header"] = json.dumps({"Referer": self.host + "/", "User-Agent": self.headers["User-Agent"]})
            return result

        if id.startswith("http"):
            html_text = self._req(id)
            if html_text:
                purl = self._play(html_text)
                if purl:
                    result["url"] = purl
                    result["header"] = json.dumps({"Referer": self.host + "/", "User-Agent": self.headers["User-Agent"]})
                    return result

        result["url"] = id
        return result

    def searchContent(self, key, quick, pg="1"):
        result = {"list": [], "page": int(pg), "pagecount": 1, "limit": 24, "total": 0}
        url = self.host + "/vodsearch/-------------.html?wd=" + quote(key) + "&page=" + str(pg)
        html_text = self._req(url)
        if not html_text:
            return result
        doc = etree.HTML(html_text) if etree else None
        if not doc:
            return result
        items = doc.xpath('//div[@class="item"]')
        if not items:
            items = doc.xpath('//div[contains(@class,"list-videos")]//div[@class="item"]')
        if not items:
            items = doc.xpath('//a[contains(@class,"popup-video-link")]')
        self.seen.clear()
        for item in items:
            try:
                if item.tag == "a":
                    a = item
                else:
                    alist = item.xpath('.//a[contains(@class,"popup-video-link")]')
                    if not alist:
                        continue
                    a = alist[0]
                tlist = a.xpath('.//strong[@class="title"]/text()')
                if not tlist:
                    tlist = a.xpath('./@title')
                if not tlist:
                    tlist = a.xpath('.//img/@alt')
                title = self._clean(tlist[0]) if tlist else ""
                hlist = a.xpath('./@href')
                href = hlist[0] if hlist else ""
                m = re.search(r'/voddetail/([0-9]+)\.html', href)
                vid = m.group(1) if m else href
                if vid in self.seen:
                    continue
                self.seen.add(vid)
                plist = a.xpath('.//img[@class="thumb lazy"]/@data-src')
                if not plist:
                    plist = a.xpath('.//img/@data-src')
                if not plist:
                    plist = a.xpath('.//img/@src')
                pic = self._fix(plist[0]) if plist else ""
                result["list"].append({"vod_id": vid, "vod_name": title, "vod_pic": pic, "vod_remarks": ""})
            except Exception:
                continue
        return result
