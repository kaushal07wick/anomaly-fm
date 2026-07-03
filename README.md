# anomaly.fm

A retro AM radio you tune across live stations. Two banks on one dial:

- **MUSIC** — recorded streams (SomaFM public mirrors).
- **SIGNAL** — live real-world feeds, sonified in the browser with the Web Audio
  API. Nothing is pre-recorded: each event becomes a tone, and the display
  tickers through what just happened.

Fully static — no backend, no build step. Just HTML, CSS, and vanilla JS.

## Stations

**MUSIC**

| Freq | Station | Source |
| --- | --- | --- |
| 610 | THE ANOMALY | SomaFM — Groove Salad (ambient / downtempo) |
| 1010 | DEAD CHANNEL | SomaFM — Doomed (dark ambient) |
| 1230 | SLOW DANCE | SomaFM — Seven Inch Soul (vintage soul) |
| 1300 | GRAVEYARD SHIFT | SomaFM — Secret Agent (spy-jazz / lounge) |

**SIGNAL** (live, generative)

| Freq | Station | Feed | Sound |
| --- | --- | --- | --- |
| 999 | THE WIRE | Wikimedia EventStreams | bell per edit, pitched by size |
| 013 | TREMOR | USGS earthquakes | rumble scaled to magnitude |
| 404 | DEEP SIGNAL | Hacker News new items | soft ticks |
| 200 | THE FEED | GitHub global activity | marimba blips |

## Run locally

Any static file server works. From the project root:

```sh
python3 -m http.server 8787
# then open http://localhost:8787
```

Audio needs a click first (browsers block autoplay), so tap the dial to tune in.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo (see the exact commands the assistant
   printed, or use your own).
2. In the repo: **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**. Branch: **main**, folder: **/ (root)**.
4. Save. Your site goes live at `https://<user>.github.io/<repo>/` in a minute.

The included `.nojekyll` file makes Pages serve the files as-is.

### Notes

- All source paths are relative, so the site works from a project subpath
  (`/<repo>/`) as well as a custom domain.
- Fonts load from Google Fonts over HTTPS; the rest is self-contained.
- To add a social preview image, drop an `og.png` (1200×630) in the root and add
  the `og:image` meta tags back to `index.html`.

## How it works

- `index.html` — the whole UI and all styling. Palette is a set of semantic CSS
  tokens; themes are override blocks (`:root[data-theme="black"]`).
- `station/player.js` — the runtime: channel/bank tuning, stream playback with
  mirror-fallback reconnect, the Web Audio engine for the SIGNAL bank, volume +
  channel persistence, and live metadata polling.
- `HISTORY.md` — an append-only log of every change (CS-000, CS-001, …).

## Credits

Live data and audio from public, CORS-open sources:

- **SomaFM** — listener-supported internet radio (<https://somafm.com>). Please
  consider supporting them if you enjoy the music channels.
- **Wikimedia EventStreams** — <https://stream.wikimedia.org>
- **USGS Earthquake Hazards Program** — <https://earthquake.usgs.gov>
- **Hacker News API** — <https://github.com/HackerNews/API>
- **GitHub Events API** — <https://docs.github.com/rest/activity/events>

The player skin is inspired by the original anomaly.fm.
