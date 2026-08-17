#!/usr/bin/env python3
"""Static server for the YOURSONG landing page.

Plain http.server lets the browser cache ES modules, which silently serves
stale code after an edit — so every response goes out as no-store.
"""
import functools
import http.server
import os
import socketserver

PORT = int(os.environ.get("PORT", "8480"))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console readable
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), functools.partial(Handler, directory=ROOT)) as httpd:
        print(f"yoursong → http://localhost:{PORT}")
        httpd.serve_forever()
