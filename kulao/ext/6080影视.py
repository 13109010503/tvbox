# -*- coding: utf-8 -*-
# FongMi/TVBox Python Spider - 6080电影 yy8060.cc
import re
from urllib.parse import urljoin, quote

try:
    import requests
except Exception:
    requests = None

class Spider(object):
    def __init__(self):
        self.site = 'https://www.yy8060.cc'
        self.timeout = 15
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
        self.classes = [
            {'type_name':'电影','type_id':'1'},
            {'type_name':'电视剧','type_id':'2'},
            {'type_name':'动漫','type_id':'3'},
            {'type_name':'综艺','type_id':'4'},
            {'type_name':'最新','type_id':'latest'},
            {'type_name':'榜单','type_id':'rank'},
        ]
        self.filter = {
            '1': self.makeFilters(['动作','喜剧','爱情','科幻','剧情','惊悚','犯罪','恐怖','战争','冒险','奇幻','悬疑','记录']),
            '2': self.makeFilters(['国产剧','港台剧','日韩剧','欧美剧','海外剧','剧情','爱情','古装','悬疑','犯罪']),
            '3': self.makeFilters(['国产动漫','日韩动漫','欧美动漫','动画','冒险','奇幻']),
            '4': self.makeFilters(['大陆综艺','日韩综艺','港台综艺','欧美综艺','真人秀','脱口秀']),
        }

    def makeFilters(self, classes):
        return [
            {'key':'class','name':'类型','value':[{'n':'全部','v':''}] + [{'n':x,'v':x} for x in classes]},
            {'key':'year','name':'年份','value':[{'n':'全部','v':''}] + [{'n':str(y),'v':str(y)} for y in range(2026,2015,-1)]},
            {'key':'area','name':'地区','value':[{'n':'全部','v':''}] + [{'n':x,'v':x} for x in ['大陆','香港','台湾','韩国','日本','美国','英国','泰国','印度']]},
            {'key':'by','name':'排序','value':[{'n':'时间','v':'time'},{'n':'人气','v':'hit'},{'n':'推荐','v':'commend'}]},
        ]

    def getName(self): return '6080电影'
    def getDependence(self): return []
    def setExtendInfo(self, extend):
        try:
            ext = str(extend or '').strip()
            if ext.startswith('http'): self.site = ext.rstrip('/')
        except Exception: pass
        return None
    def init(self, extend=''):
        self.setExtendInfo(extend); return None
    def destroy(self): return None
    def liveContent(self, url): return None
    def action(self, action): return None
    def isVideoFormat(self, url): return bool(re.search(r'\.(m3u8|mp4)(\?|$)', str(url), re.I))
    def manualVideoCheck(self): return False
    def localProxy(self, param): return [404, 'text/plain', b'Not Found']

    def log(self, msg):
        try: print('[6080电影]', msg)
        except Exception: pass

    def cleanText(self, s):
        if s is None: return ''
        s = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', str(s), flags=re.I)
        s = re.sub(r'<[^>]+>', ' ', s)
        mp = {'&nbsp;':' ', '&amp;':'&', '"':'"', '&#039;':"'", '&ldquo;':'“', '&rdquo;':'”', '&hellip;':'…'}
        for k,v in mp.items(): s = s.replace(k,v)
        return re.sub(r'\s+', ' ', s).strip()

    def request(self, url, referer=None):
        if requests is None: return ''
        hs = dict(self.headers); hs['Referer'] = referer or self.site + '/'
        try:
            r = requests.get(url, headers=hs, timeout=self.timeout, verify=False, allow_redirects=True)
            enc = r.encoding or 'utf-8'
            if enc.lower() in ['iso-8859-1','ascii']: enc = r.apparent_encoding or 'utf-8'
            return r.content.decode(enc, 'ignore')
        except Exception as e:
            self.log('请求失败 %s %s' % (url, e)); return ''

    def absUrl(self, u):
        if not u: return ''
        u = u.strip()
        if u.startswith('//'): return 'https:' + u
        return urljoin(self.site + '/', u)

    def homeContent(self, filter=False):
        return {'class': self.classes, 'filters': self.filter if filter else {}}

    def homeVideoContent(self):
        html = self.request(self.site + '/')
        return {'list': self.parseList(html)[:30]}

    def catUrl(self, tid, pg, ext):
        pg = int(pg or 1); ext = ext or {}
        if tid == 'latest': return self.site + '/n/19.html'
        if tid == 'rank': return self.site + '/n/20.html'
        order = ext.get('by') or 'time'
        jq = ext.get('class') or ''
        year = ext.get('year') or ''
        area = ext.get('area') or ''
        return self.site + '/search.php?page=%s&searchtype=5&order=%s&tid=%s&area=%s&year=%s&letter=&yuyan=&state=&money=&ver=&jq=%s' % (pg, quote(order), quote(str(tid)), quote(area), quote(year), quote(jq))

    def categoryContent(self, tid, pg, filter, extend):
        html = self.request(self.catUrl(str(tid), pg, extend or {}))
        vods = self.parseList(html)
        return {'list': vods, 'page': int(pg or 1), 'pagecount': 999 if vods else int(pg or 1), 'limit': len(vods), 'total': 999999 if vods else 0}

    def parseList(self, html):
        vods, seen = [], set()
        boxes = re.findall(r'<li[^>]*class=["\'][^"\']*(?:pic-list-hover|col-xs-1 p-xs-0)[^"\']*["\'][\s\S]*?</li>', html, re.I)
        if not boxes:
            boxes = re.findall(r'<li[\s\S]*?</li>', html, re.I)
        for b in boxes:
            try:
                m = re.search(r'<a[^>]+href=["\'](/vote/\d+\.html)["\'][^>]*>', b, re.I)
                if not m: continue
                href = m.group(1)
                if href in seen: continue
                seen.add(href)
                title = ''
                tm = re.search(r'<a[^>]+href=["\']' + re.escape(href) + r'["\'][^>]+title=["\']([^"\']+)', b, re.I) or re.search(r'<h[23][^>]*[\s\S]*?<a[^>]*>([\s\S]*?)</a>', b, re.I)
                if tm: title = self.cleanText(tm.group(1))
                if not title:
                    am = re.search(r'<img[^>]+alt=["\']([^"\']+)', b, re.I); title = self.cleanText(am.group(1)) if am else ''
                pm = re.search(r'(?:data-original|data-src)=["\']([^"\']+?\.(?:jpg|jpeg|png|webp)[^"\']*)["\']', b, re.I) or re.search(r'<img[^>]+src=["\']([^"\']+?\.(?:jpg|jpeg|png|webp)[^"\']*)["\']', b, re.I)
                pic = self.absUrl(pm.group(1)) if pm else ''
                rm = re.search(r'<span[^>]+class=["\'][^"\']*(?:titles|score)[^"\']*["\'][^>]*>([\s\S]*?)</span>', b, re.I) or re.search(r'<p[^>]+class=["\'][^"\']*text-muted[^"\']*["\'][^>]*>([\s\S]*?)</p>', b, re.I)
                remark = self.cleanText(rm.group(1)) if rm else ''
                if title: vods.append({'vod_id':'vod@@'+href, 'vod_name':title, 'vod_pic':pic, 'vod_remarks':remark})
            except Exception as e:
                self.log('列表单条失败 %s' % e)
        return vods

    def detailContent(self, ids):
        sid = ids[0] if isinstance(ids, list) else ids
        href = str(sid).replace('vod@@','',1)
        url = self.absUrl(href)
        html = self.request(url)
        title = ''
        h1 = re.search(r'<h1[^>]*>([\s\S]*?)</h1>', html, re.I)
        if h1: title = self.cleanText(h1.group(1))
        if not title:
            tt = re.search(r'<title>([\s\S]*?)</title>', html, re.I); title = self.cleanText(tt.group(1)).split('免费在线观看')[0].replace('《','').replace('》','') if tt else ''
        pic = ''
        pm = re.search(r'<a[^>]+class=["\'][^"\']*pic-img[^"\']*["\'][\s\S]*?<img[^>]+(?:data-original|src)=["\']([^"\']+)', html, re.I) or re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html, re.I)
        if pm: pic = self.absUrl(pm.group(1))
        desc = ''
        dm = re.search(r'<span[^>]*>简介：</span>([\s\S]*?)</p>', html, re.I)
        if dm: desc = self.cleanText(dm.group(1))
        type_name = ''
        cm = re.search(r'<span[^>]*>类型：</span>([\s\S]*?)</div>', html, re.I)
        if cm: type_name = self.cleanText(cm.group(1))
        play_from, play_url = self.parsePlayGroups(html)
        vod = {'vod_id':sid, 'vod_name':title, 'vod_pic':pic, 'type_name':type_name, 'vod_content':desc, 'vod_play_from':play_from, 'vod_play_url':play_url}
        return {'list':[vod]}

    def parsePlayGroups(self, html):
        area = html
        st = html.find('播放地址')
        if st >= 0:
            ed = html.find('剧情简介', st)
            area = html[st:ed if ed > st else len(html)]
        navs = []
        for pid, name in re.findall(r'<a[^>]+id=["\']#(con_playlist_\d+)["\'][^>]*>([\s\S]*?)</a>', area, re.I):
            n = self.cleanText(name)
            if n and n not in ['不能播放，报错'] and pid not in [x[0] for x in navs]: navs.append((pid, n))
        groups = []
        for pid, n in navs:
            um = re.search(r'<ul[^>]+id=["\']%s["\'][^>]*>([\s\S]*?)</ul>' % re.escape(pid), area, re.I)
            if not um: continue
            eps = []
            for href, name in re.findall(r'<a[^>]+href=["\'](/play/[^"\']+\.html)["\'][^>]*>([\s\S]*?)</a>', um.group(1), re.I):
                text = self.cleanText(name) or '播放'
                eps.append(text + '$play@@' + href)
            if eps: groups.append((n, '#'.join(eps)))
        if not groups:
            eps=[]; seen=set()
            for href, name in re.findall(r'<a[^>]+href=["\'](/play/[^"\']+\.html)["\'][^>]*>([\s\S]*?)</a>', area, re.I):
                if href in seen: continue
                seen.add(href); eps.append((self.cleanText(name) or '播放') + '$play@@' + href)
            if eps: groups.append(('播放', '#'.join(eps)))
        return '$$$'.join([g[0] for g in groups]), '$$$'.join([g[1] for g in groups])

    def playerContent(self, flag, id, vipFlags):
        pid = str(id).replace('play@@','',1)
        if self.isVideoFormat(pid):
            return {'parse':0, 'playUrl':'', 'url':pid, 'header':{'User-Agent':self.headers['User-Agent'], 'Referer':self.site+'/'}}
        url = self.absUrl(pid)
        html = self.request(url)
        final = ''
        for pat in [r'var\s+now\s*=\s*["\']([^"\']+)["\']', r'(https?://[^"\'<>]+\.(?:m3u8|mp4)[^"\'<>]*)']:
            m = re.search(pat, html, re.I)
            if m and m.group(1): final = m.group(1).replace('\\/','/'); break
        if final:
            return {'parse':0, 'playUrl':'', 'url':final, 'header':{'User-Agent':self.headers['User-Agent'], 'Referer':url}}
        self.log('静态直链失败，降级嗅探: ' + url)
        return {'parse':1, 'playUrl':'', 'url':url, 'header':{'User-Agent':self.headers['User-Agent'], 'Referer':self.site+'/'}}

    def searchContent(self, key, quick=False, pg='1'):
        url = self.site + '/search.php?page=%s&searchword=%s&searchtype=' % (int(pg or 1), quote(str(key or '')))
        html = self.request(url)
        vods = self.parseList(html)
        return {'list': vods, 'page': int(pg or 1), 'pagecount': 999 if vods else int(pg or 1), 'limit': len(vods), 'total': 999999 if vods else 0}

spider = Spider()