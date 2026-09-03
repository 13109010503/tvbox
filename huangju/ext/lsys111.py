# -*- coding: utf-8 -*-
import re
import sys
from base64 import b64decode
from urllib.parse import quote
from lxml import etree

try:
    import urllib3
    urllib3.disable_warnings()
except Exception:
    pass

sys.path.append('..')
from base.spider import Spider


class Spider(Spider):
    def getName(self):
        return "恋丝影视"

    def init(self, extend=""):
        self.host = "https://www.lsys111.top"
        self.home = self.host + "/video"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": self.host + "/",
        }
        self.categories = [
            {"type_id": "萝莉", "type_name": "萝莉"},
            {"type_id": "丝袜", "type_name": "丝袜"},
            {"type_id": "推荐", "type_name": "推荐"},
            {"type_id": "无码", "type_name": "无码"},
            {"type_id": "主播", "type_name": "主播"},
            {"type_id": "自拍", "type_name": "自拍"},
            {"type_id": "网曝", "type_name": "网曝"},
            {"type_id": "偷拍", "type_name": "偷拍"},
            {"type_id": "欧美", "type_name": "欧美"},
            {"type_id": "制服", "type_name": "制服"},
            {"type_id": "传媒", "type_name": "传媒"},
            {"type_id": "素人", "type_name": "素人"},
            {"type_id": "动漫", "type_name": "动漫"},
            {"type_id": "精品", "type_name": "精品"},
            {"type_id": "番号", "type_name": "番号"},
            {"type_id": "解说", "type_name": "解说"},
            {"type_id": "韩国", "type_name": "韩国"},
            {"type_id": "女同", "type_name": "女同"},
            {"type_id": "私拍", "type_name": "私拍"},
            {"type_id": "换脸", "type_name": "换脸"},
            {"type_id": "人妻", "type_name": "人妻"},
            {"type_id": "探花", "type_name": "探花"},
            {"type_id": "美乳", "type_name": "美乳"},
            {"type_id": "sm", "type_name": "Sm"},
            {"type_id": "兄妹", "type_name": "兄妹"},
            {"type_id": "经典", "type_name": "经典"},
            {"type_id": "黑料", "type_name": "黑料"},
            {"type_id": "调教", "type_name": "调教"},
            {"type_id": "字幕", "type_name": "字幕"},
            {"type_id": "侵犯", "type_name": "侵犯"},
        ]

    def _get(self, url):
        try:
            r = self.fetch(url, headers=self.headers, timeout=15, verify=False)
            return r.text
        except Exception:
            return ""

    def _fix(self, u):
        if not u:
            return ""
        if u.startswith("//"):
            return "https:" + u
        if u.startswith("/"):
            return self.host + u
        return u

    def _pagecount(self, html):
        m = re.search(r'name="page"[^>]*max="(\d+)"', html or "")
        return int(m.group(1)) if m else 1

    def _data_list(self, html):
        if not html:
            return []
        tree = etree.HTML(html)
        out, seen = [], set()
        for d in tree.xpath('//div[contains(@class,"data")]'):
            try:
                a = d.xpath('.//a[contains(@href,"/video/player/")]')
                if not a:
                    continue
                m = re.search(r'/video/player/(\d+)', a[0].get("href", ""))
                if not m or m.group(1) in seen:
                    continue
                title = "".join(d.xpath('.//p[contains(@class,"title")]//text()')).strip()
                if not title:
                    continue
                pic = (d.xpath('.//img/@data-src') or d.xpath('.//img/@src') or ["", ""])[0]
                cls = "".join(d.xpath('.//p[contains(@class,"category")]//text()')).strip()
                seen.add(m.group(1))
                item = {"vod_id": m.group(1), "vod_name": title, "vod_pic": self._fix(pic)}
                if cls:
                    item["vod_remarks"] = cls
                out.append(item)
            except Exception:
                continue
        return out

    def _home_list(self, html):
        if not html:
            return []
        tree = etree.HTML(html)
        out, seen = [], set()
        for card in tree.xpath('//div[contains(@class,"video_item")]'):
            try:
                a = card.xpath('.//a[contains(@class,"title")]')
                if not a:
                    continue
                m = re.search(r'/video/player/(\d+)', a[0].get("href", ""))
                if not m or m.group(1) in seen:
                    continue
                title = "".join(a[0].xpath(".//text()")).strip()
                if not title:
                    continue
                pic = (card.xpath('.//img/@data-src') or card.xpath('.//img/@src') or ["", ""])[0]
                cls = "".join(card.xpath('.//a[contains(@class,"category")]/text()')).strip()
                seen.add(m.group(1))
                item = {"vod_id": m.group(1), "vod_name": title, "vod_pic": self._fix(pic)}
                if cls:
                    item["vod_remarks"] = cls
                out.append(item)
            except Exception:
                continue
        return out

    def _nav_categories(self, html):
        if not html:
            return self.categories
        tree = etree.HTML(html)
        out, seen = [], set()
        for a in tree.xpath('//nav[contains(@class,"menu")]//a[contains(@href,"/video/category/")]'):
            try:
                href = a.get("href", "")
                name = "".join(a.xpath(".//text()")).strip()
                tid = href.split("/video/category/")[-1].strip("/")
                if not name or not tid or tid in seen:
                    continue
                seen.add(tid)
                out.append({"type_id": tid, "type_name": name})
            except Exception:
                continue
        return out or self.categories

    def homeContent(self, filter):
        html = self._get(self.home)
        return {"class": self._nav_categories(html), "list": self._home_list(html), "filters": {}}

    def homeVideoContent(self):
        return {"list": self._home_list(self._get(self.home))}

    def categoryContent(self, tid, pg, filter, extend):
        pg = int(pg or 1)
        url = f"{self.home}/category/{quote(str(tid).strip('/'))}?page={pg}"
        html = self._get(url)
        items = self._data_list(html)
        pagecount = self._pagecount(html)
        return {"page": pg, "pagecount": pagecount, "limit": 16, "total": pagecount * 16, "list": items}

    def detailContent(self, ids):
        vid = str(ids[0])
        result = {"list": []}
        html = self._get(f"{self.host}/video/player/{vid}")
        if not html:
            return result
        tree = etree.HTML(html)
        name = "".join(tree.xpath('//h1[contains(@class,"title")]/text()')).strip()
        name = re.sub(r'^正在播放[:：]\s*', '', name)
        if not name:
            return result
        pic = (tree.xpath('//img[contains(@style,"max-width")]/@src') or ["", ""])[0]
        play = ""
        m = re.search(r'<video[^>]*data-src="([^"]+)"', html)
        if m:
            try:
                play = b64decode(m.group(1)).decode("utf-8")
            except Exception:
                play = ""
        if not play:
            return result
        info = {
            "vod_id": vid,
            "vod_name": name,
            "vod_pic": self._fix(pic),
            "vod_play_from": "恋丝影视",
            "vod_play_url": f"第1集${play}",
        }
        tm = re.search(r'<title>([^<]+?)</title>', html)
        if tm:
            parts = [p.strip() for p in tm.group(1).split("-")]
            if len(parts) >= 3:
                info["vod_remarks"] = parts[1]
                info["vod_class"] = parts[1]
        result["list"].append(info)
        return result

    def searchContent(self, key, quick, pg="1"):
        pg = int(pg or 1)
        url = f"{self.home}/search/?keyword={quote(str(key))}&page={pg}"
        html = self._get(url)
        return {"list": self._data_list(html), "page": pg}

    def playerContent(self, flag, id, vipFlags):
        return {
            "parse": 0,
            "url": self._fix(id),
            "header": {"User-Agent": self.headers["User-Agent"], "Referer": self.host + "/"},
        }

    def isVideoFormat(self, url):
        return ".m3u8" in (url or "") or ".mp4" in (url or "")

    def manualVideoCheck(self):
        return False

    def localProxy(self, param):
        return None

    def destroy(self):
        return None
