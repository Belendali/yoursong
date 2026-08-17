#!/usr/bin/env python3
"""Static server for the YOURSONG landing page.

Plain http.server lets the browser cache ES modules, which silently serves
stale code after an edit — so every response goes out as no-store.
"""
import functools
import http.server
import json
import os
import re
import socketserver

PORT = int(os.environ.get("PORT", "8480"))
ROOT = os.path.dirname(os.path.abspath(__file__))
SONGS = os.path.join(ROOT, "assets", "songs")
AUDIO = (".mp3", ".m4a", ".wav", ".ogg")


def id3_lyrics(path):
    """Pull the USLT (unsynchronised lyrics) frame out of an ID3v2 tag."""
    try:
        with open(path, "rb") as f:
            head = f.read(10)
            if head[:3] != b"ID3":
                return ""
            size = 0
            for b in head[6:10]:
                size = size * 128 + b
            body = f.read(size)
    except OSError:
        return ""

    i = 0
    while i < len(body) - 10:
        fid = body[i : i + 4]
        if not re.match(rb"^[A-Z0-9]{4}$", fid):
            break
        fsize = 0
        for b in body[i + 4 : i + 8]:
            fsize = fsize * 128 + b
        data = body[i + 10 : i + 10 + fsize]
        if fid == b"USLT":
            enc = data[0:1]
            text = data[4:]  # skip encoding byte + 3-char language
            codec = {b"\x00": "latin-1", b"\x01": "utf-16", b"\x02": "utf-16-be"}.get(enc, "utf-8")
            return text.decode(codec, "replace").lstrip("\x00").strip()
        i += 10 + fsize
    return ""


LRC_LINE = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)")


def lyrics_for(slug, audio_path):
    """A song's lines, timed if there is an .lrc beside it.

    .lrc  → [{t, text}] with real timings
    .txt  → untimed lines
    ID3   → untimed lines carried inside the file itself
    """
    lrc = os.path.join(SONGS, slug + ".lrc")
    if os.path.exists(lrc):
        out = []
        with open(lrc, encoding="utf-8") as f:
            for raw in f:
                m = LRC_LINE.match(raw.strip())
                if not m:
                    continue
                text = m.group(3).strip()
                if text:
                    out.append({"t": int(m.group(1)) * 60 + float(m.group(2)), "text": text})
        if out:
            return out

    txt = os.path.join(SONGS, slug + ".txt")
    raw = ""
    if os.path.exists(txt):
        with open(txt, encoding="utf-8") as f:
            raw = f.read()
    else:
        raw = id3_lyrics(audio_path)

    lines = [l.strip() for l in raw.splitlines()]
    # drop the [Verse] / [Chorus] markers — they are structure, not lyrics
    return [{"text": l} for l in lines if l and not l.startswith("[")]


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # what is actually sitting in assets/songs — so dropping a file in is
        # all it takes for a record to play the real track, lyrics included
        if self.path.split("?")[0] == "/songs.json":
            try:
                names = sorted(f for f in os.listdir(SONGS) if f.lower().endswith(AUDIO))
            except FileNotFoundError:
                names = []
            songs = []
            for name in names:
                slug = os.path.splitext(name)[0]
                songs.append(
                    {
                        "file": name,
                        "slug": slug,
                        "lyrics": lyrics_for(slug, os.path.join(SONGS, name)),
                    }
                )
            body = json.dumps(songs, ensure_ascii=False).encode()
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
