#Kyele
import sys
import json
import time
import re
import requests
import threading
import random
import socket
import ssl
import base64
import os
import struct
from urllib.parse import quote
sys.path.append('..')
from base.spider import Spider

class Spider(Spider):
    def __init__(self):
        super().__init__()
        self.base = 'https://www.pandalive.co.kr'
        self.api = 'https://api.pandalive.co.kr'
        self.session = requests.Session()
        self.ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
        self.common_headers = {
            'User-Agent': self.ua,
            'Accept': 'application/json, text/plain, */*',
            'Origin': self.base,
            'Referer': self.base + '/'
        }
        self.x_device_info = {"t": "webPc", "v": "1.0", "ui": "0", "ck": {"sessKeyAsp": ""}}
        self.extra_cookie = ''
        self.danmu_cache = {}
        self.danmu_threads = {}
        self.danmu_lock = threading.Lock()
        self.danmu_sent = set()
        self.ws_host = 'chat-ws.bktv.kr'
        self.ws_path = '/connection/websocket'

    def init(self, extend=""):
        try:
            if extend:
                cfg = extend if isinstance(extend, dict) else json.loads(extend)
                self.x_device_info = cfg.get('x_device_info', self.x_device_info)
                self.extra_cookie = cfg.get('cookie', '')
        except Exception:
            pass
        try:
            self.session.headers.update(self.common_headers)
            if self.extra_cookie:
                self.session.headers['Cookie'] = self.extra_cookie
            self.session.get(self.base, timeout=8)
            self._app_token()
        except Exception:
            pass
        return self

    def getName(self):
        return 'PandaLive'

    def isVideoFormat(self, url):
        return url.endswith('.m3u8') or url.endswith('.mp4')

    def manualVideoCheck(self):
        return False

    def destroy(self):
        try:
            self.session.close()
        except Exception:
            pass

    def _app_token(self):
        headers = self._with_x_device_info(dict(self.session.headers))
        return self.session.get(f'{self.api}/v1/member/app_token', headers=headers, timeout=8)

    def _list_live(self, page=None, page_size=None, order_by='user', only_new='N'):
        if page_size is None:
            page_size = 60
        limit = page_size
        offset = 0 if page is None else max(0, (page - 1) * limit)
        headers = self._with_x_device_info(dict(self.session.headers))
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
        data = {'orderBy': order_by, 'onlyNewBj': only_new, 'limit': str(limit), 'offset': str(offset)}
        try:
            r = self.session.post(f'{self.api}/v1/live', data=data, headers=headers, timeout=8)
            j = {}
            try:
                j = r.json()
            except Exception:
                pass
            if isinstance(j, dict) and isinstance(j.get('list'), list) and len(j['list']) > 0:
                return j
        except Exception:
            pass
        try:
            return self.session.get(f'{self.api}/v1/live', timeout=8).json()
        except Exception:
            return {}

    def _list_live_page(self, page, page_size, order_by='user', only_new='N'):
        j = self._list_live(page=page, page_size=page_size, order_by=order_by, only_new=only_new)
        return j.get('list', []) if isinstance(j, dict) else []

    def _list_live_aggregate(self, max_pages=5, page_size=60, min_expect=60, order_by='user', only_new='N'):
        try:
            cache_key = f'pandalive_agg_v2_{order_by}_{only_new}'
            cached = self.getCache(cache_key)
            if isinstance(cached, dict) and isinstance(cached.get('list'), list):
                return cached['list']
        except Exception:
            pass
        seen = set()
        result = []
        first = self._list_live(page=None, page_size=page_size, order_by=order_by, only_new=only_new)
        items = first.get('list', []) if isinstance(first, dict) else []
        for it in items:
            code = it.get('code') or it.get('userId')
            if code and code not in seen:
                seen.add(code)
                result.append(it)
        p = 1
        while len(result) < min_expect and p <= max_pages:
            page_items = self._list_live_page(page=p, page_size=page_size, order_by=order_by, only_new=only_new)
            added = 0
            for it in page_items:
                code = it.get('code') or it.get('userId')
                if code and code not in seen:
                    seen.add(code)
                    result.append(it)
                    added += 1
            if added == 0 and p > 1:
                break
            p += 1
        try:
            payload = {"expiresAt": int(time.time()) + 20, "list": result}
            self.setCache(f'pandalive_agg_v2_{order_by}_{only_new}', payload)
        except Exception:
            pass
        return result

    # ========== 辅助：从 play_id 中提取纯数字 userId ==========
    def _extract_user_id(self, play_id):
        """
        输入: "24431142_202605278af8938c38d84183" 或 "24431142"
        输出: "24431142"
        """
        if not play_id:
            return ''
        # 取下划线之前的部分
        parts = str(play_id).split('_', 1)
        user_part = parts[0]
        # 如果第一部分是纯数字，返回它；否则返回原字符串（保持兼容）
        if user_part.isdigit():
            return user_part
        return play_id

    # ========== 修改：_live_play 接收 userId，并打印请求 URL ==========
    def _live_play(self, user_id):
        """获取直播流地址，返回完整 JSON，user_id 应为纯数字"""
        if not user_id:
            return {'result': False, 'error': 'empty user_id'}
        headers = self._with_x_device_info(dict(self.session.headers))
        headers['Referer'] = f'{self.base}/play/{user_id}'
        params = {
            'userId': user_id,
            'action': 'watch'
        }
        # 构造完整 URL 用于调试打印
        full_url = f"{self.api}/v1/live/play"
        print(f"[DEBUG] API 请求 URL: {full_url}")
        print(f"[DEBUG] 请求参数: {params}")
        try:
            r = self.session.get(full_url, headers=headers, params=params, timeout=8)
            print(f"[DEBUG] API 响应状态码: {r.status_code}")
            if r.status_code != 200:
                # 尝试刷新 token 后重试
                print("[DEBUG] 状态码非200，尝试刷新 token")
                self._app_token()
                r = self.session.get(full_url, headers=headers, params=params, timeout=8)
                print(f"[DEBUG] 重试后状态码: {r.status_code}")
            return r.json()
        except Exception as e:
            print(f"[DEBUG] API 请求异常: {e}")
            return {'result': False, 'error': str(e)}

    def _with_x_device_info(self, headers):
        try:
            headers['x-device-info'] = json.dumps(self.x_device_info, separators=(',', ':'))
        except Exception:
            headers['x-device-info'] = '{"t":"webPc","v":"1.0","ui":"0","ck":{"sessKeyAsp":""}}'
        return headers

    def homeContent(self, filter):
        classes = [
            {"type_name": "全部直播", "type_id": "live"},
            {"type_name": "新人主播", "type_id": "live_newbj"},
            {"type_name": "热门直播", "type_id": "live_hot"},
            {"type_name": "最新开播", "type_id": "live_new"},
            {"type_name": "个人", "type_id": "cat_ind"},
            {"type_name": "音乐", "type_id": "cat_music"},
            {"type_name": "游戏", "type_id": "cat_game"},
            {"type_name": "聊天", "type_id": "cat_talk"},
            {"type_name": "其他", "type_id": "cat_etc"},
            {"type_name": "成人", "type_id": "cat_adt"}
        ]
        if filter:
            filters = {
                "live": [
                    {"key": "sort", "name": "排序", "value": [
                        {"n": "观看人数", "v": "user-N"},
                        {"n": "热门", "v": "hot-N"},
                        {"n": "最新", "v": "new-N"},
                        {"n": "新人", "v": "user-Y"}
                    ]},
                    {"key": "cat", "name": "分类", "value": [
                        {"n": "全部", "v": ""},
                        {"n": "个人", "v": "ind"},
                        {"n": "音乐", "v": "music"},
                        {"n": "游戏", "v": "game"},
                        {"n": "聊天", "v": "talk"},
                        {"n": "其他", "v": "etc"},
                        {"n": "成人", "v": "adt"}
                    ]},
                    {"key": "live", "name": "直播类型", "value": [
                        {"n": "全部", "v": ""},
                        {"n": "普通直播", "v": "live"},
                        {"n": "嘉宾直播", "v": "guest"}
                    ]},
                    {"key": "device", "name": "设备", "value": [
                        {"n": "全部", "v": ""},
                        {"n": "网页", "v": "web"},
                        {"n": "安卓", "v": "android"},
                        {"n": "苹果", "v": "ios"}
                    ]}
                ]
            }
            for tid in ['live_newbj', 'live_hot', 'live_new', 'cat_ind', 'cat_music', 'cat_game', 'cat_talk', 'cat_etc', 'cat_adt']:
                filters[tid] = filters['live']
        else:
            filters = {}
        return {"class": classes, "filters": filters}

    def homeVideoContent(self):
        items = self._list_live_aggregate(max_pages=3, page_size=60, min_expect=48, order_by='user', only_new='N')
        if not items:
            items = (self._list_live().get('list', []))
        return {"list": [self._to_vod(it) for it in items[:48]]}

    def categoryContent(self, tid, pg, filter, extend):
        page_size = 24
        p = 1
        try:
            p = int(pg)
        except Exception:
            pass
        order_by, only_new = self._tid_to_sort(tid)
        cat, live_type, device = self._tid_to_filters(tid)
        try:
            if isinstance(extend, str):
                try:
                    extend = json.loads(extend) if extend.strip().startswith('{') else {}
                except Exception:
                    extend = {}
            if isinstance(extend, dict):
                s = extend.get('sort')
                if isinstance(s, str) and '-' in s:
                    ab = s.split('-', 1)
                    if len(ab) == 2:
                        order_by, only_new = (ab[0] or order_by), (ab[1] or only_new)
                cat = extend.get('cat', cat) or cat
                live_type = extend.get('live', live_type) or live_type
                device = extend.get('device', device) or device
        except Exception:
            pass

        # PandaLive 服务端实测只稳定支持 orderBy/onlyNewBj/limit/offset。
        # category/browser/liveType 等维度接口会忽略，所以这里采用“多页拉取 + 本地过滤”。
        need_local_filter = bool(cat or live_type or device)
        if not need_local_filter:
            server_items = self._list_live_page(page=p, page_size=page_size, order_by=order_by, only_new=only_new)
            if len(server_items) >= page_size:
                return {"page": p, "pagecount": 99999, "limit": page_size, "total": 999999, "list": [self._to_vod(it) for it in server_items]}

        all_items = self._list_live_aggregate(max_pages=15, page_size=100, min_expect=180, order_by=order_by, only_new=only_new)
        all_items = self._filter_items(all_items, cat=cat, live_type=live_type, device=device)
        total = len(all_items)
        if total <= 0:
            return {"page": p, "pagecount": 1, "limit": page_size, "total": 0, "list": []}
        start = (p - 1) * page_size
        end = start + page_size
        part = all_items[start:end]
        return {
            "page": p,
            "pagecount": max(1, (total + page_size - 1) // page_size),
            "limit": page_size,
            "total": total,
            "list": [self._to_vod(it) for it in part]
        }

    def _tid_to_sort(self, tid):
        t = (tid or '').lower()
        if t == 'live_newbj':
            return 'user', 'Y'
        if t == 'live_hot':
            return 'hot', 'N'
        if t == 'live_new':
            return 'new', 'N'
        return 'user', 'N'

    def _tid_to_filters(self, tid):
        t = (tid or '').lower()
        if t.startswith('cat_'):
            return t.replace('cat_', '', 1), '', ''
        return '', '', ''

    def _filter_items(self, items, cat='', live_type='', device=''):
        result = []
        seen = set()
        for it in items or []:
            try:
                if cat and str(it.get('category', '')).lower() != str(cat).lower():
                    continue
                if device and str(it.get('browser', '')).lower() != str(device).lower():
                    continue
                if live_type:
                    if live_type == 'guest':
                        if str(it.get('isGuestLive', 'N')).upper() != 'Y':
                            continue
                    elif str(it.get('liveType', '')).lower() != str(live_type).lower():
                        continue
                code = it.get('code') or it.get('userId') or json.dumps(it, ensure_ascii=False)
                if code in seen:
                    continue
                seen.add(code)
                result.append(it)
            except Exception:
                continue
        return result

    # ========== detailContent 打印详情页链接，并确保 vod_id 正确 ==========
    def detailContent(self, ids):
        vid = ids[0]
        parts = vid.split('|')
        play_id = parts[0]          # 可能是 "24431142_xxx" 或 "24431142"
        user_id = parts[1] if len(parts) > 1 else self._extract_user_id(play_id)
        title = parts[2] if len(parts) > 2 else user_id

        # 调试：打印详情页链接（即播放页面链接，这里用原始 play_id 构造）
        detail_url = f"{self.base}/play/{play_id}"
        print(f"[DEBUG] 详情页链接: {detail_url}")

        vod = {
            "vod_id": vid,          # 保持原样，内部可能包含完整 play_id
            "vod_name": title,
            "vod_pic": "",
            "type_name": "LIVE",
            "vod_year": "",
            "vod_area": "",
            "vod_remarks": "PandaLive",
            "vod_actor": "",
            "vod_director": "",
            "vod_content": title,
            "vod_play_from": "IVS",
            "vod_play_url": f"直播${vid}"
        }
        return {"list": [vod]}

    def searchContent(self, key, quick, pg="1"):
        items = self._list_live().get('list', [])
        key_l = key.lower()
        result = []
        for it in items:
            title = str(it.get('title', ''))
            user_id = str(it.get('userId', ''))
            user_nick = str(it.get('userNick', ''))
            if key_l in title.lower() or key_l in user_id.lower() or key_l in user_nick.lower():
                result.append(self._to_vod(it))
        return {"list": result, "page": 1}

    # ========== playerContent 提取直链并打印 ==========
    def playerContent(self, flag, id, vipFlags):
        try:
            vid = id
            parts = vid.split('|')
            play_id = parts[0]          # 可能是 "24431142_xxx" 或 "24431142"
            # 提取纯数字 userId
            user_id = self._extract_user_id(play_id)
            print(f"[DEBUG] 原始 play_id: {play_id}")
            print(f"[DEBUG] 提取的 user_id: {user_id}")

            # 调用 API 获取直播信息
            data = self._live_play(user_id)
            print(f"[DEBUG] 直播 API 返回数据预览: {json.dumps(data, ensure_ascii=False)[:500]}...")
            channel = str(data.get('channel') or self._extract_user_idx_from_play(data) or user_id)
            token = str(data.get('token') or '')
            self.start_danmu(channel, token, data)
            danmaku_url = self.getProxyUrl() + '&type=danmu&channel=' + channel

            # 提取 m3u8 地址
            m3u8 = self._extract_m3u8_from_play(data)
            if m3u8:
                print(f"[DEBUG] 获取到直链播放地址: {m3u8}")
                return {
                    "parse": 0,
                    "playUrl": "",
                    "url": m3u8,
                    "header": self._play_headers(),
                    "danmaku": danmaku_url
                }
            else:
                print("[DEBUG] 未获取到直链，使用嗅探模式")
                return {
                    "parse": 1,
                    "playUrl": "",
                    "url": f"{self.base}/play/{play_id}",
                    "header": self._play_headers(),
                    "danmaku": danmaku_url
                }
        except Exception as e:
            print(f"[DEBUG] playerContent 异常: {e}")
            return {
                "parse": 1,
                "playUrl": "",
                "url": f"{self.base}",
                "header": self._play_headers()
            }

    def liveContent(self, url):
        """直播入口（如直接调用）"""
        try:
            # 假定传入的 url 可能是 play_id 或 user_id
            user_id = self._extract_user_id(url)
            print(f"[DEBUG] liveContent 提取 user_id: {user_id}")
            data = self._live_play(user_id)
            m3u8 = self._extract_m3u8_from_play(data)
            if m3u8:
                print(f"[DEBUG] liveContent 获取直链: {m3u8}")
                return {"parse": 0, "url": m3u8, "header": self._play_headers()}
        except Exception:
            pass
        print("[DEBUG] liveContent 回退嗅探")
        return {"parse": 1, "url": f"{self.base}/play/{url}", "header": self._play_headers()}

    def localProxy(self, param):
        action = param.get('action') if isinstance(param, dict) else None
        ptype = param.get('type') if isinstance(param, dict) else None
        if ptype == 'danmu':
            channel = param.get('channel', '')
            print(f"[DEBUG] localProxy弹幕请求: channel={channel} param={param}")
            return self.proxy_danmu(channel)
        if action == 'play':
            play_id = param.get('play_id', '')
            user_id = self._extract_user_id(play_id)
            j = self._live_play(user_id)
            m3u8 = self._extract_m3u8_from_play(j)
            if m3u8:
                return self._redirect(m3u8)
        return None

    # ========== 实时弹幕：PandaLive Centrifugo WS + FongMi 弹幕 API ==========
    def start_danmu(self, channel, token='', play_data=None):
        try:
            channel = str(channel or '')
            token = str(token or '')
            if not channel:
                return
            with self.danmu_lock:
                if channel not in self.danmu_cache:
                    self.danmu_cache[channel] = []
                self._append_danmu_locked(channel, 'PandaLive', '弹幕通道初始化，等待实时聊天')
                for msg in self._extract_enter_chats(play_data):
                    self._append_danmu_locked(channel, msg.get('user', 'PandaLive'), msg.get('text', '进入直播间'))
                if channel in self.danmu_threads:
                    return
            self.refresh_danmaku(channel)
            try:
                threading.Thread(target=self._delayed_refresh_danmaku, args=(channel,), daemon=True).start()
            except Exception:
                pass
            t = threading.Thread(target=self._danmu_worker, args=(channel, token), daemon=True)
            with self.danmu_lock:
                self.danmu_threads[channel] = t
            t.start()
            print(f"[DEBUG] 弹幕线程启动: channel={channel} token={'有' if token else '无'}")
        except Exception as e:
            print(f"[DEBUG] 弹幕启动失败: {e}")

    def _danmu_worker(self, channel, token):
        last_count = None
        ws = None
        try:
            # 先用 HTTP 轻量接口放一条真实状态弹幕，确认 FongMi 弹幕通道可用
            count = self._chat_user_count(channel, token)
            if count is not None:
                last_count = count
                text = f'当前聊天室 {count} 人在线'
                with self.danmu_lock:
                    self._append_danmu_locked(channel, 'PandaLive', text)
                self.send_live_danmaku(text)
                print(f"[DEBUG] 弹幕轮询更新: {channel} 在线{count}")

            if not token:
                print(f"[DEBUG] 弹幕WS跳过: {channel} 无token")
                return

            ws = self._ws_connect()
            self._ws_send_json(ws, {'id': 1, 'method': 0, 'params': {'token': token, 'name': 'js', 'version': ''}})
            ok = False
            start = time.time()
            while time.time() - start < 8:
                op, data = self._ws_recv_frame(ws)
                if op == 9:
                    self._ws_send_frame(ws, 10, data)
                    continue
                if op == 1 and data:
                    text = data.decode('utf-8', 'ignore')
                    print(f"[DEBUG] 弹幕WS连接返回: {text[:200]}")
                    if '"result"' in text and '"client"' in text:
                        ok = True
                        break
                    if '"error"' in text or 'bad request' in text:
                        break
            if not ok:
                print(f"[DEBUG] 弹幕WS连接未确认: {channel}")
                return

            self._ws_send_json(ws, {'id': 2, 'method': 1, 'params': {'channel': str(channel)}})
            sub_ok = False
            start = time.time()
            while time.time() - start < 8:
                op, data = self._ws_recv_frame(ws)
                if op == 9:
                    self._ws_send_frame(ws, 10, data)
                    continue
                if op == 1 and data:
                    text = data.decode('utf-8', 'ignore')
                    print(f"[DEBUG] 弹幕WS订阅返回: {text[:200]}")
                    if '"id":2' in text and '"result"' in text:
                        sub_ok = True
                        break
            if sub_ok:
                ok_text = 'PandaLive 聊天室已连接'
                with self.danmu_lock:
                    self._append_danmu_locked(channel, 'PandaLive', ok_text)
                self.refresh_danmaku(channel)
                self.send_live_danmaku(ok_text)
                print(f"[DEBUG] 弹幕WS订阅成功: {channel}")
            else:
                print(f"[DEBUG] 弹幕WS订阅未确认: {channel}")

            last_ping_count = time.time()
            while True:
                try:
                    op, data = self._ws_recv_frame(ws)
                    if op is None:
                        print(f"[DEBUG] 弹幕WS断开: {channel}")
                        break
                    if op == 9:
                        self._ws_send_frame(ws, 10, data)
                        continue
                    if op == 8:
                        print(f"[DEBUG] 弹幕WS关闭: {data[:200]}")
                        break
                    if op == 1 and data:
                        self._handle_ws_text(channel, data.decode('utf-8', 'ignore'))
                    # 顺带保留在线人数变化弹幕，防止房间无聊天时完全无反馈
                    if time.time() - last_ping_count > 30:
                        last_ping_count = time.time()
                        count = self._chat_user_count(channel, token)
                        if count is not None and count != last_count:
                            last_count = count
                            text = f'当前聊天室 {count} 人在线'
                            with self.danmu_lock:
                                self._append_danmu_locked(channel, 'PandaLive', text)
                            self.send_live_danmaku(text)
                            print(f"[DEBUG] 弹幕轮询更新: {channel} 在线{count}")
                except socket.timeout:
                    # 长时间无聊天是正常情况，继续监听
                    continue
                except Exception as e:
                    print(f"[DEBUG] 弹幕WS接收异常: {e}")
                    break
        except Exception as e:
            print(f"[DEBUG] 弹幕WS异常: {e}")
        finally:
            try:
                if ws:
                    ws.close()
            except Exception:
                pass
            try:
                with self.danmu_lock:
                    self.danmu_threads.pop(str(channel), None)
            except Exception:
                pass

    def _ws_connect(self):
        key = base64.b64encode(os.urandom(16)).decode()
        raw = socket.create_connection((self.ws_host, 443), timeout=10)
        sock = ssl.create_default_context().wrap_socket(raw, server_hostname=self.ws_host)
        req = (
            f'GET {self.ws_path} HTTP/1.1\r\n'
            f'Host: {self.ws_host}\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\n'
            'Sec-WebSocket-Version: 13\r\n'
            f'Origin: {self.base}\r\n'
            f'User-Agent: {self.ua}\r\n\r\n'
        )
        sock.sendall(req.encode('utf-8'))
        resp = b''
        while b'\r\n\r\n' not in resp:
            chunk = sock.recv(4096)
            if not chunk:
                break
            resp += chunk
        head = resp.decode('utf-8', 'ignore')
        if '101 Switching Protocols' not in head:
            raise Exception('WS握手失败: ' + head[:160])
        sock.settimeout(60)
        return sock

    def _ws_send_frame(self, sock, opcode, payload=b''):
        try:
            if isinstance(payload, str):
                payload = payload.encode('utf-8')
            header = bytearray([0x80 | opcode])
            length = len(payload)
            if length < 126:
                header.append(0x80 | length)
            elif length < 65536:
                header.append(0x80 | 126)
                header += struct.pack('!H', length)
            else:
                header.append(0x80 | 127)
                header += struct.pack('!Q', length)
            mask = os.urandom(4)
            header += mask
            masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            sock.sendall(header + masked)
        except Exception as e:
            raise e

    def _ws_send_json(self, sock, obj):
        # Centrifugo JSON protocol：每条命令是 JSON + 换行
        self._ws_send_frame(sock, 1, json.dumps(obj, separators=(',', ':')) + '\n')

    def _ws_recv_frame(self, sock):
        h = sock.recv(2)
        if not h:
            return None, b''
        opcode = h[0] & 0x0F
        length = h[1] & 0x7F
        if length == 126:
            length = struct.unpack('!H', self._recv_all(sock, 2))[0]
        elif length == 127:
            length = struct.unpack('!Q', self._recv_all(sock, 8))[0]
        masked = h[1] & 0x80
        if masked:
            mask = self._recv_all(sock, 4)
            data = self._recv_all(sock, length)
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        else:
            data = self._recv_all(sock, length)
        return opcode, data

    def _recv_all(self, sock, n):
        data = b''
        while len(data) < n:
            chunk = sock.recv(n - len(data))
            if not chunk:
                break
            data += chunk
        return data

    def _handle_ws_text(self, channel, text):
        if not text:
            return
        for line in text.split('\n'):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            for msg in self._extract_ws_messages(obj):
                user = msg.get('user') or 'PandaLive'
                content = msg.get('text') or ''
                if not content:
                    continue
                with self.danmu_lock:
                    before = len(self.danmu_cache.get(channel, []))
                    self._append_danmu_locked(channel, user, content)
                    after = len(self.danmu_cache.get(channel, []))
                if after > before:
                    show = f'{user}: {content}' if user else content
                    self.send_live_danmaku(show)
                    print(f"[DEBUG] 实时弹幕: {show[:120]}")

    def _extract_ws_messages(self, obj):
        result = []
        try:
            # Centrifugo push: {push:{channel, pub:{data:{...}}}}
            data = obj
            if isinstance(obj, dict):
                if isinstance(obj.get('push'), dict):
                    push = obj.get('push') or {}
                    pub = push.get('pub') or push.get('publication') or {}
                    data = pub.get('data') or push.get('data') or pub
                elif isinstance(obj.get('result'), dict) and isinstance(obj['result'].get('data'), dict):
                    data = obj['result'].get('data')
            candidates = []
            self._collect_message_candidates(data, candidates)
            for it in candidates:
                msg = self._normalize_chat_message(it)
                if msg:
                    result.append(msg)
        except Exception as e:
            print(f"[DEBUG] WS弹幕解析失败: {e}")
        return result

    def _collect_message_candidates(self, data, out):
        if isinstance(data, str):
            s = data.strip()
            if not s:
                return
            try:
                self._collect_message_candidates(json.loads(s), out)
            except Exception:
                out.append({'message': s})
            return
        if isinstance(data, list):
            for x in data:
                self._collect_message_candidates(x, out)
            return
        if isinstance(data, dict):
            if any(k in data for k in ['message', 'msg', 'text', 'content', 'chat', 'nick', 'userNick', 'nickname']):
                out.append(data)
            for k in ['data', 'message', 'msg', 'payload', 'body', 'chatMessage']:
                v = data.get(k)
                if isinstance(v, (dict, list, str)):
                    self._collect_message_candidates(v, out)

    def _normalize_chat_message(self, it):
        try:
            if not isinstance(it, dict):
                return None
            text = it.get('message') or it.get('msg') or it.get('text') or it.get('content') or it.get('chat') or ''
            if isinstance(text, dict):
                return self._normalize_chat_message(text)
            text = str(text or '').strip()
            if not text:
                return None
            # 过滤系统/打赏/控制类字段，保留普通聊天
            if len(text) > 180:
                text = text[:180]
            user = it.get('userNick') or it.get('nickname') or it.get('nick') or it.get('name') or it.get('userId') or it.get('uid') or ''
            if isinstance(user, dict):
                user = user.get('nick') or user.get('userNick') or user.get('name') or ''
            user = str(user or '').strip()
            return {'user': user or 'PandaLive', 'text': text}
        except Exception:
            return None

    def _chat_user_count(self, channel, token=''):
        try:
            if not channel:
                return None
            headers = self._with_x_device_info(dict(self.session.headers))
            params = {'channel': channel}
            if token:
                params['token'] = token
            r = self.session.get(f'{self.api}/v1/chat/channel_user_count', headers=headers, params=params, timeout=6)
            j = r.json()
            if isinstance(j, dict) and j.get('result') is True:
                return j.get('count')
        except Exception:
            pass
        return None

    def _extract_enter_chats(self, data):
        result = []
        try:
            arr = (data or {}).get('enterChat') or []
            if isinstance(arr, list):
                for it in arr[:20]:
                    if not isinstance(it, dict):
                        continue
                    user = it.get('userNick') or it.get('nick') or it.get('userId') or 'PandaLive'
                    text = it.get('message') or it.get('msg') or it.get('text') or '进入直播间'
                    result.append({'user': user, 'text': text})
        except Exception:
            pass
        return result

    def _append_danmu_locked(self, channel, user, text):
        if not text:
            return
        item = {'time': int(time.time()), 'user': str(user or ''), 'text': str(text or '')}
        key = f"{channel}:{item['user']}:{item['text']}"
        if key in self.danmu_sent:
            return
        self.danmu_sent.add(key)
        if len(self.danmu_sent) > 1200:
            self.danmu_sent = set(list(self.danmu_sent)[-600:])
        self.danmu_cache.setdefault(channel, []).append(item)
        self.danmu_cache[channel] = self.danmu_cache[channel][-200:]

    def _delayed_refresh_danmaku(self, channel):
        # FongMi 播放器有时比 playerContent 返回慢，延迟多刷新几次，避免 XML 没被加载
        for sec in [1.5, 4, 8]:
            try:
                time.sleep(sec)
                self.refresh_danmaku(channel)
            except Exception:
                pass

    def _action_bases(self):
        bases = []
        try:
            proxy = self.getProxyUrl()
            m = re.search(r'^(https?://127\.0\.0\.1:\d+)', proxy)
            if m:
                bases.append(m.group(1))
        except Exception:
            pass
        # FongMi 文档常用 9978，但部分壳/本地 Python 代理实际是 9979，以 getProxyUrl 为准优先。
        for b in ['http://127.0.0.1:9978', 'http://127.0.0.1:9979']:
            if b not in bases:
                bases.append(b)
        return bases

    def _call_action(self, query, timeout=0.8):
        last_err = None
        for base in self._action_bases():
            url = base + '/action?' + query
            try:
                # 优先用 Spider.fetch；部分壳里 fetch 比 requests 更适合访问本地 action。
                if hasattr(self, 'fetch'):
                    try:
                        self.fetch(url)
                        return True, base, 'fetch'
                    except Exception as e:
                        last_err = e
                r = requests.get(url, timeout=timeout)
                return True, base, getattr(r, 'status_code', '')
            except Exception as e:
                last_err = e
                continue
        return False, '', str(last_err)

    def refresh_danmaku(self, channel):
        try:
            path = self.getProxyUrl() + '&type=danmu&channel=' + str(channel)
            query = 'do=refresh&type=danmaku&path=' + quote(path, safe='')
            ok, base, info = self._call_action(query)
            if ok:
                print(f"[DEBUG] 弹幕XML刷新: {channel} base={base} status={info}")
            else:
                print(f"[DEBUG] 弹幕XML刷新失败: {info}")
        except Exception as e:
            print(f"[DEBUG] 弹幕XML刷新失败: {e}")

    def send_live_danmaku(self, text):
        try:
            if not text:
                return
            query = 'do=danmaku&text=' + quote(str(text), safe='')
            ok, base, info = self._call_action(query)
            if ok:
                print(f"[DEBUG] 实时弹幕发送: {str(text)[:80]} base={base} status={info}")
            else:
                print(f"[DEBUG] 实时弹幕发送失败: {info}")
        except Exception as e:
            print(f"[DEBUG] 实时弹幕发送失败: {e}")

    def proxy_danmu(self, channel):
        try:
            channel = str(channel or '')
            with self.danmu_lock:
                items = list(self.danmu_cache.get(channel, []))[-200:]
            xml = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<i>',
                '\t<chatserver>chat.pandalive.local</chatserver>',
                '\t<chatid>88888888</chatid>',
                '\t<mission>0</mission>',
                '\t<maxlimit>99999</maxlimit>',
                '\t<state>0</state>',
                '\t<real_name>0</real_name>',
                '\t<source>pandalive</source>'
            ]
            if not items:
                items = [{'time': int(time.time()), 'user': 'PandaLive', 'text': '弹幕XML已加载，等待实时聊天'}]
            xml.append(f'\t<d p="1,5,25,16711680,{int(time.time())},0,0,0">{self.xml_escape("共有%d条弹幕来袭！！！" % len(items))}</d>')

            # 直播流里 XML 加载时机可能晚于 0 秒，0~几秒的弹幕容易被错过。
            # 这里把最近几条弹幕铺到后续时间轴，确认播放器能持续看到。
            out_count = 0
            base_items = items[-30:]
            for i, item in enumerate(base_items):
                text = self.xml_escape((str(item.get('user','')) + ': ' if item.get('user') else '') + str(item.get('text','')))
                color = '16777215' if random.random() > 0.1 else str(random.randint(0, 0xFFFFFF))
                ts = 2 + i * 2
                p = f'{round(ts,1)},1,25,{color},{int(item.get("time", time.time()))},0,0,0'
                xml.append(f'\t<d p="{p}">{text}</d>')
                out_count += 1

            # 调试兜底：如果真实消息少，额外重复几条到未来 2 分钟，避免直播播放器错过时间点。
            if len(base_items) <= 5:
                seed = base_items[-1] if base_items else {'user': 'PandaLive', 'text': '弹幕测试'}
                text = self.xml_escape((str(seed.get('user','')) + ': ' if seed.get('user') else '') + str(seed.get('text','')))
                for n, ts in enumerate(range(8, 128, 8)):
                    p = f'{ts},1,25,16776960,{int(time.time())},0,0,0'
                    xml.append(f'\t<d p="{p}">{text}</d>')
                    out_count += 1

            xml.append('</i>')
            print(f"[DEBUG] 弹幕XML输出: {channel} cache={len(items)} xml={out_count}条")
            return [200, 'application/xml; charset=utf-8', '\n'.join(xml)]
        except Exception as e:
            print(f"[DEBUG] 弹幕输出失败: {e}")
            return [200, 'application/xml; charset=utf-8', '<?xml version="1.0" encoding="UTF-8"?><i></i>']

    def xml_escape(self, text):
        text = str(text or '')
        return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    def _extract_user_idx_from_play(self, data):
        try:
            media = (data or {}).get('media') or {}
            v = media.get('userIdx') or media.get('channel')
            return str(v or '')
        except Exception:
            return ''

    # ========== 辅助方法：从 API 响应中提取 m3u8 ==========
    def _extract_m3u8_from_play(self, data):
        """从 /v1/live/play 的 JSON 响应中提取第一个有效的 m3u8 地址"""
        try:
            # 优先取 PlayList.hls[0].url
            play_list = data.get('PlayList', {})
            for key in ['hls', 'hls2', 'hls3']:
                streams = play_list.get(key, [])
                if streams and isinstance(streams, list) and len(streams) > 0:
                    url = streams[0].get('url')
                    if url and url.startswith('http'):
                        return url
            # 如果 PlayList 结构异常，尝试正则全局查找 m3u8
            text = json.dumps(data, ensure_ascii=False)
            m = re.search(r'https?://[^\s"\\]+\.m3u8[^\s"\\]*', text)
            if m:
                return m.group(0)
        except Exception:
            pass
        return ''

    def _redirect(self, url):
        return {"code": 302, "headers": {"Location": url}}

    def _play_headers(self):
        """播放时携带的防盗链 headers"""
        headers = {
            'User-Agent': self.ua,
            'Referer': self.base + '/',
            'Origin': self.base
        }
        if self.extra_cookie:
            headers['Cookie'] = self.extra_cookie
        return headers

    def _to_vod(self, it):
        title = it.get('title') or it.get('userNick') or it.get('userId') or 'LIVE'
        pic = it.get('thumbUrl') or it.get('ivsThumbnail') or ''
        user_id = it.get('userId', '')
        play_id = it.get('code', user_id)
        vod_id = f"{play_id}|{user_id}|{title}"
        remarks = f"观众 {it.get('user', 0)} | 点赞 {it.get('likeCnt', 0)}"
        return {
            'vod_id': vod_id,
            'vod_name': title,
            'vod_pic': pic,
            'vod_remarks': remarks
        }