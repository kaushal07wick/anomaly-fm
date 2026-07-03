/**
 * anomaly.fm player — multi-channel runtime.
 *
 * Two banks of stations tuned from one dial:
 *   MUSIC  — recorded streams (SomaFM public mirrors).
 *   SIGNAL — live real-world feeds, sonified in the browser with Web Audio.
 *            Nothing is pre-recorded: each event (a Wikipedia edit, an
 *            earthquake, a Hacker News item, a GitHub event) becomes a tone,
 *            and the display tickers through what just happened.
 *
 * Drives the same <html> state classes the stylesheet hooks
 * (radio-on/off/tuning/receiving/live), so the knob, glyph, and live-dot
 * animations work for both kinds of station.
 */
(() => {
  'use strict';

  const CHANNELS = [
    // --- MUSIC bank ---
    {
      bank: 'music', type: 'stream', freq: '610', name: 'THE ANOMALY', tag: 'music through the static', soma: 'groovesalad',
      streams: ['https://ice2.somafm.com/groovesalad-128-mp3', 'https://ice4.somafm.com/groovesalad-128-mp3'],
    },
    {
      bank: 'music', type: 'stream', freq: '1010', name: 'DEAD CHANNEL', tag: 'a voice counting in the noise', soma: 'doomed',
      streams: ['https://ice2.somafm.com/doomed-128-mp3', 'https://ice4.somafm.com/doomed-128-mp3'],
    },
    {
      bank: 'music', type: 'stream', freq: '1230', name: 'SLOW DANCE', tag: 'after-hours soul', soma: '7soul',
      streams: ['https://ice2.somafm.com/7soul-128-mp3', 'https://ice4.somafm.com/7soul-128-mp3'],
    },
    {
      bank: 'music', type: 'stream', freq: '1300', name: 'GRAVEYARD SHIFT', tag: '3am jazz & rain', soma: 'secretagent',
      streams: ['https://ice2.somafm.com/secretagent-128-mp3', 'https://ice4.somafm.com/secretagent-128-mp3'],
    },
    // --- SIGNAL bank (live, generative) ---
    { bank: 'signal', type: 'signal', freq: '013', name: 'TREMOR', tag: 'the planet, moving', feed: 'quake' },
    { bank: 'signal', type: 'signal', freq: '200', name: 'THE FEED', tag: 'the world shipping code', feed: 'github' },
    { bank: 'signal', type: 'signal', freq: '404', name: 'DEEP SIGNAL', tag: 'the internet, read aloud', feed: 'hn' },
    { bank: 'signal', type: 'signal', freq: '999', name: 'THE WIRE', tag: 'listening to humanity', feed: 'wiki' },
  ];
  const POS = [12.5, 37.5, 62.5, 87.5]; // needle stops across the scale, in %
  const GLYPH = '<span class="glyph" aria-hidden="true"></span>';
  const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

  const root = document.documentElement;
  const q = (sel) => document.querySelector(sel);
  const tuner = q('.tuner');
  const needle = q('.tuner__needle');
  const titleEl = q('.card .title');
  const freqEl = q('.card .sub .right');
  const tagEl = q('.card .sub .left');
  const card = q('.card');
  const toggleBtn = q('[data-radio="toggle"]');
  const statusEl = q('[data-radio="status"]');
  const signalEl = q('[data-radio="signal"]');
  const listenersEl = q('[data-radio="listeners"]');
  const labelEl = q('[data-radio="listeners-label"]');
  const volumeEl = q('[data-radio="volume"]');
  const bankBtns = Array.from(document.querySelectorAll('.bank'));

  const audio = new Audio();
  audio.preload = 'none';

  let current = 0;
  let viewBank = 'music';
  let stations = [];
  let wantPlaying = false;
  let streamIdx = 0;
  let reconnectTimer = null;
  let reconnectTries = 0;
  let lastProgress = 0;
  let meta = {};          // soma id -> { listeners, track }
  let signalEvents = 0;   // events sonified since tuning the current signal

  // --- <html> state classes ---
  const PLAY_STATES = ['radio-on', 'radio-off', 'radio-tuning', 'radio-receiving'];
  const setPlay = (...classes) => {
    root.classList.remove(...PLAY_STATES);
    root.classList.add(...classes);
    toggleBtn.setAttribute('aria-pressed', String(wantPlaying));
  };
  const setLive = (on) => root.classList.toggle('radio-live', on);
  const setSignal = (text) => { signalEl.textContent = text; };
  const volLevel = () => (volumeEl ? Number(volumeEl.value) / 100 : 0.8);

  // ==========================================================================
  // Web Audio engine (for the SIGNAL bank)
  // ==========================================================================
  let audioCtx = null;
  let masterGain = null;
  let noiseBuf = null;
  let feedCleanup = null; // stops whatever feed is currently running

  function ensureAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volLevel();
    masterGain.connect(audioCtx.destination);
    const len = Math.floor(audioCtx.sampleRate);
    noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }

  function tone({ freq = 440, dur = 0.4, type = 'sine', gain = 0.25, pan = 0, attack = 0.01, release = 0.4 }) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur + release);
    osc.connect(g);
    if (audioCtx.createStereoPanner) {
      const p = audioCtx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(masterGain);
    } else {
      g.connect(masterGain);
    }
    osc.start(t);
    osc.stop(t + attack + dur + release + 0.05);
  }

  function rumble(mag, pan) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const dur = Math.min(0.7 + mag * 0.5, 5);
    tone({ freq: Math.max(28, 120 - mag * 14), dur, type: 'sine', gain: Math.min(0.14 + mag * 0.08, 0.7), attack: 0.06, release: 1.3, pan });
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 110 + mag * 22;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(0.07 + mag * 0.03, 0.3), t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(masterGain);
    src.start(t); src.stop(t + dur + 0.1);
  }

  const rand = () => Math.random() * 2 - 1;
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

  // Read text aloud with the browser's built-in voice (free, no backend).
  // Volume tracks the slider; a lowered pitch gives it a calmer radio-announcer feel.
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 0.9;
    u.volume = volLevel();
    window.speechSynthesis.speak(u);
  }

  // ==========================================================================
  // Display helpers
  // ==========================================================================
  const ticker = (text) => {
    if (wantPlaying && CHANNELS[current].type === 'signal') statusEl.textContent = text;
  };
  const bumpSignal = () => {
    signalEvents += 1;
    if (CHANNELS[current].type === 'signal') renderListeners();
  };

  const renderStatus = () => {
    const ch = CHANNELS[current];
    if (ch.type === 'signal') {
      if (!wantPlaying) statusEl.textContent = 'tap the dial to tune in';
      return; // otherwise the live feed owns this line
    }
    if (!wantPlaying) { statusEl.textContent = 'tap the dial to tune in'; return; }
    if (root.classList.contains('radio-receiving')) {
      const track = meta[ch.soma] && meta[ch.soma].track;
      statusEl.textContent = track || ch.tag;
    } else {
      statusEl.textContent = 'tuning ' + ch.freq + ' kHz…';
    }
  };

  function renderListeners() {
    const ch = CHANNELS[current];
    if (ch.type === 'signal') {
      listenersEl.textContent = String(signalEvents);
      labelEl.textContent = 'SIGNALS RECEIVED';
      return;
    }
    const m = meta[ch.soma];
    listenersEl.textContent = (m && Number.isFinite(m.listeners)) ? String(m.listeners) : '–';
    labelEl.textContent = 'RECEIVERS TUNED IN';
  }

  const signalConnected = () => {
    if (!wantPlaying) return;
    setPlay('radio-on', 'radio-receiving');
    setLive(true);
    setSignal('RECEIVING');
  };

  // ==========================================================================
  // Live feeds → sound + ticker
  // ==========================================================================
  function runWiki() {
    const es = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');
    let last = 0;
    es.onopen = signalConnected;
    es.onmessage = (ev) => {
      let d;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if ((d.type !== 'edit' && d.type !== 'new') || d.bot) return;
      if (d.server_name !== 'en.wikipedia.org') return; // keep it musical
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (now - last < 150) return;
      last = now;
      signalConnected();
      const delta = (d.length && typeof d.length.new === 'number' && typeof d.length.old === 'number')
        ? d.length.new - d.length.old : 0;
      const idx = Math.min(PENTA.length - 1, Math.floor(Math.sqrt(Math.abs(delta)) / 2));
      const gain = Math.min(0.07 + Math.min(Math.abs(delta), 600) / 600 * 0.22, 0.3);
      if (delta >= 0) tone({ freq: PENTA[idx] * 2, dur: 0.5, type: 'triangle', gain, pan: rand() * 0.6, release: 0.5 });
      else tone({ freq: PENTA[idx], dur: 0.7, type: 'sine', gain, pan: rand() * 0.6, release: 0.8 });
      bumpSignal();
      ticker(d.title + '  ' + (delta >= 0 ? '+' : '−') + Math.abs(delta));
    };
    es.onerror = () => { /* EventSource auto-reconnects */ };
    feedCleanup = () => es.close();
  }

  function runQuake() {
    const seen = new Set();
    let primed = false;
    async function poll() {
      try {
        const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', { cache: 'no-store' });
        const d = await res.json();
        signalConnected();
        const feats = d.features.slice().reverse(); // oldest first
        for (const f of feats) {
          if (seen.has(f.id)) continue;
          seen.add(f.id);
          if (!primed) continue; // don't replay the backlog on first load
          const mag = f.properties.mag || 1;
          rumble(mag, rand() * 0.6);
          bumpSignal();
          ticker('M' + mag.toFixed(1) + '  ' + f.properties.place);
        }
        if (!primed) {
          primed = true;
          const latest = d.features[0];
          if (latest) ticker('M' + (latest.properties.mag || 0).toFixed(1) + '  ' + latest.properties.place);
          else ticker('all quiet — waiting for the next tremor');
        }
      } catch (e) { /* keep last */ }
    }
    poll();
    const id = setInterval(poll, 45000);
    feedCleanup = () => clearInterval(id);
  }

  function runHN() {
    // Hybrid station: a tick per new post, and every 4th headline is read aloud.
    // Titles come from Algolia (each item has a real title, unlike maxitem).
    const seen = new Set();
    const queue = [];
    let primed = false;
    let played = 0;

    async function fetchItems() {
      const res = await fetch('https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20', { cache: 'no-store' });
      const data = await res.json();
      return data.hits || [];
    }
    async function poll() {
      try {
        const hits = await fetchItems();
        signalConnected();
        hits.slice().reverse().forEach((h) => {
          if (!seen.has(h.objectID)) { seen.add(h.objectID); queue.push(h.title || h.story_title || '(untitled)'); }
        });
        if (!primed) { primed = true; if (!queue.length) ticker('quiet on the wire — waiting for the next post'); }
      } catch (e) { /* keep last known */ }
    }
    // Pace playback so a burst of new posts doesn't fire all at once.
    const playId = setInterval(() => {
      if (!queue.length) return;
      const title = queue.shift();
      tone({ freq: PENTA[6 + (hash(title) % 3)], dur: 0.05, type: 'triangle', gain: 0.18, pan: rand() * 0.5, release: 0.08 });
      played += 1;
      if (played % 4 === 0) speak(title);
      bumpSignal();
      ticker(title);
    }, 2000);
    poll();
    const pollId = setInterval(poll, 15000);
    feedCleanup = () => {
      clearInterval(playId);
      clearInterval(pollId);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }

  function runGitHub() {
    const seen = new Set();
    let primed = false;
    async function poll() {
      try {
        const res = await fetch('https://api.github.com/events?per_page=30', { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
        if (res.status === 403) { signalConnected(); ticker('rate-limited — listening again soon'); return; }
        const evs = await res.json();
        signalConnected();
        const arr = Array.isArray(evs) ? evs.slice().reverse() : [];
        for (const e of arr) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          if (!primed) continue;
          const repo = e.repo ? e.repo.name : '';
          tone({ freq: PENTA[hash(repo) % PENTA.length], dur: 0.18, type: 'sine', gain: 0.16, pan: rand() * 0.5, release: 0.25 });
          bumpSignal();
          ticker(e.type.replace('Event', '') + ' · ' + repo);
        }
        primed = true;
      } catch (e) { /* keep last */ }
    }
    poll();
    const id = setInterval(poll, 75000);
    feedCleanup = () => clearInterval(id);
  }

  const FEEDS = { wiki: runWiki, quake: runQuake, hn: runHN, github: runGitHub };

  // ==========================================================================
  // Volume (persisted, drives both output paths)
  // ==========================================================================
  const applyVolume = () => {
    audio.volume = volLevel();
    if (masterGain) masterGain.gain.value = volLevel();
  };
  if (volumeEl) {
    const saved = localStorage.getItem('anomalyfm-vol');
    if (saved !== null && Number.isFinite(Number(saved))) volumeEl.value = saved;
    volumeEl.addEventListener('input', () => {
      applyVolume();
      try { localStorage.setItem('anomalyfm-vol', volumeEl.value); } catch (e) { /* storage blocked */ }
    });
  }
  applyVolume();

  // ==========================================================================
  // Playback (both station kinds)
  // ==========================================================================
  const armTapToTune = () => {
    document.addEventListener('pointerdown', (e) => {
      if (wantPlaying) return;
      if (toggleBtn.contains(e.target) || (volumeEl && volumeEl.contains(e.target))) return;
      start();
    }, { once: true });
  };

  const stopSources = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (feedCleanup) { try { feedCleanup(); } catch (e) { /* ignore */ } feedCleanup = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  function loadStream() {
    const ch = CHANNELS[current];
    audio.src = ch.streams[streamIdx % ch.streams.length] + '?_=' + Date.now();
    applyVolume();
    lastProgress = Date.now();
    setPlay('radio-on', 'radio-tuning');
    setLive(false);
    setSignal('TUNING…');
    renderStatus();
    audio.play().catch(() => {
      wantPlaying = false;
      setPlay('radio-off');
      setSignal('TAP TO TUNE IN');
      renderStatus();
      armTapToTune();
    });
  }

  function startSignalStation() {
    const ch = CHANNELS[current];
    signalEvents = 0;
    renderListeners();
    ensureAudio();
    const begin = () => {
      setPlay('radio-on', 'radio-tuning');
      setLive(false);
      setSignal('ACQUIRING');
      statusEl.textContent = 'acquiring signal…';
      (FEEDS[ch.feed] || (() => {}))();
    };
    if (audioCtx.state === 'running') { begin(); return; }
    audioCtx.resume().then(() => {
      if (audioCtx.state === 'running' && wantPlaying) begin();
      else blockedSignal();
    }).catch(blockedSignal);
  }

  function blockedSignal() {
    wantPlaying = false;
    setPlay('radio-off');
    setSignal('TAP TO TUNE IN');
    statusEl.textContent = 'tap the dial to tune in';
    armTapToTune();
  }

  const tuneIn = () => (CHANNELS[current].type === 'signal' ? startSignalStation() : loadStream());

  function start() {
    wantPlaying = true;
    reconnectTries = 0;
    streamIdx = 0;
    tuneIn();
  }

  function stop() {
    wantPlaying = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectTries = 0;
    stopSources();
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    setPlay('radio-off');
    setLive(false);
    setSignal('RECEIVER OFF');
    renderStatus();
  }

  function reconnect() {
    if (!wantPlaying || reconnectTimer || CHANNELS[current].type !== 'stream') return;
    reconnectTries += 1;
    streamIdx += 1;
    setPlay('radio-on', 'radio-tuning');
    setLive(false);
    setSignal('SIGNAL LOST — RETRYING');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (wantPlaying) loadStream();
    }, Math.min(2500 * reconnectTries, 12000));
  }

  audio.addEventListener('playing', () => {
    if (!wantPlaying || CHANNELS[current].type !== 'stream') return;
    reconnectTries = 0;
    lastProgress = Date.now();
    setPlay('radio-on', 'radio-receiving');
    setLive(true);
    setSignal('RECEIVING');
    renderStatus();
  });
  audio.addEventListener('waiting', () => {
    if (wantPlaying && CHANNELS[current].type === 'stream') { setPlay('radio-on', 'radio-tuning'); setSignal('TUNING…'); }
  });
  audio.addEventListener('timeupdate', () => { lastProgress = Date.now(); });
  audio.addEventListener('error', reconnect);
  audio.addEventListener('ended', reconnect);
  setInterval(() => {
    if (!wantPlaying || reconnectTimer || CHANNELS[current].type !== 'stream') return;
    if (Date.now() - lastProgress > 15000) {
      try { audio.pause(); } catch (e) { /* already dead */ }
      reconnect();
    }
  }, 5000);

  toggleBtn.addEventListener('click', () => (wantPlaying ? stop() : start()));

  // ==========================================================================
  // Band + station selection
  // ==========================================================================
  function updateNeedle() {
    let shown = false;
    stations.forEach((b) => {
      const on = b._idx === current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) { needle.style.left = b.style.left; needle.style.display = ''; shown = true; }
    });
    needle.style.display = shown ? '' : 'none';
  }

  function renderBand(bank) {
    stations.forEach((b) => b.remove());
    const inBank = CHANNELS
      .map((ch, idx) => ({ ch, idx }))
      .filter((x) => x.ch.bank === bank);
    stations = inBank.map((x, pos) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'station';
      b.setAttribute('role', 'radio');
      b.tabIndex = -1;
      b.style.left = POS[pos] + '%';
      b.textContent = x.ch.freq;
      b.setAttribute('aria-label', x.ch.freq + ' kHz — ' + x.ch.name);
      b._idx = x.idx;
      b.addEventListener('click', () => select(x.idx, true));
      tuner.appendChild(b);
      return b;
    });
    updateNeedle();
  }

  const syncBankButtons = () => bankBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.bank === viewBank)));

  function select(i, animate) {
    const ch = CHANNELS[i];
    const changed = current !== i;
    current = i;
    if (viewBank !== ch.bank) { viewBank = ch.bank; syncBankButtons(); renderBand(viewBank); }
    else updateNeedle();
    titleEl.innerHTML = GLYPH + ch.name;
    freqEl.textContent = ch.freq + ' kHz AM';
    tagEl.textContent = ch.tag;
    try { localStorage.setItem('anomalyfm-channel', String(i)); } catch (e) { /* storage blocked */ }
    renderListeners();
    renderStatus();
    if (animate && changed) {
      card.classList.remove('retuning');
      void card.offsetWidth; // restart the flicker animation
      card.classList.add('retuning');
    }
    if (changed && wantPlaying) {
      stopSources();
      reconnectTries = 0;
      streamIdx = 0;
      tuneIn();
    }
  }

  bankBtns.forEach((b) => b.addEventListener('click', () => {
    viewBank = b.dataset.bank;
    syncBankButtons();
    renderBand(viewBank);
  }));

  tuner.addEventListener('keydown', (e) => {
    const step = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1
               : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
    if (!step || !stations.length) return;
    e.preventDefault();
    let pos = stations.findIndex((b) => b._idx === current);
    if (pos < 0) pos = 0;
    const nextPos = (pos + step + stations.length) % stations.length;
    stations[nextPos].focus();
    select(stations[nextPos]._idx, true);
  });

  // ==========================================================================
  // Live metadata for the MUSIC bank (real listeners + now-playing)
  // ==========================================================================
  async function pollMeta() {
    try {
      const res = await fetch('https://somafm.com/channels.json', { cache: 'no-store' });
      const data = await res.json();
      const next = {};
      for (const c of data.channels) next[c.id] = { listeners: parseInt(c.listeners, 10), track: c.lastPlaying };
      meta = next;
      if (CHANNELS[current].type === 'stream') { renderListeners(); if (wantPlaying) renderStatus(); }
    } catch (e) { /* keep last known */ }
  }

  // ==========================================================================
  // Boot
  // ==========================================================================
  let saved = 0;
  try {
    const s = Number(localStorage.getItem('anomalyfm-channel'));
    if (Number.isInteger(s) && s >= 0 && s < CHANNELS.length) saved = s;
  } catch (e) { /* storage blocked */ }

  current = saved;
  viewBank = CHANNELS[saved].bank;
  syncBankButtons();
  renderBand(viewBank);
  setPlay('radio-off');
  setSignal(' ');
  select(saved, false);
  pollMeta();
  setInterval(pollMeta, 20000);
  start(); // best-effort autoplay; falls back to tap-to-tune

  window.RadioCore = { start, stop, toggle: () => (wantPlaying ? stop() : start()), select };
})();
