// Quadro — interface. Fala com o processo principal por window.quadro (invoke / on).
(() => {
  const q = window.quadro;
  const $ = (s) => document.querySelector(s);
  const P = {}; // propriedades do motor
  let S = { recent: [] }; // configurações
  const ui = { clockFrames: false, guide: 0, bg: 0, scrub: false, hideTimer: 0, fullscreen: false, isWin: true };
  const GUIDES = [['', 'Sem guias'], ['SAFE', 'Áreas seguras (ação 93% · título 90%)'], ['1/3', 'Terços e centro'], ['9:16', 'Recorte 9:16'], ['1:1', 'Recorte 1:1'], ['4:5', 'Recorte 4:5']];
  const BGS = [['', 'Preto', 'color', '#000000'], ['XDZ', 'Xadrez', 'tiles', null], ['CZ', 'Cinza 50%', 'color', '#808080'], ['BR', 'Branco', 'color', '#ffffff'], ['VD', 'Verde', 'color', '#00b140']];
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

  const cmd = (...a) => q.invoke('cmd', ...a);
  const set = (n, v) => q.invoke('set', n, v);
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const fps = () => num(P['container-fps']);
  const dur = () => num(P['duration']);
  const pos = () => num(P['time-pos']);
  const pad = (n, l = 2) => String(Math.max(0, Math.floor(n))).padStart(l, '0');

  function timecode(t) {
    t = Math.max(0, num(t));
    const f = fps();
    if (f > 0) {
      const total = Math.round(t * f), fr = Math.round(f) || 1;
      const ff = total % fr, s = Math.floor(total / fr);
      return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}:${pad(ff)}`;
    }
    return `${pad(t / 3600)}:${pad((t % 3600) / 60)}:${pad(t % 60)}.${pad((t % 1) * 1000, 3)}`;
  }
  const frameAt = (t) => Math.round(Math.max(0, num(t)) * fps());
  const totalFrames = () => num(P['estimated-frame-count']) || Math.round(dur() * fps());
  const baseName = (p) => (p || '').split(/[\\/]/).pop();
  const human = (b) => { if (!b) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (b >= 1024 && i < 4) { b /= 1024; i++; } return `${b.toFixed(i ? 1 : 0)} ${u[i]}`; };

  // ---------- Renderização ----------
  let raf = 0;
  const dirty = new Set();
  function mark(...parts) { parts.forEach((p) => dirty.add(p)); if (!raf) raf = requestAnimationFrame(render); }
  function render() {
    raf = 0;
    const d = new Set(dirty); dirty.clear();
    if (d.has('idle')) {
      document.body.classList.toggle('idle', P['idle-active'] !== false);
      if (P['idle-active'] !== false) closePanels();
      showUi();
    }
    if (d.has('time')) renderTime();
    if (d.has('play')) {
      const paused = P['pause'] !== false || P['eof-reached'] === true;
      $('#playIcon use').setAttribute('href', paused ? '#i-play' : '#i-pause');
      showUi();
    }
    if (d.has('meta')) renderMeta();
    if (d.has('vol')) {
      const v = num(P['volume'], 100), m = P['mute'] === true;
      $('#volFill').style.width = `${Math.min(100, (v / 150) * 100)}%`;
      $('#volFill').classList.toggle('boost', v > 100);
      $('#volIcon use').setAttribute('href', m || v === 0 ? '#i-mute' : '#i-vol');
    }
    if (d.has('loop')) {
      $('#loopBtn').classList.toggle('on', P['loop-file'] === 'inf' || P['loop-file'] === true);
      const a = P['ab-loop-a'], b = P['ab-loop-b'], hasA = typeof a === 'number', hasB = typeof b === 'number';
      $('#abBtn').classList.toggle('on', hasA && hasB);
      const D = dur();
      $('#markA').style.display = hasA && D ? 'block' : 'none';
      $('#markB').style.display = hasB && D ? 'block' : 'none';
      if (D && hasA) $('#markA').style.left = `${(a / D) * 100}%`;
      if (D && hasB) $('#markB').style.left = `${(b / D) * 100}%`;
      const r = $('#abRange');
      r.style.display = hasA && hasB && D ? 'block' : 'none';
      if (hasA && hasB && D) { r.style.left = `${(Math.min(a, b) / D) * 100}%`; r.style.width = `${(Math.abs(b - a) / D) * 100}%`; }
    }
    if (d.has('speed')) { const s = num(P['speed'], 1); $('#speedBtn').textContent = `${+s.toFixed(2)}×`; $('#speedBtn').classList.toggle('on', Math.abs(s - 1) > 0.001); }
    if (d.has('frame')) renderFrame();
    if (d.has('list')) renderList();
    if (d.has('info') && $('#infoPanel').classList.contains('open')) renderInfo();
    if (d.has('recent')) renderRecent();
  }

  function renderTime() {
    const t = ui.scrub ? ui.scrubTime : pos(), D = dur();
    const pct = D ? Math.min(100, (t / D) * 100) : 0;
    $('#played').style.width = `${pct}%`;
    $('#knob').style.left = `${pct}%`;
    if (ui.clockFrames && fps()) { $('#tcNow').textContent = `Q ${frameAt(t)}`; $('#tcDur').textContent = String(totalFrames()); }
    else { $('#tcNow').textContent = timecode(t); $('#tcDur').textContent = timecode(D); }
  }
  function renderMeta() {
    $('#fileName').textContent = P['media-title'] || P['filename'] || '';
    const vp = P['video-params'] || {};
    const bits = [];
    if (vp.w && vp.h) bits.push(`${vp.w}×${vp.h}`);
    if (fps()) bits.push(`${+fps().toFixed(3)} fps`);
    if (P['video-codec']) bits.push(String(P['video-codec']).split(/[\s(/]/)[0].toUpperCase());
    if (hasAlpha()) bits.push('ALFA');
    $('#fileMeta').textContent = bits.join(' · ');
    $('#fpsTag').textContent = fps() ? `${+fps().toFixed(3)} fps` : '';
  }
  const hasAlpha = () => { const vp = P['video-params'] || {}; return !!vp.alpha && vp.alpha !== 'none' || /a(\d|le|be|$)|^(ya|rgba|bgra|argb|abgr|yuva|gbra)/.test(vp.pixelformat || ''); };

  function videoRect() {
    const o = P['osd-dimensions']; if (!o || !o.w) return null;
    const k = window.devicePixelRatio || 1;
    return { x: o.ml / k, y: o.mt / k, w: (o.w - o.ml - o.mr) / k, h: (o.h - o.mt - o.mb) / k };
  }
  function renderFrame() {
    const r = videoRect(), f = $('#frame'), g = $('#guides');
    if (!r || r.w < 4) { g.innerHTML = ''; return; }
    Object.assign(f.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    const mode = GUIDES[ui.guide][0];
    let h = '';
    const box = (pct, cls, label) => { const m = (100 - pct) / 2; return `<div class="g ${cls}" style="inset:${m}%"><label>${label}</label></div>`; };
    if (mode === 'SAFE') h = box(93, 'action', 'AÇÃO 93%') + box(90, 'title', 'TÍTULO 90%');
    if (mode === '1/3') h = [33.333, 66.666].map((p) => `<div class="line" style="left:${p}%;top:0;bottom:0;width:1px"></div><div class="line" style="top:${p}%;left:0;right:0;height:1px"></div>`).join('')
      + '<div class="line" style="left:calc(50% - 10px);top:50%;width:20px;height:1px"></div><div class="line" style="top:calc(50% - 10px);left:50%;height:20px;width:1px"></div>';
    if (mode.includes(':')) {
      const [a, b] = mode.split(':').map(Number), target = a / b, cur = r.w / r.h;
      if (target < cur) { const side = ((1 - target / cur) / 2) * 100; h = `<div class="mask" style="left:0;top:0;bottom:0;width:${side}%"></div><div class="mask" style="right:0;top:0;bottom:0;width:${side}%"></div><div class="g" style="left:${side}%;right:${side}%;top:0;bottom:0"><label>${mode}</label></div>`; }
      else { const side = ((1 - cur / target) / 2) * 100; h = `<div class="mask" style="top:0;left:0;right:0;height:${side}%"></div><div class="mask" style="bottom:0;left:0;right:0;height:${side}%"></div><div class="g" style="top:${side}%;bottom:${side}%;left:0;right:0"><label>${mode}</label></div>`; }
    }
    g.innerHTML = h;
    $('#guideTag').textContent = mode;
  }
  function renderList() {
    const list = Array.isArray(P['playlist']) ? P['playlist'] : [], cur = num(P['playlist-pos'], -1);
    const ol = $('#listItems'); ol.textContent = '';
    list.forEach((it, i) => {
      const li = document.createElement('li'); if (i === cur) li.className = 'cur';
      const n = document.createElement('span'); n.textContent = i + 1;
      const b = document.createElement('b'); b.textContent = it.title || baseName(it.filename); b.title = it.filename || '';
      li.append(n, b); li.onclick = () => set('playlist-pos', i); ol.append(li);
    });
    const c = ol.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'nearest' });
  }
  function renderInfo() {
    const vp = P['video-params'] || {};
    const rows = [
      ['Arquivo', P['filename'] || '—'], ['Formato', P['file-format'] || '—'], ['Tamanho', human(num(P['file-size']))],
      ['Resolução', vp.w ? `${vp.w} × ${vp.h}` : '—'], ['Quadros/s', fps() ? String(+fps().toFixed(3)) : '—'],
      ['Duração', `${timecode(dur())}${fps() ? ` · ${totalFrames()} quadros` : ''}`],
      ['Vídeo', P['video-codec'] || '—'], ['Pixels', vp.pixelformat || '—'], ['Canal alfa', hasAlpha() ? 'sim' : 'não'],
      ['Cores', [vp.colormatrix, vp.primaries, vp.gamma].filter(Boolean).join(' / ') || '—'],
      ['Taxa de vídeo', P['video-bitrate'] ? `${(P['video-bitrate'] / 1e6).toFixed(2)} Mb/s` : '—'],
      ['Áudio', P['audio-codec-name'] || 'sem áudio'], ['Decodificação', P['hwdec-current'] && P['hwdec-current'] !== 'no' ? `placa de vídeo (${P['hwdec-current']})` : 'processador'],
    ];
    const dl = $('#infoList'); dl.textContent = '';
    for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
  }
  function renderRecent() {
    const box = $('#recent'); box.textContent = '';
    const list = (S.recent || []).slice(0, 6);
    if (!list.length) return;
    const h = document.createElement('h3'); h.textContent = 'Recentes';
    const clr = document.createElement('button'); clr.textContent = 'Limpar'; clr.onclick = async () => { S = await q.invoke('clear-recent'); mark('recent'); };
    h.append(clr); box.append(h);
    for (const r of list) {
      const b = document.createElement('button'); b.className = 'item';
      const n = document.createElement('b'); n.textContent = r.name;
      const p = document.createElement('span'); p.textContent = r.path.slice(0, -r.name.length - 1);
      b.append(n, p); b.onclick = () => q.invoke('open-paths', [r.path]); box.append(b);
    }
  }

  const PROP_PARTS = {
    'idle-active': ['idle'], 'time-pos': ['time'], 'duration': ['time', 'loop', 'info'], 'pause': ['play'], 'eof-reached': ['play'],
    'volume': ['vol'], 'mute': ['vol'], 'speed': ['speed'], 'loop-file': ['loop'], 'ab-loop-a': ['loop'], 'ab-loop-b': ['loop'],
    'media-title': ['meta'], 'filename': ['meta', 'info'], 'container-fps': ['meta', 'time', 'info'], 'video-params': ['meta', 'info', 'frame'],
    'video-codec': ['meta', 'info'], 'osd-dimensions': ['frame'], 'playlist': ['list'], 'playlist-pos': ['list'],
  };
  function onProp(name, value) { P[name] = value; mark(...(PROP_PARTS[name] || ['info'])); }

  // ---------- Ações ----------
  function toast(msg, kind = 'info', action) {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
    if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.fn; t.append(b); }
    $('#toasts').append(t); setTimeout(() => t.remove(), action ? 6000 : 3600);
  }
  const flash = (msg) => { $('#toasts').querySelectorAll('.flash').forEach((e) => e.remove()); const t = document.createElement('div'); t.className = 'toast flash'; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), 1100); };
  const playing = () => P['idle-active'] === false;
  const seekRel = (s) => cmd('seek', s, 'relative+exact');
  const A = {
    open: () => q.invoke('open-dialog'),
    toggle: () => { if (!playing()) return A.open(); if (P['eof-reached'] === true) { cmd('seek', 0, 'absolute'); set('pause', false); } else cmd('cycle', 'pause'); },
    frameBack: () => { set('pause', true); cmd('frame-step', -1, 'seek'); },
    frameFwd: () => { set('pause', true); cmd('frame-step', 1, 'seek'); },
    prev: () => cmd('playlist-prev'), next: () => cmd('playlist-next'),
    loop: () => { const on = !(P['loop-file'] === 'inf' || P['loop-file'] === true); set('loop-file', on ? 'inf' : 'no'); flash(on ? 'Repetição ligada' : 'Repetição desligada'); },
    markIn: () => { set('ab-loop-a', pos()); flash(`Início do trecho: ${timecode(pos())}`); },
    markOut: () => { if (typeof P['ab-loop-a'] !== 'number') set('ab-loop-a', 0); set('ab-loop-b', pos()); flash(`Fim do trecho: ${timecode(pos())}`); },
    clearAb: () => { set('ab-loop-a', 'no'); set('ab-loop-b', 'no'); flash('Loop de trecho removido'); },
    ab: () => { const a = typeof P['ab-loop-a'] === 'number', b = typeof P['ab-loop-b'] === 'number'; if (!a) A.markIn(); else if (!b) A.markOut(); else A.clearAb(); },
    speed: (e) => openMenu(e.currentTarget, [{ h: 'Velocidade' }, ...SPEEDS.map((s) => ({ label: `${s}×`, sel: Math.abs(num(P['speed'], 1) - s) < 0.001, fn: () => set('speed', s) }))]),
    speedStep: (dir) => { const cur = num(P['speed'], 1); let i = SPEEDS.findIndex((s) => s >= cur - 0.001); if (i < 0) i = SPEEDS.length - 1; const n = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))]; set('speed', n); flash(`Velocidade ${n}×`); },
    mute: () => cmd('cycle', 'mute'),
    volBy: (d) => { const v = Math.max(0, Math.min(150, Math.round(num(P['volume'], 100) + d))); set('volume', v); flash(`Volume ${v}%`); },
    shot: async () => { if (!playing()) return; const f = await q.invoke('screenshot'); if (f) toast(`Quadro salvo: ${baseName(f)}`, 'ok', { label: 'Mostrar na pasta', fn: () => q.invoke('reveal', f) }); else toast('Não foi possível salvar o quadro.', 'error'); },
    fullscreen: () => q.invoke('fullscreen'),
    info: () => togglePanel('#infoPanel', renderInfo), playlist: () => togglePanel('#listPanel', renderList),
    help: () => $('#help').classList.toggle('open'),
    clockMode: () => { ui.clockFrames = !ui.clockFrames; mark('time'); },
    guides: () => { ui.guide = (ui.guide + 1) % GUIDES.length; mark('frame'); flash(GUIDES[ui.guide][1]); },
    bg: () => setBg((ui.bg + 1) % BGS.length),
    pin: async () => { S = await q.invoke('setting', 'alwaysOnTop', !S.alwaysOnTop); $('#pinBtn').classList.toggle('on', !!S.alwaysOnTop); flash(S.alwaysOnTop ? 'Sempre visível' : 'Janela normal'); },
    zoomReset: () => { set('video-zoom', 0); set('video-pan-x', 0); set('video-pan-y', 0); flash('Zoom 100%'); },
    register: async () => { const r = await q.invoke('register-default'); if (r.ok) toast('Quadro registrado. Nas Configurações do Windows que abriram, escolha o Quadro para os tipos de vídeo.', 'ok'); else toast('Não foi possível registrar: ' + r.error, 'error'); },
    menu: (e) => {
      const tracks = Array.isArray(P['track-list']) ? P['track-list'] : [];
      const tr = (type, prop, title) => { const l = tracks.filter((t) => t.type === type); if (type === 'audio' && l.length < 2) return []; if (!l.length) return [];
        return [{ h: title }, ...(type === 'sub' ? [{ label: 'Desligadas', sel: !P[prop], fn: () => set(prop, 'no') }] : []), ...l.map((t) => ({ label: t.title || t.lang || `Faixa ${t.id}`, hint: t.lang || t.codec || '', sel: P[prop] === t.id, fn: () => set(prop, t.id) }))]; };
      openMenu(e.currentTarget, [
        { label: 'Abrir arquivo…', hint: 'Ctrl O', fn: A.open },
        { label: 'Pasta das capturas', fn: () => q.invoke('reveal', '') },
        { hr: 1 }, ...tr('audio', 'aid', 'Áudio'), ...tr('sub', 'sid', 'Legendas'),
        { h: 'Reprodução' },
        { label: 'Avançar sozinho para o próximo', hint: S.autoNext ? 'ligado' : 'desligado', sel: S.autoNext, fn: async () => { S = await q.invoke('setting', 'autoNext', !S.autoNext); } },
        { label: 'Zoom 100%', hint: 'Z', fn: A.zoomReset },
        { h: 'Windows' },
        { label: 'Definir como player padrão…', fn: A.register },
        { label: 'Remover registro do Windows', fn: async () => { const r = await q.invoke('unregister-default'); toast(r.ok ? 'Registro removido.' : 'Falhou: ' + r.error, r.ok ? 'ok' : 'error'); } },
        { hr: 1 }, { label: 'Atalhos do teclado', hint: 'F1', fn: A.help },
      ]);
    },
  };
  function setBg(i) {
    ui.bg = i; const b = BGS[i];
    set('background', b[2]); if (b[3]) set('background-color', b[3]);
    $('#bgTag').textContent = b[0]; flash(`Fundo: ${b[1]}`);
  }
  function togglePanel(sel, fill) {
    const el = $(sel), open = !el.classList.contains('open');
    closePanels(); if (open) { el.classList.add('open'); fill(); }
  }
  function closePanels() { document.querySelectorAll('.panel.open').forEach((p) => p.classList.remove('open')); closeMenu(); }
  function openMenu(anchor, items) {
    const m = $('#menu'); m.textContent = '';
    for (const it of items) {
      if (it.hr) { m.append(document.createElement('hr')); continue; }
      if (it.h) { const h = document.createElement('h4'); h.textContent = it.h; m.append(h); continue; }
      const b = document.createElement('button'); if (it.sel) b.className = 'sel';
      const s = document.createElement('span'); s.textContent = it.label;
      const e = document.createElement('em'); e.textContent = it.sel && !it.hint ? '●' : it.hint || '';
      b.append(s, e); b.onclick = () => { closeMenu(); it.fn(); }; m.append(b);
    }
    m.classList.add('open');
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = (r.top > innerHeight / 2 ? Math.max(8, r.top - hh - 8) : r.bottom + 8) + 'px';
  }
  const closeMenu = () => $('#menu').classList.remove('open');

  // ---------- Visibilidade dos controles ----------
  function showUi() {
    document.body.classList.add('ui-on'); document.body.classList.remove('hide-cursor');
    clearTimeout(ui.hideTimer);
    ui.hideTimer = setTimeout(() => {
      const busy = P['pause'] !== false || !playing() || ui.scrub || document.querySelector('.pop.open, .panel.open, .modal.open') || document.querySelector('#bar:hover, #top:hover');
      if (busy) return;
      document.body.classList.remove('ui-on'); document.body.classList.add('hide-cursor');
    }, 2400);
  }

  // ---------- Eventos ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) { e.stopPropagation(); if (b.dataset.act !== 'menu' && b.dataset.act !== 'speed') closeMenu(); A[b.dataset.act]({ currentTarget: b }); return; }
    if (!e.target.closest('#menu')) closeMenu();
    if (e.target.id === 'help') $('#help').classList.remove('open');
  });
  document.addEventListener('mousemove', showUi);

  // Clique no vídeo: um clique pausa, dois alternam a tela cheia; arrastar move o vídeo quando há zoom.
  let clickTimer = 0, drag = null;
  const stage = $('#stage');
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !playing()) return;
    drag = { x: e.clientX, y: e.clientY, px: num(P['video-pan-x']), py: num(P['video-pan-y']), moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const r = videoRect(); if (!r || !num(P['video-zoom'])) return;
    set('video-pan-x', drag.px + dx / r.w); set('video-pan-y', drag.py + dy / r.h);
  });
  stage.addEventListener('pointerup', (e) => {
    const d = drag; drag = null; if (!d || d.moved) return;
    if (document.querySelector('.pop.open')) return closeMenu();
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = 0; A.fullscreen(); }
    else clickTimer = setTimeout(() => { clickTimer = 0; A.toggle(); }, 230);
  });
  stage.addEventListener('dblclick', () => { if (!playing()) A.open(); });
  document.addEventListener('wheel', (e) => {
    if (!playing() || e.target.closest('.panel, .pop, .sheet')) return;
    if (e.ctrlKey) { const z = Math.max(-1, Math.min(4, num(P['video-zoom']) + (e.deltaY < 0 ? 0.15 : -0.15))); set('video-zoom', +z.toFixed(2)); flash(`Zoom ${Math.round(2 ** z * 100)}%`); if (z === 0) { set('video-pan-x', 0); set('video-pan-y', 0); } }
    else A.volBy(e.deltaY < 0 ? 5 : -5);
  }, { passive: true });

  // Linha do tempo
  const tl = $('#timeline');
  let seekBusy = false, seekNext = null;
  async function seekTo(t, exact) {
    seekNext = { t, exact }; if (seekBusy) return; seekBusy = true;
    while (seekNext) { const s = seekNext; seekNext = null; await cmd('seek', s.t, s.exact ? 'absolute+exact' : 'absolute+keyframes'); }
    seekBusy = false;
  }
  const tlTime = (e) => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur(); };
  function tlHover(e) {
    const r = tl.getBoundingClientRect(), t = tlTime(e), tip = $('#hoverTip');
    tip.textContent = fps() ? `${timecode(t)}  ·  Q ${frameAt(t)}` : timecode(t);
    tip.style.left = Math.max(60, Math.min(r.width - 60, e.clientX - r.left)) + 'px';
  }
  tl.addEventListener('pointerdown', (e) => { if (!dur()) return; ui.scrub = true; tl.classList.add('drag'); tl.setPointerCapture(e.pointerId); ui.scrubTime = tlTime(e); seekTo(ui.scrubTime, dur() < 600); mark('time'); });
  tl.addEventListener('pointermove', (e) => { tlHover(e); if (!ui.scrub) return; ui.scrubTime = tlTime(e); seekTo(ui.scrubTime, dur() < 600); mark('time'); });
  tl.addEventListener('pointerup', (e) => { if (!ui.scrub) return; seekTo(tlTime(e), true); ui.scrub = false; tl.classList.remove('drag'); });
  // Volume
  const vt = $('#volTrack');
  const volAt = (e) => { const r = vt.getBoundingClientRect(); set('volume', Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 150)); };
  vt.addEventListener('pointerdown', (e) => { vt.setPointerCapture(e.pointerId); vt.dataset.drag = '1'; volAt(e); });
  vt.addEventListener('pointermove', (e) => { if (vt.dataset.drag) volAt(e); });
  vt.addEventListener('pointerup', () => { delete vt.dataset.drag; });

  // Dicas
  let tipTimer = 0;
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest('[data-tip]'); clearTimeout(tipTimer); const tip = $('#tip'); tip.classList.remove('on'); if (!b) return;
    tipTimer = setTimeout(() => {
      tip.textContent = b.dataset.tip; const r = b.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
      tip.style.top = (r.top > innerHeight / 2 ? r.top - 34 : r.bottom + 8) + 'px'; tip.classList.add('on');
    }, 450);
  });

  // Arrastar e soltar
  let dragDepth = 0;
  addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('#drop').classList.add('on'); });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('on'); } });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('on');
    const paths = [...e.dataTransfer.files].map((f) => q.pathFor(f)).filter(Boolean);
    if (paths.length) q.invoke('open-paths', paths);
  });

  // Teclado
  const KEYS = [
    ['Espaço / K', 'Reproduzir ou pausar'], [', e .', 'Quadro anterior / próximo'], ['← →', 'Voltar / avançar 5 s'], ['Shift ← →', 'Voltar / avançar 1 s'],
    ['Home / End', 'Início / fim'], ['I · O · X', 'Início, fim e limpar loop de trecho'], ['L', 'Repetir o vídeo'], ['[ e ]', 'Velocidade'],
    ['Backspace', 'Velocidade normal'], ['↑ ↓ ou rolagem', 'Volume'], ['M', 'Mudo'], ['S', 'Salvar quadro em PNG'], ['G', 'Guias de área segura'],
    ['B', 'Fundo para conferir alfa'], ['Ctrl + rolagem', 'Zoom (arraste para mover)'], ['Z', 'Zoom 100%'], ['D', 'Detalhes do arquivo'], ['P', 'Lista da pasta'],
    ['PgUp / PgDn', 'Vídeo anterior / próximo'], ['F ou duplo clique', 'Tela cheia'], ['T', 'Manter sempre visível'], ['Ctrl O', 'Abrir arquivo'],
  ];
  $('#helpGrid').innerHTML = KEYS.map(([k, d]) => `<div><span>${d}</span><kbd>${k}</kbd></div>`).join('');
  addEventListener('keydown', (e) => {
    const k = e.key, low = k.length === 1 ? k.toLowerCase() : k;
    if (e.ctrlKey && low === 'o') { e.preventDefault(); return A.open(); }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const map = {
      ' ': A.toggle, k: A.toggle, ',': A.frameBack, '.': A.frameFwd, '<': A.frameBack, '>': A.frameFwd,
      ArrowLeft: () => seekRel(e.shiftKey ? -1 : -5), ArrowRight: () => seekRel(e.shiftKey ? 1 : 5),
      ArrowUp: () => A.volBy(5), ArrowDown: () => A.volBy(-5), m: A.mute, f: A.fullscreen, F11: A.fullscreen, l: A.loop,
      i: A.markIn, o: A.markOut, x: A.clearAb, '[': () => A.speedStep(-1), ']': () => A.speedStep(1), Backspace: () => { set('speed', 1); flash('Velocidade 1×'); },
      s: A.shot, g: A.guides, b: A.bg, z: A.zoomReset, d: A.info, p: A.playlist, t: A.pin, F1: A.help, '?': A.help,
      Home: () => cmd('seek', 0, 'absolute'), End: () => cmd('seek', Math.max(0, dur() - 0.05), 'absolute+exact'),
      PageUp: A.prev, PageDown: A.next,
      Escape: () => { if (document.querySelector('.modal.open, .pop.open, .panel.open')) { $('#help').classList.remove('open'); closePanels(); } else if (ui.fullscreen) q.invoke('fullscreen', false); },
    };
    const fn = map[low]; if (!fn) return;
    e.preventDefault(); if (e.repeat && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ',', '.', '<', '>'].includes(low)) return;
    fn(); showUi();
  });
  addEventListener('resize', () => mark('frame'));

  // ---------- Ligação com o processo principal ----------
  q.on('prop', onProp);
  q.on('toast', (m, kind) => toast(m, kind));
  q.on('settings', (s) => { S = s; mark('recent'); });
  q.on('reset', () => { for (const k of Object.keys(P)) delete P[k]; ui.bg = 0; $('#bgTag').textContent = ''; mark('idle', 'time', 'play', 'meta', 'vol', 'loop', 'speed', 'frame', 'list'); });
  q.on('fullscreen', (v) => { ui.fullscreen = v; $('#fullIcon use').setAttribute('href', v ? '#i-unfull' : '#i-full'); });
  q.invoke('init').then((st) => {
    Object.assign(P, st.props || {}); S = st.settings || S; ui.fullscreen = !!st.fullscreen; ui.isWin = st.isWin !== false;
    if (!ui.isWin) $('#registerLink').style.display = 'none';
    $('#pinBtn').classList.toggle('on', !!S.alwaysOnTop);
    mark('idle', 'time', 'play', 'meta', 'vol', 'loop', 'speed', 'frame', 'list', 'recent');
  });
})();
