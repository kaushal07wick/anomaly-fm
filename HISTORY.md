# HISTORY

Append-only change journal for the anomaly.fm player. Like git, but for us: fast,
local, small. Each entry is an immutable changeset with an incrementing ID. Never
edit or delete a past entry — supersede a mistake with a new changeset that
references the old one. Newest entries go at the bottom.

---

## CS-000 — Baseline (vendored copy of anomaly.fm)

**What:** Captured the live site as a local, runnable copy.

- `index.html` — the full player UI, all CSS inline (retro pixel-font AM radio:
  teal speaker grille, tuning dial with AM frequency numbers, volume slider,
  live listener count).
- `station/radio-core.js` — the runtime: audio streaming, autoplay/reconnect,
  volume persistence, and station-status polling.

**Why:** Starting point for building our own personal, hostable version. On
`localhost`/`file:` the core auto-targets `https://anomaly.fm`, so the live
stream and listener feed keep working from the local copy.

---

## CS-001 — Theme system + black theme

**What:** Added a persisted theme switcher and a second palette (black),
building on CS-000.

- Refactored the palette from literal-colour variables to **semantic tokens**
  (`--surface` / `--surface-ink` / `--well` / `--well-ink` / `--accent` …). The
  original overloaded single variables for opposing roles — e.g. `--ink` was both
  a dark *surface* and *text on a light surface*, and `--cream` was both the
  device body and the card text. That only holds in one palette; inverting to a
  dark theme makes those roles collide. Splitting by role fixes it.
- **Before:** `:root` held raw colours (`--paper`, `--cream`, `--teal`, `--ink`…)
  referenced directly throughout the stylesheet; the signal read-out used a
  hard-coded `#8a7458`.
- **After:** `:root` defines the semantic tokens (values identical to the
  original, so the cream theme is pixel-for-pixel unchanged). A
  `:root[data-theme="black"]` block overrides only the tokens for the black
  palette (near-black page, graphite body, deep wells, teal accent retained).
- Added a swatch-based theme switcher below the device; choice is saved to
  `localStorage` (`anomalyfm-theme`) and re-applied before first paint to avoid a
  flash. The browser chrome colour (`<meta name="theme-color">`) updates with the
  theme.

**Why:** Groundwork for a personal, multi-theme player. Semantic tokens mean each
future theme is a small override block, not a stylesheet rewrite.

**Untouched:** All `data-radio` hooks and DOM structure, so `radio-core.js`
(audio, status, listeners) keeps working without changes.

---

## CS-002 — Theme switcher moved to a fixed top-right control

**What:** Relocated the switcher from a row under the device (CS-001) to a fixed
control in the top-right corner.

- **Before:** device and switcher lived together in a `.shell` flex column; the
  switcher sat below the device with a "THEME" label.
- **After:** removed the `.shell` wrapper (device goes back to `margin: auto` +
  its own width); the `.themes` nav is now a body-level `position: fixed`
  pill pinned top-right, backed with the themed `--surface`/`--edge`/`--shadow`
  tokens so it reads as a control on both palettes. Dropped the text label — the
  two swatches (with the active-ring) carry the meaning, and each keeps its
  `aria-label`.

**Why:** Keeps the radio the uncluttered hero while making theme-switching an
always-available affordance.


---

## CS-003 — Multi-channel tuning (frequency band + needle)

**What:** Turned the single-signal player into a four-station tuner, building on
CS-002. Audio source is still a placeholder (decided: "fake it for now") — the
round knob keeps tuning the live stream; only the station *identity* changes.

- Added an AM **frequency band** between the display and the knob: a tuning
  scale, a sliding **needle**, and a stop per station. The round knob stays the
  power / tune-in toggle (a real-radio mental model: knob = power, band = which
  station).
- Channels: `610 THE ANOMALY` (music through the static), `1010 DEAD CHANNEL`
  (a voice counting in the noise), `1230 SLOW DANCE` (after-hours soul),
  `1300 GRAVEYARD SHIFT` (3am jazz & rain).
- Selecting a station moves the needle, re-labels the display (name → title,
  frequency → sub-right, tagline → sub-left) and plays a brief **static flicker**
  over the display. Choice persists to `localStorage` (`anomalyfm-channel`).
- Accessible as a `radiogroup`: stations are `role="radio"` with roving
  tabindex and left/right/up/down arrow tuning.

**Untouched:** `radio-core.js` and the `[data-radio="status"]` line it owns, so
live audio / status / listeners keep working alongside the new station identity.

**Next:** wire a real per-channel audio source (public stream, hosted playlist,
or Icecast) so each frequency actually plays something different.

---

## CS-004 — Real per-channel audio (own player, live SomaFM streams)

**What:** Replaced the vendored `radio-core.js` (CS-000) with our own
`station/player.js`, and gave every channel a real, distinct stream. Answers the
"why is it the same sound" gap left by CS-003's placeholder audio.

- **Before:** `radio-core.js` played one hardcoded anomaly stream; the frequency
  band (CS-003) only re-labelled the display, so all four channels sounded
  identical.
- **After:** `station/player.js` owns audio, channels, volume, and reconnect.
  Tuning a station now swaps the audio source live. Each channel maps to a
  SomaFM public stream that fits its vibe:
  - `610 THE ANOMALY` → Groove Salad (ambient / downtempo)
  - `1010 DEAD CHANNEL` → Doomed (dark ambient / horror)
  - `1230 SLOW DANCE` → Seven Inch Soul (vintage soul 45s)
  - `1300 GRAVEYARD SHIFT` → Secret Agent (spy-jazz / lounge)
