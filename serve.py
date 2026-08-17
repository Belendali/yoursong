#!/usr/bin/env python3
"""Static server for the YOURSONG landing page.

Plain http.server lets the browser cache ES modules, which silently serves
stale code after an edit — so every response goes out as no-store.
"""
import functools
import http.server
import json
import os
import socketserver

PORT = int(os.environ.get("PORT", "8480"))
ROOT = os.path.dirname(os.path.abspath(__file__))
SONGS = os.path.join(ROOT, "assets", "songs")
AUDIO = (".mp3", ".m4a", ".wav", ".ogg")


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # what is actually sitting in assets/songs — so dropping a file in is
        # all it takes for a record to play the real track
        if self.path.split("?")[0] == "/songs.json":
            try:
                names = sorted(f for f in os.listdir(SONGS) if f.lower().endswith(AUDIO))
            except FileNotFoundError:
                names = []
            body = json.dumps(names).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

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
