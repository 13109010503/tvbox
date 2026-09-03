# -*- coding: utf-8 -*-
# 适用于OK影视的蜘蛛代码

import sys
import requests
import json
import re
from base.spider import Spider

sys.path.append('..')

# 网站配置
BASE_URL = "http://xjj2.716888.xyz"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36',
    'Cookie': 'mk_encrypt_c21f969b5f03d33d43e04f8f136e7682=390e11f0d5ae13b2787e6a72db11527f'
}

class Spider(Spider):
    """OK影视蜘蛛"""
    
    def __init__(self):
        self.base_url = BASE_URL
        self.headers = HEADERS
        self.categories = [
            {'id': '4k/4k.php', 'name': '随机', 'pic': 'https://img0.baidu.com/it/u=2236794495,926227820&fm=253&fmt=auto&app=138&f=JPEG?w=1091&h=500'},
            {'id': 'djxjj/dj1.php', 'name': 'DJ姐姐', 'pic': 'https://pic.rmb.bdstatic.com/mvideo/e17d86ce4489a02870ace9a25a804c3e'},
            {'id': 'zj/jipinyz/jipinyz.php', 'name': '极品钰足', 'pic': 'https://img1.baidu.com/it/u=4087009209,613234683&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=364'},
            {'id': 'zj/xuejie/xuejie.php', 'name': '学姐系列', 'pic': 'https://img1.baidu.com/it/u=2347706654,3055017263&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=750'},
            {'id': 'zj/kawayi/kawayi.php', 'name': '卡哇伊', 'pic': 'https://img2.baidu.com/it/u=3715511725,1094436549&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=1083'},
            {'id': 'zj/nennen/nennen.php', 'name': '嫩嫩系列', 'pic': 'https://img2.baidu.com/it/u=2560410906,3760952489&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=750'},
            {'id': 'zj/heji1/heji1.php', 'name': '美女舞蹈', 'pic': 'https://img0.baidu.com/it/u=4119328645,2294770712&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=750'},
            {'id': 'zj/sihuawd/sihuawd.php', 'name': '丝滑舞蹈', 'pic': 'https://img1.baidu.com/it/u=3167365498,4156845177&fm=253&fmt=auto&app=120&f=JPEG?w=355&h=631'},
            {'id': 'zj/wanmeisc/wanmeisc.php', 'name': '完美身材', 'pic': 'https://img2.baidu.com/it/u=2214691242,2295609938&fm=253&fmt=auto&app=120&f=JPEG?w=800&h=973'},
            {'id': 'zj/manyao/manyao.php', 'name': '慢摇系列', 'pic': 'https://img1.baidu.com/it/u=3930123826,1131807820&fm=253&fmt=auto&app=138&f=JPEG?w=889&h=500'},
            {'id': 'zj/sihuadd/sihuadd.php', 'name': '丝滑吊带', 'pic': 'https://img2.baidu.com/it/u=3998619741,1128428746&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=594'},
            {'id': 'zj/qingchun/qingchun.php', 'name': '清纯系列', 'pic': 'https://img2.baidu.com/it/u=1507871502,2316279678&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=768'},
            {'id': 'zj/cos/cos.php', 'name': 'COS系列', 'pic': 'https://img0.baidu.com/it/u=2245878765,4037513957&fm=253&fmt=auto&app=138&f=JPEG?w=617&h=411'},
            {'id': 'zj/jingpinbz/jingpinbz.php', 'name': '精品变装', 'pic': 'https://img1.baidu.com/it/u=3623293272,829752126&fm=253&fmt=auto&app=138&f=JPEG?w=285&h=285'},
            {'id': 'zj/jipinll/jipinll.php', 'name': '极品罗丽', 'pic': 'https://img2.baidu.com/it/u=1922261112,3647796435&fm=253&fmt=auto&app=120&f=JPEG?w=500&h=542'},
            {'id': 'zj/nideym/nideym.php', 'name': '你的裕梦', 'pic': 'https://img1.baidu.com/it/u=3970043028,2042301564&fm=253&fmt=auto&app=120&f=JPEG?w=500&h=889'},
            {'id': 'zj/tianmei/tianmei.php', 'name': '甜妹系列', 'pic': 'https://img2.baidu.com/it/u=3229384329,3046902124&fm=253&fmt=auto&app=120&f=JPEG?w=800&h=800'},
            {'id': 'zj/yusi/yusi.php', 'name': '御丝系列', 'pic': 'https://img1.baidu.com/it/u=3113661564,2558849413&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=500'},
            {'id': 'zj/shuaige/shuaige.php', 'name': '帅哥哥', 'pic': 'https://img1.baidu.com/it/u=2361496550,3302335162&fm=253&fmt=auto&app=138&f=JPEG?w=333&h=500'},
            {'id': 'zj/rewu/rewu.php', 'name': '热舞系列', 'pic': 'https://img1.baidu.com/it/u=270105183,1595166255&fm=253&fmt=auto&app=120&f=JPEG?w=800&h=500'},
            {'id': 'zj/jingpinsc/jingpinsc.php', 'name': '精品收藏', 'pic': 'https://img1.baidu.com/it/u=4071105902,825241031&fm=253&fmt=auto&app=138&f=JPEG?w=235&h=340'}
        ]

    def getName(self):
        """获取蜘蛛名称"""
        return "小姐姐视频"

    def init(self, extend):
        """初始化"""
        pass

    def isVideoFormat(self, url):
        """判断是否为视频格式"""
        return False

    def manualVideoCheck(self):
        """手动视频检查"""
        return False

    def homeContent(self, filter=False):
        """首页内容"""
        return self.homeVideoContent()

    def homeVideoContent(self):
        """首页视频内容"""
        videos = []
        for cat in self.categories:
            video = {
                "vod_id": cat['id'],
                "vod_name": cat['name'],
                "vod_pic": cat['pic'],
                "vod_remarks": '播放20个',
            }
            videos.append(video)

        return {'list': videos}

    def categoryContent(self, cid, pg, filter, ext):
        """
        分类内容
        cid: 分类ID
        pg: 页码
        """
        try:
            # 构建请求URL
            url = f"{self.base_url}/{cid}"
            if pg and pg != '1':
                url = f"{url}?page={pg}"
            
            response = requests.get(url, headers=self.headers, timeout=10)
            response.encoding = 'utf-8'
            
            # 解析页面获取视频列表
            videos = self._parse_video_list(response.text, cid)
            
            # 获取总页数
            total_pages = self._get_total_pages(response.text)
            
            return {
                'list': videos,
                'page': pg,
                'pagecount': total_pages
            }
        except Exception as e:
            print(f"获取分类内容失败: {e}")
            return {'list': [], 'page': pg, 'pagecount': 1}

    def detailContent(self, ids):
        """详情内容"""
        if not ids:
            return {'list': []}
        
        try:
            did = ids[0]
            # 生成播放列表
            play_urls = []
            for i in range(1, 21):
                play_urls.append(f"{i}$/fenlei/{did}")
            
            play_url = "#".join(play_urls)
            
            video = {
                "vod_id": did,
                "vod_name": self._get_category_name(did),
                "vod_pic": self._get_category_pic(did),
                "type_name": '视频',
                "vod_year": "",
                "vod_area": "",
                "vod_remarks": "",
                "vod_actor": "",
                "vod_director": "",
                "vod_content": "",
                "vod_play_from": "GK推荐",
                "vod_play_url": play_url
            }
            
            return {'list': [video]}
        except Exception as e:
            print(f"获取详情失败: {e}")
            return {'list': []}

    def playerContent(self, flag, id, vipFlags):
        """播放内容"""
        try:
            url = f"{self.base_url}{id}"
            response = requests.get(
                url=url,
                headers=self.headers,
                allow_redirects=False,
                timeout=10
            )
            
            location_header = response.headers.get('Location')
            if not location_header:
                return {
                    "parse": 0,
                    "playUrl": '',
                    "url": '',
                    "header": self.headers
                }
            
            # 处理重定向URL
            if location_header.startswith('http'):
                purl = location_header
            elif location_header.startswith('//'):
                purl = 'https:' + location_header
            else:
                purl = 'http:' + location_header
            
            return {
                "parse": 0,
                "playUrl": '',
                "url": purl,
                "header": self.headers
            }
        except Exception as e:
            print(f"获取播放地址失败: {e}")
            return {
                "parse": 0,
                "playUrl": '',
                "url": '',
                "header": self.headers
            }

    def searchContentPage(self, key, quick, page):
        """搜索内容分页"""
        try:
            url = f"{self.base_url}/search.php"
            data = {'keyword': key, 'page': page}
            response = requests.post(url, headers=self.headers, data=data, timeout=10)
            response.encoding = 'utf-8'
            
            videos = self._parse_search_result(response.text, key)
            
            return {
                'list': videos,
                'page': page,
                'pagecount': 1
            }
        except Exception as e:
            print(f"搜索失败: {e}")
            return {'list': [], 'page': page, 'pagecount': 1}

    def searchContent(self, key, quick):
        """搜索内容"""
        return self.searchContentPage(key, quick, '1')

    def localProxy(self, params):
        """本地代理"""
        if not params:
            return None
            
        proxy_type = params.get('type', '')
        if proxy_type == "m3u8":
            return self._proxy_m3u8(params)
        elif proxy_type == "media":
            return self._proxy_media(params)
        elif proxy_type == "ts":
            return self._proxy_ts(params)
        return None

    # ========== 私有辅助方法 ==========
    
    def _parse_video_list(self, html, cid):
        """解析视频列表"""
        videos = []
        try:
            # 使用正则提取视频信息
            # 这里根据实际页面结构调整正则表达式
            pattern = r'<a[^>]*href="[^"]*/([^"]+)"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>.*?<span[^>]*>([^<]+)</span'
            matches = re.findall(pattern, html, re.DOTALL)
            
            for i, match in enumerate(matches[:20], 1):
                video_id = match[0]
                pic = match[1] if match[1].startswith('http') else f"https:{match[1]}"
                name = match[2] if len(match) > 2 else f"视频{i}"
                
                videos.append({
                    "vod_id": f"{cid}/{video_id}",
                    "vod_name": name.strip(),
                    "vod_pic": pic,
                    "vod_remarks": f"播放{i}"
                })
                
        except Exception as e:
            print(f"解析视频列表失败: {e}")
            
        # 如果没有解析到数据，返回默认数据
        if not videos:
            for i in range(1, 21):
                videos.append({
                    "vod_id": f"{cid}/video_{i}",
                    "vod_name": f"视频{i}",
                    "vod_pic": "https://img2.baidu.com/it/u=3715511725,1094436549&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=1083",
                    "vod_remarks": f"播放{i}"
                })
                
        return videos

    def _get_total_pages(self, html):
        """获取总页数"""
        try:
            pattern = r'共(\d+)页'
            match = re.search(pattern, html)
            if match:
                return int(match.group(1))
        except:
            pass
        return 1

    def _parse_search_result(self, html, keyword):
        """解析搜索结果"""
        videos = []
        try:
            pattern = r'<a[^>]*href="[^"]*/([^"]+)"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>.*?<span[^>]*>([^<]+)</span'
            matches = re.findall(pattern, html, re.DOTALL)
            
            for i, match in enumerate(matches[:20], 1):
                video_id = match[0]
                pic = match[1] if match[1].startswith('http') else f"https:{match[1]}"
                name = match[2] if len(match) > 2 else f"搜索结果{i}"
                
                videos.append({
                    "vod_id": video_id,
                    "vod_name": name.strip(),
                    "vod_pic": pic,
                    "vod_remarks": f"搜索:{keyword}"
                })
        except:
            pass
        return videos

    def _get_category_name(self, cid):
        """根据分类ID获取分类名称"""
        for cat in self.categories:
            if cat['id'] == cid:
                return cat['name']
        return "未知分类"

    def _get_category_pic(self, cid):
        """根据分类ID获取分类图片"""
        for cat in self.categories:
            if cat['id'] == cid:
                return cat['pic']
        return ""

    def _proxy_m3u8(self, params):
        """M3U8代理"""
        return None

    def _proxy_media(self, params):
        """媒体代理"""
        return None

    def _proxy_ts(self, params):
        """TS代理"""
        return None