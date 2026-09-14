#!/usr/bin/env python3
"""
本地开发服务器：静态托管 planb-web，并把 /api/* 转发到后端。

这样网页与接口同源，config.js 的 apiBase 保持留空即可，不需要为本地调试改配置，
也不会触发跨域。正式部署请用 Nginx 等按同样的方式反向代理 /api。

用法：
    python3 dev-server.py                      # 网页 4555，后端 http://127.0.0.1:4556
    python3 dev-server.py 4555 http://后端地址   # 自定义端口与后端
"""

import http.server
import os
import sys
import urllib.error
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4555
BACKEND = (sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:4556').rstrip('/')
ROOT = os.path.dirname(os.path.abspath(__file__))
HOP_BY_HOP = {'connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length'}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        self.proxy_or_static('GET')

    def do_POST(self):
        self.proxy_or_static('POST')

    def do_PUT(self):
        self.proxy_or_static('PUT')

    def do_DELETE(self):
        self.proxy_or_static('DELETE')

    def proxy_or_static(self, method):
        if not self.path.startswith('/api/'):
            if method == 'GET':
                super().do_GET()
            else:
                self.send_error(405)
            return
        self.proxy(method)

    def proxy(self, method):
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else None
        request = urllib.request.Request(BACKEND + self.path, data=body, method=method)
        for name, value in self.headers.items():
            if name.lower() not in HOP_BY_HOP and name.lower() != 'host':
                request.add_header(name, value)
        try:
            with urllib.request.urlopen(request) as response:
                self.relay(response.status, response.headers, response.read())
        except urllib.error.HTTPError as error:
            self.relay(error.code, error.headers, error.read())
        except urllib.error.URLError as error:
            self.send_error(502, f'backend unreachable: {error.reason}')

    def relay(self, status, headers, payload):
        self.send_response(status)
        for name, value in headers.items():
            if name.lower() not in HOP_BY_HOP:
                self.send_header(name, value)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def end_headers(self):
        # 本地调试关掉缓存，改完刷新即可生效
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    print(f'planb-web  http://127.0.0.1:{PORT}   →  api {BACKEND}')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
