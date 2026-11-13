/*
 * app.js — Bangla Voice Recognition System
 * Uses the browser's Web Speech API (SpeechRecognition) with lang "bn-BD"/"bn-IN".
 */
(function () {
  'use strict';

  const BT = window.BanglaText;
  const $ = (id) => document.getElementById(id);

  const els = {
    status: $('status'),
    statusText: $('statusText'),
    unsupported: $('unsupported'),
    notice: $('notice'),
    noticeText: $('noticeText'),
    noticeClose: $('noticeClose'),
    lang: $('lang'),
    optCommands: $('optCommands'),
    optDigits: $('optDigits'),
    micBtn: $('micBtn'),
    micLabel: $('micLabel'),
    canvas: $('visualizer'),
    timer: $('timer'),
    live: $('live'),
    interim: $('interim'),
    transcript: $('transcript'),
    wordCount: $('wordCount'),
    charCount: $('charCount'),
    confidenceWrap: $('confidenceWrap'),
    confidence: $('confidence'),
    copyBtn: $('copyBtn'),
    downloadBtn: $('downloadBtn'),
    saveBtn: $('saveBtn'),
    speakBtn: $('speakBtn'),
    speakLabel: $('speakLabel'),
    clearBtn: $('clearBtn'),
    commandList: $('commandList'),
    historyList: $('historyList'),
    historyEmpty: $('historyEmpty'),
    toast: $('toast'),
  };

  /* ---------------- Storage (never required for the app to work) ---------------- */
  const KEYS = { settings: 'bvr.settings', draft: 'bvr.draft', history: 'bvr.history' };
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
    },
  };

  /* ---------------- Speech recognition ---------------- */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let wantListening = false;   // what the user asked for
  let engineRunning = false;   // whether the recognizer is currently active
  let restartTimer = 0;
  let recentEnds = [];

  const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'bad-grammar']);
  const ERROR_MESSAGES = {
    'not-allowed': 'মাইক্রোফোন ব্যবহারের অনুমতি দেওয়া হয়নি। ঠিকানা বারের বাম পাশের আইকনে ক্লিক করে Microphone → Allow করুন, তারপর আবার চেষ্টা করুন।',
    'service-not-allowed': 'ব্রাউজার স্পিচ সার্ভিস ব্যবহারের অনুমতি দিচ্ছে না। Google Chrome ব্যবহার করে দেখুন।',
    'audio-capture': 'কোনো মাইক্রোফোন পাওয়া যায়নি। মাইক্রোফোন সংযুক্ত আছে কি না এবং Windows Settings → Privacy → Microphone চালু আছে কি না দেখুন।',
    'network': 'নেটওয়ার্ক সমস্যা। ভয়েস রিকগনিশনের জন্য ইন্টারনেট সংযোগ প্রয়োজন। (Brave/Opera-তে এটি কাজ করে না — Chrome ব্যবহার করুন।)',
    'language-not-supported': 'এই ব্রাউজার নির্বাচিত ভাষা সমর্থন করে না। Google Chrome ব্যবহার করুন।',
    'bad-grammar': 'স্পিচ সার্ভিসে সমস্যা হয়েছে। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।',
  };

  function createRecognition() {
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      if (!wantListening) { try { r.stop(); } catch (_) { /* ignore */ } return; }
      setUI('listening');
    };

    r.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const best = result[0];
        if (result.isFinal) commitFinal(best.transcript, best.confidence);
        else interim += best.transcript;
      }
      setInterim(interim);
    };

    r.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return; // onend restarts
      if (FATAL_ERRORS.has(event.error)) haltListening();
      showNotice(ERROR_MESSAGES[event.error] || ('একটি ত্রুটি হয়েছে: ' + event.error), 'error');
    };

    r.onend = () => {
      engineRunning = false;
      setInterim('');
      if (!wantListening) { setUI('idle'); return; }

      // Chrome ends sessions after silence or ~1 minute; restart transparently,
      // but bail out if it keeps dying immediately.
      const now = Date.now();
      recentEnds = recentEnds.filter((t) => now - t < 10000);
      recentEnds.push(now);
      if (recentEnds.length > 8) {
        haltListening();
        showNotice('স্পিচ সার্ভিস বারবার বন্ধ হয়ে যাচ্ছে। ইন্টারনেট সংযোগ ও মাইক্রোফোন পরীক্ষা করে আবার চেষ্টা করুন।', 'error');
        return;
      }
      setUI('starting');
      restartTimer = setTimeout(beginEngine, 250);
    };

    return r;
  }

  function beginEngine() {
    if (!wantListening || engineRunning) return;
    recognition.lang = els.lang.value;
    try {
      recognition.start();
      engineRunning = true;
    } catch (_) {
      // InvalidStateError: already started — onend will sort things out.
    }
  }

  function startListening() {
    if (!recognition || wantListening) return;
    if (speech.active) stopSpeaking();
    hideNotice();
    wantListening = true;
    recentEnds = [];
    setUI('starting');
    startTimer();
    startVisualizer();
    beginEngine();
  }

  /** User-requested stop: let the recognizer deliver its last final result. */
  function stopListening() {
    if (!wantListening) return;
    haltListening();
    if (engineRunning) {
      try { recognition.stop(); } catch (_) { /* ignore */ }
    }
  }

  function haltListening() {
    wantListening = false;
    clearTimeout(restartTimer);
    stopTimer();
    stopVisualizer();
    setUI('idle');
  }

  function toggleListening() {
    if (wantListening) stopListening();
    else startListening();
  }

  /* ---------------- Transcript handling ---------------- */
  const undoStack = [];

  function currentOptions() {
    return {
      commands: els.optCommands.checked,
      digits: els.optDigits.checked && els.lang.value.startsWith('bn'),
    };
  }

  function commitFinal(raw, confidence) {
    const out = BT.processSegment(raw, currentOptions());
    if (out.type === 'empty') return;
    if (out.type === 'command') { runCommand(out.action); return; }

    const before = els.transcript.value;
    const after = BT.joinText(before, out.text);
    els.transcript.value = after;
    undoStack.push({ before, after });
    if (undoStack.length > 100) undoStack.shift();

    els.transcript.scrollTop = els.transcript.scrollHeight;
    if (typeof confidence === 'number' && confidence > 0) {
      els.confidence.textContent = 'নির্ভুলতা ' + BT.formatNumber(Math.round(confidence * 100)) + '%';
      els.confidenceWrap.hidden = false;
    }
    afterTranscriptChange();
  }

  function runCommand(action) {
    if (action === 'stop') {
      stopListening();
      toast('শোনা বন্ধ করা হয়েছে');
    } else if (action === 'undo') {
      undoLast();
    }
  }

  function undoLast() {
    const last = undoStack.pop();
    if (last && els.transcript.value === last.after) {
      setTranscript(last.before);
      toast('শেষ অংশ মুছে ফেলা হয়েছে');
    } else {
      undoStack.length = 0;
      toast('মোছার মতো কিছু নেই');
    }
  }

  function setTranscript(text) {
    els.transcript.value = text;
    afterTranscriptChange();
  }

  /** Replace the whole transcript, offering a one-click way back. */
  function replaceTranscript(text, message) {
    const previous = els.transcript.value;
    setTranscript(text);
    undoStack.length = 0;
    if (previous.trim()) {
      toast(message, { label: 'ফিরিয়ে আনুন', run: () => setTranscript(previous) });
    } else {
      toast(message);
    }
  }

  function afterTranscriptChange() {
    updateStats();
    store.set(KEYS.draft, els.transcript.value);
  }

  function updateStats() {
    const text = els.transcript.value;
    els.wordCount.textContent = BT.formatNumber(BT.countWords(text)) + ' শব্দ';
    els.charCount.textContent = BT.formatNumber(BT.countChars(text)) + ' অক্ষর';
    const empty = !text.trim();
    els.copyBtn.disabled = empty;
    els.downloadBtn.disabled = empty;
    els.saveBtn.disabled = empty;
    els.clearBtn.disabled = empty;
    updateSpeakButton();
  }

  function setInterim(text) {
    els.interim.textContent = text ? BT.normalize(text) : '';
  }

  /* ---------------- UI state ---------------- */
  function setUI(state) {
    const listening = state === 'listening';
    const starting = state === 'starting';
    els.status.classList.toggle('is-listening', listening);
    els.status.classList.toggle('is-starting', starting);
    els.statusText.textContent = listening ? 'শুনছি…' : starting ? 'চালু হচ্ছে…' : 'প্রস্তুত';

    const active = listening || starting;
    els.micBtn.classList.toggle('is-listening', active);
    els.micBtn.setAttribute('aria-pressed', String(active));
    els.micBtn.setAttribute('aria-label', active ? 'শোনা বন্ধ করুন' : 'শোনা শুরু করুন');
    els.micLabel.textContent = active ? 'বলতে থাকুন — থামাতে আবার ক্লিক করুন' : 'শুরু করতে মাইকে ক্লিক করুন';
    els.live.classList.toggle('is-active', active);
  }

  let noticeTimer = 0;
  function showNotice(message, kind) {
    els.noticeText.textContent = message;
    els.notice.classList.toggle('banner-error', kind === 'error');
    els.notice.hidden = false;
    clearTimeout(noticeTimer);
    if (kind !== 'error') noticeTimer = setTimeout(hideNotice, 12000);
  }
  function hideNotice() { els.notice.hidden = true; }

  let toastTimer = 0;
  function toast(message, action) {
    els.toast.replaceChildren();
    const span = document.createElement('span');
    span.textContent = message;
    els.toast.append(span);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { action.run(); hideToast(); });
      els.toast.append(btn);
    }
    els.toast.hidden = false;
    requestAnimationFrame(() => els.toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6000 : 2400);
  }
  function hideToast() {
    els.toast.classList.remove('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 220);
  }

  /* ---------------- Timer ---------------- */
  let timerStart = 0;
  let timerInterval = 0;
  function startTimer() {
    timerStart = Date.now();
    renderTimer(0);
    clearInterval(timerInterval);
    timerInterval = setInterval(() => renderTimer(Date.now() - timerStart), 500);
  }
  function stopTimer() { clearInterval(timerInterval); }
  function renderTimer(ms) {
    const total = Math.floor(ms / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    els.timer.textContent = BT.toBanglaDigits(mm + ':' + ss);
  }

  /* ---------------- Microphone level visualizer ---------------- */
  const BAR_COUNT = 44;
  const viz = { token: 0, stream: null, audioCtx: null, analyser: null, data: null, raf: 0 };
  const canvasCtx = els.canvas.getContext('2d');
  let colors = readColors();

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    return { active: css.getPropertyValue('--rec').trim(), idle: css.getPropertyValue('--border-strong').trim() };
  }

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    els.canvas.width = Math.max(1, Math.round(w * dpr));
    els.canvas.height = Math.max(1, Math.round(h * dpr));
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawBars(levels, color) {
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    canvasCtx.clearRect(0, 0, w, h);
    canvasCtx.fillStyle = color;
    const gap = 4;
    const barW = Math.max(2, (w - gap * (BAR_COUNT - 1)) / BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      const barH = Math.max(4, levels[i] * (h - 4));
      const x = i * (barW + gap);
      const y = (h - barH) / 2;
      canvasCtx.beginPath();
      if (canvasCtx.roundRect) canvasCtx.roundRect(x, y, barW, barH, barW / 2);
      else canvasCtx.rect(x, y, barW, barH);
      canvasCtx.fill();
    }
  }

  function drawIdle() {
    drawBars(new Array(BAR_COUNT).fill(0), colors.idle);
  }

  function drawLoop() {
    if (!viz.analyser) return;
    viz.analyser.getByteFrequencyData(viz.data);
    // Speech energy lives in the low bins; mirror it around the centre.
    const half = BAR_COUNT / 2;
    const usable = Math.min(viz.data.length, 48);
    const levels = new Array(BAR_COUNT);
    for (let i = 0; i < half; i++) {
      const start = 1 + Math.floor((i / half) * (usable - 1));
      const end = 1 + Math.floor(((i + 1) / half) * (usable - 1));
      let sum = 0;
      for (let j = start; j <= end; j++) sum += viz.data[j] || 0;
      const v = Math.pow(sum / (end - start + 1) / 255, 1.4);
      levels[half - 1 - i] = v;
      levels[half + i] = v;
    }
    drawBars(levels, colors.active);
    viz.raf = requestAnimationFrame(drawLoop);
  }

  async function startVisualizer() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const token = ++viz.token;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (token !== viz.token || !wantListening) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      viz.stream = stream;
      viz.audioCtx = new AudioCtx();
      viz.analyser = viz.audioCtx.createAnalyser();
      viz.analyser.fftSize = 256;
      viz.analyser.smoothingTimeConstant = 0.75;
      viz.audioCtx.createMediaStreamSource(stream).connect(viz.analyser);
      viz.data = new Uint8Array(viz.analyser.frequencyBinCount);
      cancelAnimationFrame(viz.raf);
      drawLoop();
    } catch (_) {
      // The recognizer reports permission problems itself; the meter is optional.
    }
  }

  function stopVisualizer() {
    viz.token++;
    cancelAnimationFrame(viz.raf);
    if (viz.stream) viz.stream.getTracks().forEach((t) => t.stop());
    if (viz.audioCtx) viz.audioCtx.close().catch(() => {});
    viz.stream = viz.audioCtx = viz.analyser = viz.data = null;
    drawIdle();
  }

  /* ---------------- Read aloud (text-to-speech) ---------------- */
  const speech = { supported: 'speechSynthesis' in window, voice: null, active: false };

  function pickVoice() {
    if (!speech.supported) return;
    const lang = els.lang.value;
    const prefix = lang.split('-')[0];
    const voices = window.speechSynthesis.getVoices();
    speech.voice = voices.find((v) => v.lang.replace('_', '-') === lang)
      || voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
      || null;
    updateSpeakButton();
  }

  function updateSpeakButton() {
    const hasText = !!els.transcript.value.trim();
    els.speakBtn.disabled = !speech.voice || (!hasText && !speech.active);
    els.speakBtn.title = speech.voice ? speech.voice.name : 'এই ডিভাইসে নির্বাচিত ভাষার কোনো ভয়েস নেই';
    els.speakLabel.textContent = speech.active ? 'থামান' : 'পড়ে শোনান';
  }

  function speak() {
    const text = els.transcript.value.trim();
    if (!text || !speech.voice) return;
    stopListening();
    window.speechSynthesis.cancel();
    // Chrome cuts long utterances short, so read sentence by sentence.
    const chunks = text.split(/(?<=[।?!.\n])\s*/u).map((s) => s.trim()).filter(Boolean);
    speech.active = true;
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.voice = speech.voice;
      u.lang = speech.voice.lang;
      if (i === chunks.length - 1) {
        u.onend = u.onerror = () => { speech.active = false; updateSpeakButton(); };
      }
      window.speechSynthesis.speak(u);
    });
    updateSpeakButton();
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    speech.active = false;
    updateSpeakButton();
  }

  /* ---------------- Actions ---------------- */
  async function copyTranscript() {
    const text = els.transcript.value;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      els.transcript.select();
      document.execCommand('copy');
    }
    toast('কপি করা হয়েছে');
  }

  function downloadTranscript() {
    const text = els.transcript.value;
    if (!text.trim()) return;
    const d = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    const name = `bangla-transcript-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.txt`;
    const blob = new Blob(['﻿' + text.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('ডাউনলোড হয়েছে: ' + name);
  }

  function clearTranscript() {
    if (!els.transcript.value) return;
    replaceTranscript('', 'লেখা মুছে ফেলা হয়েছে');
    els.confidenceWrap.hidden = true;
  }

  /* ---------------- History ---------------- */
  const MAX_HISTORY = 50;
  const dateFormat = new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });

  function loadHistory() {
    const list = store.get(KEYS.history, []);
    return Array.isArray(list) ? list.filter((x) => x && typeof x.text === 'string') : [];
  }

  function saveHistory(list) {
    return store.set(KEYS.history, list.slice(0, MAX_HISTORY));
  }

  function saveCurrent() {
    const text = els.transcript.value.trim();
    if (!text) return;
    const list = loadHistory();
    if (list[0] && list[0].text === text) { toast('এটি আগেই সংরক্ষণ করা হয়েছে'); return; }
    list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), lang: els.lang.value, text });
    if (!saveHistory(list)) { toast('সংরক্ষণ করা যায়নি — ব্রাউজার স্টোরেজ বন্ধ আছে'); return; }
    renderHistory();
    toast('সংরক্ষণ করা হয়েছে');
  }

  function renderHistory() {
    const list = loadHistory();
    els.historyList.replaceChildren();
    els.historyEmpty.hidden = list.length > 0;
    for (const item of list) {
      const li = document.createElement('li');
      li.className = 'history-item';

      const meta = document.createElement('div');
      meta.className = 'history-meta';
      meta.textContent = dateFormat.format(item.ts) + ' · ' + BT.formatNumber(BT.countWords(item.text)) + ' শব্দ';

      const preview = document.createElement('p');
      preview.className = 'history-preview';
      preview.textContent = item.text;

      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn btn-sm';
      openBtn.textContent = 'খুলুন';
      openBtn.addEventListener('click', () => replaceTranscript(item.text, 'সংরক্ষিত লেখা খোলা হয়েছে'));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'মুছুন';
      delBtn.addEventListener('click', () => deleteHistoryItem(item.id));
      actions.append(openBtn, delBtn);

      li.append(meta, preview, actions);
      els.historyList.append(li);
    }
  }

  function deleteHistoryItem(id) {
    const list = loadHistory();
    const index = list.findIndex((x) => x.id === id);
    if (index < 0) return;
    const [removed] = list.splice(index, 1);
    saveHistory(list);
    renderHistory();
    toast('মুছে ফেলা হয়েছে', {
      label: 'ফিরিয়ে আনুন',
      run: () => {
        const current = loadHistory();
        current.splice(Math.min(index, current.length), 0, removed);
        saveHistory(current);
        renderHistory();
      },
    });
  }

  /* ---------------- Command help ---------------- */
  function renderCommandHelp() {
    const rows = [];
    const group = (title) => {
      const tr = document.createElement('tr');
      tr.className = 'group';
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = title;
      tr.append(td);
      rows.push(tr);
    };
    const row = (say, resultNode) => {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      a.textContent = '“' + say + '”';
      const b = document.createElement('td');
      b.append(resultNode);
      tr.append(a, b);
      rows.push(tr);
    };
    const sym = (text) => {
      const s = document.createElement('span');
      s.className = 'sym';
      s.textContent = text;
      return s;
    };
    const desc = (text) => {
      const s = document.createElement('span');
      s.className = 'cmd-desc';
      s.textContent = text;
      return s;
    };

    group('যতিচিহ্ন');
    BT.COMMANDS.punctuation.forEach((c) => row(c.name, sym(c.insert)));
    BT.COMMANDS.breaks.forEach((c) => row(c.name, sym(c.insert === '\n' ? '↵' : '¶')));
    group('নিয়ন্ত্রণ (শুধু কমান্ডটি একা বললে)');
    BT.COMMANDS.controls.forEach((c) => row(c.name, desc(c.desc)));
    els.commandList.replaceChildren(...rows);
  }

  /* ---------------- Settings ---------------- */
  function loadSettings() {
    const s = store.get(KEYS.settings, {});
    if (s && typeof s === 'object') {
      if ([...els.lang.options].some((o) => o.value === s.lang)) els.lang.value = s.lang;
      if (typeof s.commands === 'boolean') els.optCommands.checked = s.commands;
      if (typeof s.digits === 'boolean') els.optDigits.checked = s.digits;
    }
  }

  function saveSettings() {
    store.set(KEYS.settings, { lang: els.lang.value, commands: els.optCommands.checked, digits: els.optDigits.checked });
  }

  /* ---------------- Wire up ---------------- */
  function init() {
    loadSettings();
    renderCommandHelp();
    renderHistory();

    const draft = store.get(KEYS.draft, '');
    if (typeof draft === 'string') els.transcript.value = draft;
    updateStats();

    sizeCanvas();
    drawIdle();
    window.addEventListener('resize', () => { sizeCanvas(); if (!viz.analyser) drawIdle(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      colors = readColors();
      if (!viz.analyser) drawIdle();
    });

    if (!SpeechRecognition) {
      els.unsupported.hidden = false;
      els.micBtn.disabled = true;
      els.micLabel.textContent = 'এই ব্রাউজারে ভয়েস রিকগনিশন নেই';
    } else {
      recognition = createRecognition();
    }

    if (!window.isSecureContext) {
      showNotice('মাইক্রোফোন শুধু নিরাপদ পেজে (https বা localhost) কাজ করে। start.bat চালিয়ে অ্যাপটি খুলুন।', 'error');
    } else if (location.protocol === 'file:') {
      showNotice('টিপ: start.bat (বা python server.py) দিয়ে চালালে মাইক্রোফোনের অনুমতি বারবার চাইবে না।', 'info');
    } else if (!navigator.onLine) {
      showNotice('আপনি এখন অফলাইনে আছেন। ভয়েস রিকগনিশনের জন্য ইন্টারনেট সংযোগ প্রয়োজন।', 'error');
    }
    window.addEventListener('offline', () => showNotice('ইন্টারনেট সংযোগ বিচ্ছিন্ন হয়েছে। ভয়েস রিকগনিশনের জন্য ইন্টারনেট প্রয়োজন।', 'error'));
    window.addEventListener('online', hideNotice);

    els.micBtn.addEventListener('click', toggleListening);
    els.noticeClose.addEventListener('click', hideNotice);
    els.copyBtn.addEventListener('click', copyTranscript);
    els.downloadBtn.addEventListener('click', downloadTranscript);
    els.saveBtn.addEventListener('click', saveCurrent);
    els.clearBtn.addEventListener('click', clearTranscript);
    els.speakBtn.addEventListener('click', () => (speech.active ? stopSpeaking() : speak()));

    els.transcript.addEventListener('input', () => {
      undoStack.length = 0; // manual edits invalidate voice-undo history
      afterTranscriptChange();
    });

    els.lang.addEventListener('change', () => {
      saveSettings();
      pickVoice();
      // Restart with the new language; onend will start it again.
      if (wantListening && engineRunning) {
        try { recognition.stop(); } catch (_) { /* ignore */ }
      }
    });
    els.optCommands.addEventListener('change', saveSettings);
    els.optDigits.addEventListener('change', saveSettings);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (recognition) toggleListening();
      } else if (e.key === 'Escape' && wantListening) {
        stopListening();
      }
    });

    if (speech.supported) {
      pickVoice();
      window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    } else {
      els.speakBtn.hidden = true;
    }

    setUI('idle');
  }

  init();
})();
