# -*- coding: utf-8 -*-
import re
import sys
import json
import time
from base64 import b64encode, b64decode
from urllib.parse import quote, unquote
from lxml import etree

try:
    import urllib3
    urllib3.disable_warnings()
except Exception:
    pass

try:
    from Crypto.Cipher import AES as _AES
except Exception:
    _AES = None

sys.path.append('..')
from base.spider import Spider


class Spider(Spider):
    def getName(self):
        return "黄果短剧"

    def init(self, extend=""):
        self.host = "https://huangguoai.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": self.host + "/",
        }
        ext = extend or ""
        self.pics_direct = "direct=1" in ext or "direct=1" in str(ext)
        self.categories = [
            {"type_id": "ai-duanju", "type_name": "AI成人短剧"},
            {"type_id": "ai-manju", "type_name": "AI成人漫剧"},
            {"type_id": "ai-huanlian", "type_name": "AI换脸"},
            {"type_id": "ai-mogai", "type_name": "AI魔改"},
            {"type_id": "ranks/hot", "type_name": "排行榜"},
        ]

    # ---------- 基础工具 ----------
    def _get(self, url, referer=None, asjson=False):
        headers = dict(self.headers)
        if referer:
            headers["Referer"] = referer
        for i in range(3):
            try:
                r = self.fetch(url, headers=headers, timeout=15, verify=False)
                if not asjson:
                    return r.text
                try:
                    return r.json()
                except Exception:
                    return {}
            except Exception:
                if i == 2:
                    break
                time.sleep(1)
        return {} if asjson else ""

    def _fix(self, u):
        if not u:
            return ""
        if u.startswith("//"):
            return "https:" + u
        if u.startswith("/"):
            return self.host + u
        return u

    def _img_src(self, u):
        """剔除 CDN 防盗链的 auth_key 等查询参数, 得到不过期的稳定直链"""
        u = self._fix(u or "")
        if u.startswith("http") and "?" in u:
            u = re.sub(r'\?.*', '', u)
        return u

    def _proxy_pic(self, u):
        """图片 URL 统一通过本地代理加载, 避免防盗链过期/内容类型/直连被墙"""
        u = self._img_src(u)
        if not u:
            return ""
        if self.pics_direct:
            return u
        enc = quote(b64encode(u.encode("utf-8")).decode("utf-8"), safe="")
        return f"{self.getProxyUrl()}&url={enc}&type=img"

    # 站点图片为 AES-128-CBC 加密字节, 密钥/IV 取自站点前端 crypto-worker.js
    _IMG_KEY = bytes([102, 53, 100, 57, 54, 53, 100, 102, 55, 53, 51, 51, 54, 50, 55, 48])
    _IMG_IV = bytes([57, 55, 98, 54, 48, 51, 57, 52, 97, 98, 99, 50, 102, 98, 101, 49])

    def _decrypt_img(self, raw):
        if not raw or len(raw) % 16 != 0 or _AES is None:
            return raw
        try:
            pt = _AES.new(self._IMG_KEY, _AES.MODE_CBC, self._IMG_IV).decrypt(raw)
        except Exception:
            return raw
        # 解密后若不含图片特征说明源图并未加密, 原样返回
        if not (pt[:2] == b"\xff\xd8" or pt[:8] == b"\x89PNG\r\n\x1a\n"
                or pt[:4] == b"RIFF" or pt[:6] in (b"GIF87a", b"GIF89a")):
            return raw
        pad = pt[-1]
        if 0 < pad <= 16 and pt[-pad:] == bytes([pad]) * pad:
            pt = pt[:-pad]
        if pt[:2] == b"\xff\xd8":
            i = pt.rfind(b"\xff\xd9")
            if i >= 0:
                pt = pt[:i + 2]
        elif pt[:8] == b"\x89PNG\r\n\x1a\n":
            i = pt.rfind(b"IEND")
            if i >= 0:
                pt = pt[:i + 8]
        return pt

    def _img_ct(self, data):
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        if data[:6] in (b"GIF87a", b"GIF89a"):
            return "image/gif"
        return "image/jpeg"

    def _get_bin(self, url):
        headers = dict(self.headers)
        for i in range(3):
            try:
                r = self.fetch(url, headers=headers, timeout=15, verify=False)
                if r.status_code == 200:
                    return r.content
            except Exception:
                if i == 2:
                    break
                time.sleep(1)
        return None

    def _card(self, card):
        a = card.xpath('.//a[contains(@href,"/detail/")]')
        if not a:
            return None
        a = a[0]
        m = re.search(r'/detail/(\d+)/', a.get("href", ""))
        if not m:
            return None
        img = (card.xpath('.//img/@data-src') or card.xpath('.//img/@src') or ["", ""])[0]
        title = "".join(card.xpath('.//*[contains(@class,"hg-drama-card__title")]//text()')).strip()
        if not title:
            title = a.get("title", "").strip()
        if not title:
            return None
        rem = "".join(card.xpath('.//*[contains(@class,"hg-drama-card__episode")]//text()')).strip()
        score = "".join(card.xpath('.//*[contains(@class,"hg-drama-card__score")]//text()')).strip()
        if rem and score:
            rem = f"{rem} · {score}"
        elif not rem:
            rem = score
        return {
            "vod_id": m.group(1),
            "vod_name": title,
            "vod_pic": self._proxy_pic(img),
            "vod_remarks": rem,
        }

    def _cards(self, html, all_grids=False):
        if not html:
            return []
        tree = etree.HTML(html)
        if all_grids:
            nodes = []
            for g in tree.xpath('//*[contains(@class,"hg-card-grid")]'):
                nodes.extend(g.xpath('.//*[contains(@class,"hg-drama-card")]'))
        else:
            grids = tree.xpath('//*[contains(@class,"hg-card-grid")]')
            nodes = grids[0].xpath('.//*[contains(@class,"hg-drama-card")]') if grids else []
        out, seen = [], set()
        for card in nodes:
            try:
                item = self._card(card)
                if not item or item["vod_id"] in seen:
                    continue
                seen.add(item["vod_id"])
                out.append(item)
            except Exception:
                continue
        return out

    def _rank_items(self, html):
        if not html:
            return []
        tree = etree.HTML(html)
        lists = tree.xpath('//*[contains(@class,"hg-rank-list")]')
        nodes = lists[0].xpath('.//*[contains(@class,"hg-rank-item")]') if lists else tree.xpath('//*[contains(@class,"hg-rank-item")]')
        out, seen = [], set()
        for item in nodes:
            try:
                a = item.xpath('.//a[contains(@href,"/detail/")]')
                if not a:
                    continue
                m = re.search(r'/detail/(\d+)/', a[0].get("href", ""))
                if not m or m.group(1) in seen:
                    continue
                seen.add(m.group(1))
                img = (item.xpath('.//img/@data-src') or item.xpath('.//img/@src') or ["", ""])[0]
                title = "".join(item.xpath('.//*[contains(@class,"hg-rank-item__title")]//text()')).strip()
                if not title:
                    title = a[0].get("title", "").strip()
                if not title:
                    continue
                out.append({
                    "vod_id": m.group(1),
                    "vod_name": title,
                    "vod_pic": self._proxy_pic(img),
                    "vod_remarks": "".join(item.xpath('.//*[contains(@class,"hg-rank-item__tags")]//text()')).strip(),
                })
            except Exception:
                continue
        return out

    def _panel_total(self, html):
        m = re.search(r'data-panel-total="(\d+)"', html or "")
        return int(m.group(1)) if m else 0

    # ---------- 接口 ----------
    def homeContent(self, filter):
        return {"class": self.categories, "list": self._cards(self._get(self.host), all_grids=True), "filters": {}}

    def homeVideoContent(self):
        return {"list": self._cards(self._get(self.host), all_grids=True)}

    def categoryContent(self, tid, pg, filter, extend):
        pg = int(pg or 1)
        tid = str(tid).strip("/")
        if "rank" in tid:
            url = f"{self.host}/{tid}/" if pg == 1 else f"{self.host}/{tid}/{pg}/"
            return {"page": pg, "pagecount": 9999, "limit": 20, "total": 99999, "list": self._rank_items(self._get(url))}
        url = f"{self.host}/{tid}/" if pg == 1 else f"{self.host}/{tid}/{pg}/"
        html = self._get(url)
        cards = self._cards(html)
        total = self._panel_total(html)
        pagecount = max(1, (total + 23) // 24) if total else 9999
        return {"page": pg, "pagecount": pagecount, "limit": 24, "total": total or 99999, "list": cards}

    def detailContent(self, ids):
        vid = str(ids[0])
        html = self._get(f"{self.host}/detail/{vid}/")
        result = {"list": []}
        if not html:
            return result
        tree = etree.HTML(html)
        name = "".join(tree.xpath('//h1/text()')).strip()
        if not name:
            return result
        pic_l = tree.xpath('//*[contains(@class,"hg-web-detail__poster")]//img/@data-src')
        if not pic_l:
            pic_l = tree.xpath('//*[contains(@class,"hg-web-detail__poster")]//img/@src')
        pic = pic_l[0].strip() if pic_l else ""
        desc = "".join(tree.xpath('//*[contains(@class,"hg-web-detail__desc")]/text()')).strip()
        remarks = "".join(tree.xpath('//*[contains(@class,"hg-web-detail__poster")]//*[contains(@class,"hg-web-detail__episode")]//text()')).strip()
        score = "".join(tree.xpath('//*[contains(@class,"hg-web-detail__score")]//text()')).strip()
        meta = "".join(tree.xpath('//*[contains(@class,"hg-web-detail__meta")]/span[not(contains(@class,"score"))]/text()')).strip()
        eps = []
        for a in tree.xpath('//*[contains(@class,"hg-web-detail__ep-grid")]//a'):
            href = a.get("href", "")
            if not href:
                continue
            eid = a.get("data-ep-id", "")
            name_ep = f"第{eid}集" if eid else "".join(a.xpath(".//text()")).strip()
            eps.append(f'{name_ep}${self._fix(href)}')
        if not eps:
            play = tree.xpath('//*[contains(@class,"hg-web-detail__play")]/@href')
            if play:
                eps = [f"第1集${self._fix(play[0])}"]
        if not eps:
            return result
        info = {
            "vod_id": vid,
            "vod_name": name,
            "vod_pic": self._proxy_pic(pic),
            "vod_play_from": "黄果短剧",
            "vod_play_url": "#".join(eps),
            "vod_content": desc,
        }
        if remarks:
            info["vod_remarks"] = remarks
        elif score:
            info["vod_remarks"] = f"{score}分"
        tags = [t.strip() for t in tree.xpath('//*[contains(@class,"hg-web-detail__tags")]//*[contains(@class,"hg-tag")]//text()') if t.strip()]
        if tags:
            info["vod_class"] = ",".join(tags)
        ym = re.search(r'(20\d{2})-\d{2}-\d{2}', meta or "")
        if ym:
            info["vod_year"] = ym.group(1)
        result["list"].append(info)
        return result

    def searchContent(self, key, quick, pg="1"):
        url = f"{self.host}/search/video/{quote(key)}/"
        return {"list": self._cards(self._get(url)), "page": int(pg or 1)}

    def playerContent(self, flag, id, vipFlags):
        url = self._fix(id)
        play = ""
        html = self._get(url, referer=self.host)
        if html:
            mm = re.search(r'<script id="videoInitialData" type="application/json">(.*?)</script>', html, re.S)
            if mm:
                try:
                    data = json.loads(mm.group(1))
                except Exception:
                    data = {}
                if isinstance(data, dict):
                    em = re.search(r'/ep-(\d+)/', url)
                    ep = str(em.group(1)) if em else "1"
                    srcs = data.get("epPlaySrcs") or {}
                    play = srcs.get(ep) or data.get("videoSrc") or ""
        if play:
            play = play.replace("\\u0026", "&")
            if not play.startswith("http"):
                mm2 = re.search(r'(https?://[^\s"\']+)', play)
                play = mm2.group(1) if mm2 else ""
        header = {
            "User-Agent": self.headers.get("User-Agent", "Mozilla/5.0"),
            "Referer": self.host + "/",
        }
        return {"parse": 0, "url": play, "header": header}

    def localProxy(self, param):
        try:
            if param and param.get("type") == "img":
                raw = param.get("url", "") or ""
                if raw:
                    url = b64decode(unquote(raw).encode("utf-8")).decode("utf-8")
                    url = self._img_src(url)
                    if url:
                        raw = self._get_bin(url)
                        if raw:
                            data = self._decrypt_img(raw)
                            return [200, self._img_ct(data), data]
        except Exception:
            pass
        return None

    def isVideoFormat(self, url):
        return ".m3u8" in (url or "") or ".mp4" in (url or "")

    def manualVideoCheck(self):
        return False

    def destroy(self):
        return None