- **Live metadata:** polls SomaFM `channels.json` (open CORS) every 20s for the
  **real listener count** ("RECEIVERS TUNED IN") and the **now-playing track**
  (shown on the status line while receiving). Fails soft to the tagline + "–".
- **Resilience:** each channel lists mirror URLs (`ice2` primary, `ice4`
  fallback); reconnect rolls to the next mirror with backoff, plus a stall
  watchdog. Autoplay-blocked start falls back to tap-to-tune. Volume persists
  (`anomalyfm-vol`), channel persists (`anomalyfm-channel`).
- Reuses the existing `<html>` state classes (`radio-on/off/tuning/receiving/
  live`), so the knob rotation, glyph, and live-dot animations work unchanged.
- Removed `station/radio-core.js` (superseded) and the inert `data-ticker`
  attribute; folded CS-003's inline channel script into `player.js`.

**Note on content:** these are SomaFM's stations fronted by our dial — great for
hearing the multi-channel experience for real. Swap any `streams` entry in
`player.js` for our own audio/stream when we host it.

---

## CS-005 — Fit the device to one viewport

**What:** Tightened vertical rhythm so the player fits on screen without
scrolling. The frequency band (CS-003) had pushed the device past one viewport.

- Dial: `232px` → `184px` (the biggest saving); dial-number radius adjusted to
  match (`translateY(-99px)` → `-78px`).
- Grille height `92px` → `68px`; tuner height `66px` → `60px` (margin `12` → `10`).
- Padding trims: `.dial-wrap` `26/8` → `14/4`, `.volume` top `18` → `12`,
  device `16/16/22` → `14/16/16`, width `350` → `340`.

**Why:** Roughly ~110px shorter (~720px → ~610px tall), so it sits within a
normal phone/laptop viewport. No behaviour changed — layout only.

---

## CS-006 — SIGNAL bank: four live feeds sonified in the browser

**What:** Added a second bank of four stations that broadcast the real world.
Nothing pre-recorded — each station opens a live feed and turns events into
sound with the Web Audio API, with the display tickering the events.

- **Band split into two banks** via a MUSIC / SIGNAL toggle (`role="tablist"`).
  The dial shows one bank's four stations at a time; the needle hides when the
  playing station is in the other bank. `select()` now works on global indices
  and auto-switches the shown bank to the playing station.
- **SIGNAL stations:**
  - `013 TREMOR` — USGS `all_hour.geojson`, polled 45s; each new quake → a
    rumble (low sine + filtered noise) scaled to magnitude. Backlog is primed
    silently on first load.
  - `200 THE FEED` — GitHub global `events` API, polled 75s (under the 60/hr
    unauth limit; 403 fails soft); each new event → a marimba blip pitched by
    repo-name hash.
  - `404 DEEP SIGNAL` — Hacker News `maxitem`, polled 15s; new-item delta → soft
    ticks; newest item's title fetched for the ticker.
  - `999 THE WIRE` — Wikimedia EventStreams (SSE); en.wikipedia edits only,
    rate-limited to ~7/s; additions → high triangle bell, removals → low sine,
    pitch by edit size.
- **Web Audio engine:** lazy `AudioContext` (created/resumed on the tune-in
  gesture; boot autoplay falls back to tap-to-tune), a shared master gain driven
  by the volume slider, plus `tone()` and `rumble()` builders.
- **Footer repurposes per station:** MUSIC shows real SomaFM listeners
  ("RECEIVERS TUNED IN"); SIGNAL shows a live session event counter
  ("SIGNALS RECEIVED").
- Height held roughly steady (bank toggle added, `.dial-wrap` padding trimmed).

**All feeds are public and CORS-open — verified before building. No backend.**

**Next candidates:** make `THE FEED` point at a source the user picks (subreddit
/ RSS / GitHub repo / Discord webhook); host the site online.

---

## CS-007 — Ready for GitHub Pages hosting

**What:** Prepared the project to deploy as a static site on GitHub Pages.

- **Metadata:** replaced anomaly's leftover description/OG tags (which described
  a Discord origin and pointed `og:image` at `anomaly.fm/og.png`, a foreign
  asset) with our own description; dropped the broken `og:image` set. `twitter:card`
  → `summary`.
- **Paths:** verified every local reference is relative (`station/player.js`), so
  the site works from a project subpath (`/<repo>/`), not just a root domain.
- **Added:** `.nojekyll` (serve files as-is, skip Jekyll), `.gitignore`
  (`.DS_Store`, logs, editor dirs), and a `README.md` (stations, local dev,
  Pages deploy steps, how-it-works, and source attribution incl. SomaFM).
- Initialized a git repo with an initial commit covering the full project.

**Why:** One `git remote add` + `git push` away from a live site; Pages then
serves from `main` / root.

---

## CS-008 — Social preview image (og.png)

**What:** Added a 1200×630 Open Graph / Twitter card so shared links render a
branded preview instead of a bare URL.

- `og.png` — the brand card: pixel "anomaly.fm" wordmark (teal `.fm`), the
  tagline, the full frequency band with all eight stations (999 lit, needle on
  it), and the teal dial. Rendered with headless Chrome from an HTML card using
  the real Pixelify Sans font, so it matches the site exactly.
- Re-enabled `og:image` / `twitter:image` (relative `og.png`) plus
  `og:image:width/height` and upgraded `twitter:card` back to
  `summary_large_image`.

**Note:** Open Graph prefers an *absolute* image URL. A comment in `index.html`
flags swapping `og.png` for `https://<user>.github.io/<repo>/og.png` once the
host is known, for the most reliable previews across all scrapers.
