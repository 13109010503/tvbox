# -*- coding: utf-8 -*-
# FongMi/TVBox Python Spider - 泥视频 nivod.vip
import re, json, html, base64
from urllib.parse import urljoin, quote, unquote

try:
    from base.spider import Spider as BaseSpider
except Exception:
    class BaseSpider(object):
        def fetch(self, url, headers=None, timeout=15, **kwargs):
            import requests
            return requests.get(url, headers=headers, timeout=timeout, verify=False)

class Spider(BaseSpider):
    def __init__(self):
        self.host = 'https://www.nivod.vip'
        self.headers = {'User-Agent':'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36','Referer':self.host + '/'}
        self.classes = [{'type_id':'1','type_name':'电影'},{'type_id':'2','type_name':'剧集'},{'type_id':'3','type_name':'综艺'},{'type_id':'4','type_name':'动漫'},{'type_id':'new','type_name':'今日更新'},{'type_id':'hot','type_name':'热榜'}]

    def getName(self): return '泥视频'
    def getDependence(self): return []
    def init(self, extend=''): pass
    def isVideoFormat(self, url): return bool(re.search(r'\.(m3u8|mp4)(\?|$)', str(url), re.I))
    def manualVideoCheck(self): return True
    def action(self, action): return None
    def destroy(self): pass
    def liveContent(self, url): return {'list': []}
    def localProxy(self, param): return [404, 'text/plain', 'Not Found']

    def log(self, msg):
        try: print('[泥视频] ' + str(msg))
        except Exception: pass

    def getHtml(self, url, referer=None):
        if not url.startswith('http'): url = urljoin(self.host, url)
        h = dict(self.headers)
        if referer: h['Referer'] = referer
        try:
            r = self.fetch(url, headers=h, timeout=15)
            if hasattr(r, 'content'):
                enc = getattr(r, 'encoding', None) or 'utf-8'
                return r.content.decode(enc, 'ignore')
            return getattr(r, 'text', '') or ''
        except Exception as e:
            self.log('请求失败 %s %s' % (url, e)); return ''

    def clean(self, s):
        s = html.unescape(str(s or ''))
        s = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', s, flags=re.I)
        s = re.sub(r'<[^>]+>', ' ', s)
        return re.sub(r'\s+', ' ', s).strip()

    def fix(self, u):
        if not u: return ''
        u = html.unescape(u).replace('\\/', '/')
        return urljoin(self.host, u.strip())

    def homeContent(self, filter):
        return {'class': self.classes, 'filters': self.makeFilters() if filter else {}}

    def makeFilters(self):
        years = [{'n':'全部','v':''}] + [{'n':str(y),'v':str(y)} for y in range(2026, 2010, -1)]
        areas = [{'n':'全部','v':''}] + [{'n':x,'v':x} for x in ['大陆','香港','台湾','日本','韩国','欧美','英国','泰国','其它']]
        langs = [{'n':'全部','v':''}] + [{'n':x,'v':x} for x in ['国语','英语','粤语','韩语','日语','西班牙语','法语','德语','泰语','其它']]
        bys = [{'n':'添加时间','v':'time_add'},{'n':'更新时间','v':'time_update'},{'n':'人气排序','v':'hits'},{'n':'评分排序','v':'score'}]
        letters = [{'n':'全部','v':''}] + [{'n':c,'v':c} for c in list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')] + [{'n':'0-9','v':'0-9'}]
        common = [{'key':'area','name':'地区','value':areas},{'key':'year','name':'年份','value':years},{'key':'lang','name':'语言','value':langs},{'key':'letter','name':'字母','value':letters},{'key':'by','name':'排序','value':bys}]
        fs = {c['type_id']: list(common) for c in self.classes if c['type_id'] not in ['new','hot']}
        fs['1'] = [{'key':'class','name':'类型','value':[{'n':'全部','v':''}]+[{'n':n,'v':v} for n,v in [('动作片','6'),('喜剧片','7'),('爱情片','8'),('科幻片','9'),('奇幻片','10'),('恐怖片','11'),('剧情片','12'),('战争片','20'),('纪录片','21'),('动画片','26'),('悬疑片','22'),('冒险片','23'),('犯罪片','24')]]}] + common
        return fs

    def homeVideoContent(self):
        return {'list': self.parseList(self.getHtml(self.host + '/'))[:30]}

    def buildCategoryUrl(self, tid, pg, extend):
        pg = str(pg or '1'); ext = extend or {}
        if tid == 'new': return self.host + '/label/new/'
        if tid == 'hot': return self.host + '/label/hot/'
        cid = ext.get('class') or tid
        if ext:
            area = quote(str(ext.get('area','')), safe='')
            by = quote(str(ext.get('by','')), safe='')
            lang = quote(str(ext.get('lang','')), safe='')
            letter = quote(str(ext.get('letter','')), safe='')
            year = quote(str(ext.get('year','')), safe='')
            p = '' if pg == '1' else pg
            return self.host + '/k/%s-%s-%s--%s-%s---%s---%s/' % (cid, area, by, lang, letter, p, year)
        if pg == '1': return self.host + '/t/%s/' % tid
        return self.host + '/t/%s-%s/' % (tid, pg)

    def categoryContent(self, tid, pg, filter, extend):
        url = self.buildCategoryUrl(tid, pg, extend or {})
        vods = self.parseList(self.getHtml(url, self.host + '/'))
        return {'list': vods, 'page': int(pg or 1), 'pagecount': 999999 if vods else int(pg or 1), 'limit': len(vods), 'total': 999999 if vods else 0}

    def parseList(self, txt):
        vods, seen = [], set()
        blocks = re.findall(r'<a\b(?=[^>]*class=["\'][^"\']*module-(?:poster-)?item[^"\']*["\'])([\s\S]*?)</a>', txt or '', re.I)
        if not blocks:
            blocks = re.findall(r'(<div\b[^>]*class=["\'][^"\']*module-card-item[^"\']*module-item[^"\']*["\'][\s\S]*?)(?=<div\b[^>]*class=["\'][^"\']*module-card-item\s+module-item|</div>\s*</div>\s*</div>)', txt or '', re.I)
        if not blocks:
            blocks = re.findall(r'<a\b([^>]+href=["\'][^"\']*/nivod/\d+/?["\'][\s\S]*?)</a>', txt or '', re.I)
        for b in blocks:
            try:
                hm = re.search(r'href=["\']([^"\']*/nivod/(\d+)/?)["\']', b, re.I)
                if not hm: continue
                vid = self.fix(hm.group(1))
                if vid in seen: continue
                seen.add(vid)
                tm = re.search(r'title=["\']([^"\']+)["\']', b, re.I) or re.search(r'class=["\'][^"\']*module-(?:poster|card)-item-title[^"\']*["\'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)</a>', b, re.I) or re.search(r'class=["\'][^"\']*module-(?:poster|card)-item-title[^"\']*["\'][^>]*>([\s\S]*?)</div>', b, re.I)
                title = self.clean(tm.group(1)) if tm else ''
                pm = re.search(r'(?:data-original|data-src)=["\']([^"\']+)["\']', b, re.I) or re.search(r'<img[^>]+src=["\']((?!/loading\.png)[^"\']+)["\']', b, re.I)
                rm = re.search(r'class=["\'][^"\']*module-item-note[^"\']*["\'][^>]*>([\s\S]*?)</div>', b, re.I)
                if title:
                    vods.append({'vod_id':vid,'vod_name':title,'vod_pic':self.fix(pm.group(1)) if pm else '', 'vod_remarks':self.clean(rm.group(1)) if rm else ''})
            except Exception as e:
                self.log('列表单条失败 %s' % e)
        return vods

    def detailContent(self, ids):
        url = ids[0]
        txt = self.getHtml(url, self.host + '/')
        mt = re.search(r'<h1[^>]*>([\s\S]*?)</h1>', txt, re.I) or re.search(r'<title>(.*?)详情介绍', txt, re.S) or re.search(r'title=["\']立刻播放([^"\']+)', txt)
        title = self.clean(mt.group(1)) if mt else ''
        picm = re.search(r'(?:data-original|data-src)=["\']([^"\']+)["\'][^>]+alt=["\']%s' % re.escape(title), txt, re.I) or re.search(r'class=["\'][^"\']*module-item-pic[^"\']*["\'][\s\S]*?(?:data-original|data-src|src)=["\']([^"\']+)', txt, re.I)
        cm = re.search(r'module-info-introduction-content["\'][^>]*>([\s\S]*?)</div>', txt, re.I)
        content = self.clean(cm.group(1)) if cm else ''
        def item(name):
            m = re.search(r'<span[^>]*>%s[:：]</span>\s*<div[^>]*>([\s\S]*?)</div>' % name, txt, re.I)
            return self.clean(m.group(1)) if m else ''
        names = [self.clean(x) for x in re.findall(r'<div[^>]+class=["\'][^"\']*module-tab-item[^"\']*tab-item[^"\']*["\'][^>]*>\s*<span>(.*?)</span>', txt, re.I)]
        groups = re.findall(r'<div[^>]+class=["\'][^"\']*module-play-list[^"\']*["\'][^>]*>([\s\S]*?)</div>\s*</div>\s*</div>', txt, re.I)
        play_from, play_url = [], []
        for i,g in enumerate(groups):
            eps=[]
            for a in re.findall(r'<a\b([^>]+class=["\'][^"\']*module-play-list-link[^"\']*["\'][^>]*)>([\s\S]*?)</a>', g, re.I):
                hm = re.search(r'href=["\']([^"\']+) ["\']', a[0]+' ', re.I) or re.search(r'href=["\']([^"\']+)["\']', a[0], re.I)
                if hm:
                    name = self.clean(a[1]) or ('第%d集' % (len(eps)+1))
                    eps.append(name + '$' + self.fix(hm.group(1)))
            if eps:
                play_from.append(names[i] if i < len(names) and names[i] else '线路%d'%(i+1)); play_url.append('#'.join(eps))
        if not play_url:
            eps=[]
            for h,n in re.findall(r'href=["\']([^"\']*/niplay/\d+-\d+-\d+/)["\'][^>]*>([\s\S]*?)</a>', txt, re.I):
                eps.append((self.clean(n) or '播放') + '$' + self.fix(h))
            if eps: play_from, play_url = ['默认'], ['#'.join(list(dict.fromkeys(eps)))]
        vod = {'vod_id':url,'vod_name':title,'vod_pic':self.fix(picm.group(1)) if picm else '', 'type_name':item('类型') or item('分类'), 'vod_year':item('上映')[:4], 'vod_area':item('地区'), 'vod_remarks':item('更新'), 'vod_actor':item('主演'), 'vod_director':item('导演'), 'vod_content':content, 'vod_play_from':'$$$'.join(play_from), 'vod_play_url':'$$$'.join(play_url)}
        return {'list':[vod]}

    def searchContent(self, key, quick, pg='1'):
        url = self.host + '/s/%s-------------/' % quote(key)
        return {'list': self.parseList(self.getHtml(url, self.host + '/')), 'page': int(pg or 1), 'pagecount': 1, 'limit': 20, 'total': 0}

    def playerContent(self, flag, id, vipFlags):
        if self.isVideoFormat(id): return {'parse':0, 'url':id, 'header':self.headers}
        txt = self.getHtml(id, self.host + '/')
        data = None
        m = re.search(r'var\s+player_[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]*?\})\s*</script>', txt, re.I)
        if m:
            try: data = json.loads(m.group(1))
            except Exception: data = None
        url = data.get('url','') if isinstance(data, dict) else ''
        enc = str(data.get('encrypt','0')) if isinstance(data, dict) else '0'
        try:
            if enc == '1': url = unquote(url)
            elif enc == '2': url = unquote(base64.b64decode(url).decode('utf-8','ignore'))
        except Exception: pass
        url = self.fix(url)
        if not self.isVideoFormat(url):
            mm = re.search(r'(https?:\\?/\\?/[^"\']+?\.(?:m3u8|mp4)[^"\']*)', txt, re.I)
            url = self.fix(mm.group(1)) if mm else url
        if self.isVideoFormat(url):
            return {'parse':0, 'url':url, 'header':{'User-Agent':self.headers['User-Agent'], 'Referer':id}}
        return {'parse':1, 'url':id, 'header':self.headers}

spider = Spider()