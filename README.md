# osu! Cursor Vision

Build a beatmap from your replay's cursor path — entirely in the browser, no server needed.

Drop `.osr` and `.osu` files, and get a new map where every hit object follows your actual cursor movement.

## Quick Start

**Option A — Local server (recommended):**

Windows: double-click `serve-web.bat`, then open `http://localhost:8000`

Or with Python:
```bash
python -m http.server 8000 --directory web
```

**Option B — Open directly:**

Double-click `index.html`. If LZMA fails to load, use a local server instead.

## Usage

1. Drop or select a `.osr` replay file and its matching `.osu` beatmap
2. Adjust settings if needed (difficulty name suffix, health, score, etc.)
3. Click **Convert**
4. Download the generated `.osu` and `.osr` files

Open the new `.osu` in the editor to see the result.

## How It Works

The tool reads the cursor path from a replay file, then rebuilds every hit object (circles and sliders) to follow that path. Circles are placed at the cursor position at their timestamp. Sliders are resampled as Bezier curves that trace the cursor movement over their duration. Spinners remain centered. Replay mods like HR are applied automatically.

A matching `.osr` replay is generated with perfect score metadata so the map can be previewed in-game.

## Project Structure

```
index.html          Single-page app entry point
css/style.css       Layout and dark theme
js/main.js          UI logic, drag-and-drop, conversion flow
js/util.js          Binary read/write helpers for .osr format
js/md5.js           MD5 hashing for beatmap matching
js/replay-parser.js Parse .osr replays (LZMA decompression)
js/osu-parser.js    Parse .osu beatmaps
js/cursor-path.js   Cursor path interpolation and clamping
js/map-adapter.js   Rebuild hit objects from cursor path
js/osu-writer.js    Write modified .osu content
js/replay-writer.js Build new .osr binary (LZMA compression)
js/vendor/          Third-party libraries (LZMA-JS)
```
