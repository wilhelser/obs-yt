# OBS "Now Playing" YouTube Overlay

A small OBS Browser Source overlay that shows the channel avatar, channel
name, and video title of whatever YouTube video is currently loaded in a
Browser Source elsewhere in your OBS scene collection. It's clickable (opens
the video) and adapts its layout for both horizontal (16:9) and vertical
(9:16) canvases.

- No build step — plain HTML/CSS/JS loaded as classic `<script>` tags.
- No backend/server — runs entirely inside the OBS Browser Source (or any
  browser tab, for configuration/preview).
- Detects the active video automatically via `obs-websocket` v5; no manual
  "now playing" input needed beyond initial setup.

## How it works

1. `overlay/js/obs.js` connects to your running OBS instance over
   `obs-websocket` v5 and looks at every Browser Source input. It matches
   each one's URL against YouTube watch/embed/shorts patterns, then
   cross-checks that the matching source is an **enabled scene item in the
   current program scene** (so it ignores hidden/muted sources). It reacts
   to `InputSettingsChanged`, `CurrentProgramSceneChanged`, and
   `SceneItemEnableStateChanged` events, with a polling fallback.
2. `overlay/js/youtube.js` calls the YouTube Data API v3 (`videos.list`,
   `channels.list`) to fetch the video title, channel name, and channel
   avatar for the detected video ID.
3. `overlay/js/main.js` wires the two together and shows/hides/updates the
   `#now-playing` element, and toggles `.horizontal` / `.vertical` layout
   classes on `<body>` based on the current viewport aspect ratio.

Only the **top-level** scene items of the current program scene are checked
for visibility — sources nested inside groups aren't currently supported. If
multiple YouTube Browser Sources are visible at once, the first match (in
scene-item order) wins.

## Setup

### 1. Enable obs-websocket

In OBS: **Tools → obs-websocket Settings**. Enable the server, note the port
(default `4455`) and password (if you set one).

### 2. Get a YouTube Data API v3 key

Create a project in the [Google Cloud Console](https://console.cloud.google.com/),
enable the **YouTube Data API v3**, and create an API key. The free quota
(10,000 units/day) is more than enough for this overlay — each poll/event
only costs 2 `list` requests when the video actually changes (cached
otherwise).

### 3. Clone and configure

```sh
git clone <this-repo-url>
cd obs-yt
```

Open `overlay/index.html` directly in a normal browser tab (`file://` works
fine). Click the gear icon (or press `s`) to open the settings panel and
fill in:

- **obs-websocket URL** — e.g. `ws://127.0.0.1:4455`
- **obs-websocket Password** — leave blank if auth is disabled
- **YouTube Data API v3 Key**
- **Poll Interval (ms)** — fallback poll interval, default `2000`
- **Source Name Filter** — optional substring to restrict which Browser
  Source(s) are watched (leave blank to watch all of them)

Settings are saved to `localStorage`, scoped to wherever `index.html` is
served from.

### 4. Add it to OBS

Add a new **Browser Source** in OBS pointing at the local path to
`overlay/index.html` (or a local static server URL, if you prefer). Size it
to match your canvas; the layout adapts automatically based on the Browser
Source's width/height.

The settings gear is small and positioned in a corner, but if you'd rather
it never appears on stream, configure the overlay once via a normal browser
tab (step 3) before adding it to OBS — the gear only matters for changing
settings, not for the overlay's normal operation.

## Development

`overlay/test.html` runs the same overlay against a **mock** OBS/YouTube
backend (`overlay/js/mock.js`) instead of a real OBS connection or live
network calls — open it directly in a browser. It loads with a fake
obs-websocket URL and a seeded fake API key, and provides on-page buttons to:

- Switch between 3 sample YouTube videos (each with a distinct placeholder
  avatar/channel)
- Show/hide the simulated Browser Source (toggles scene item visibility)
- Switch between a scene that contains the source and an empty scene (to
  simulate the source disappearing when you cut away)

`overlay/test.html` is dev/test-only — do not add it as an OBS Browser
Source.

## Project structure

```
overlay/
  index.html         Real overlay — add this to OBS as a Browser Source
  test.html           Dev-only harness, backed by js/mock.js
  css/style.css        Horizontal/vertical layouts, settings panel styling
  js/settings.js       localStorage-backed settings + settings panel wiring
  js/obs.js             obs-websocket connection + active-source detection
  js/youtube.js        YouTube Data API v3 lookups, with caching
  js/main.js            Orchestration + responsive layout switching
  js/mock.js             Fake OBSWebSocket + fetch() for test.html
  vendor/obs-websocket-js.js   Vendored obs-websocket-js v5.0.6 (global build)
```

## Known limitations

- Only top-level scene items are checked for visibility (no nested
  groups/scenes).
- No support for non-YouTube video platforms.
- Detects which video URL is loaded, not playback position/pause state.

## License

MIT — see [LICENSE](LICENSE).
