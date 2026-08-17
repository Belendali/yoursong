#!/usr/bin/env python3
"""Freeze the songs listing for static hosting.

serve.py answers /songs.json live from assets/songs. GitHub Pages cannot, so
this writes the same payload to assets/songs/index.json — the page falls back
to it. Run it after adding or retiming a track:

    python3 tools/index-songs.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from serve import AUDIO, SONGS, lyrics_for  # noqa: E402

names = sorted(f for f in os.listdir(SONGS) if f.lower().endswith(AUDIO))
songs = [
    {
        "file": name,
        "slug": os.path.splitext(name)[0],
        "lyrics": lyrics_for(os.path.splitext(name)[0], os.path.join(SONGS, name)),
    }
    for name in names
]

out = os.path.join(SONGS, "index.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(songs, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"{len(songs)} song(s) → {os.path.relpath(out, ROOT)}")
for s in songs:
    print(f"  {s['slug']}: {len(s['lyrics'])} lines")
