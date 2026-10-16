/*
 * Mound Report — app logic
 * Views: Staff (roster), Pitcher profile, Session detail, Session form, Session Log, Data & Metrics.
 * Metric definitions come from data/metrics.json. A copy is embedded below as a fallback
 * for when the app is opened straight from disk (file://) and the browser blocks fetch().
 */
(() => {
  'use strict';

  const FALLBACK_METRICS = {"sessionTypes":[{"id":"bullpen","label":"Bullpen"},{"id":"game","label":"In-Game"},{"id":"livebp","label":"Live BP"},{"id":"scrimmage","label":"Scrimmage"}],"sources":["TrackMan","Rapsodo","Yakkertech","Hawk-Eye","PitchLogic","Pocket Radar","Manual / Other"],"grades":["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"],"classYears":[{"id":"Fr","label":"Freshman"},{"id":"So","label":"Sophomore"},{"id":"Jr","label":"Junior"},{"id":"Sr","label":"Senior"},{"id":"Grad","label":"Graduate"}],"groups":[{"id":"fastball","label":"Fastball","metrics":[{"key":"fbMaxVelo","label":"Max Fastball Velocity","short":"Max velo","unit":"mph","step":0.1,"min":40,"max":110,"decimals":1,"better":"higher","description":"Fastest fastball of the session, from the radar or tracking unit."},{"key":"fbAvgVelo","label":"Avg Fastball Velocity","short":"Avg velo","unit":"mph","step":0.1,"min":40,"max":110,"decimals":1,"better":"higher","description":"Average velocity across every fastball thrown in the session."},{"key":"fbMaxSpin","label":"Max Fastball Spin Rate","short":"FB spin","unit":"rpm","step":1,"min":500,"max":3800,"decimals":0,"better":"higher","description":"Highest fastball spin rate recorded, in revolutions per minute."},{"key":"ivb","label":"Induced Vertical Break","short":"IVB","unit":"in","step":0.1,"min":-30,"max":30,"decimals":1,"better":"higher","description":"How much the fastball rides compared with a pitch thrown with no spin, in inches. More IVB means more carry through the top of the zone."}]},{"id":"curveball","label":"Curveball","metrics":[{"key":"cbMaxSpin","label":"Max Curveball Spin Rate","short":"CB max spin","unit":"rpm","step":1,"min":500,"max":4000,"decimals":0,"better":"higher","description":"Highest curveball spin rate recorded in the session."},{"key":"cbAvgSpin","label":"Avg Curveball Spin Rate","short":"CB avg spin","unit":"rpm","step":1,"min":500,"max":4000,"decimals":0,"better":"higher","description":"Average spin rate across all curveballs thrown."}]},{"id":"slider","label":"Slider","metrics":[{"key":"slMaxSpin","label":"Max Slider Spin Rate","short":"SL max spin","unit":"rpm","step":1,"min":500,"max":4000,"decimals":0,"better":"higher","description":"Highest slider spin rate recorded in the session."},{"key":"slAvgSpin","label":"Avg Slider Spin Rate","short":"SL avg spin","unit":"rpm","step":1,"min":500,"max":4000,"decimals":0,"better":"higher","description":"Average spin rate across all sliders thrown."}]},{"id":"changeup","label":"Changeup","metrics":[{"key":"chMaxSpin","label":"Max Changeup Spin Rate","short":"CH max spin","unit":"rpm","step":1,"min":300,"max":3500,"decimals":0,"better":"lower","description":"Highest changeup spin rate recorded. Lower spin usually means more drop and fade."},{"key":"chAvgSpin","label":"Avg Changeup Spin Rate","short":"CH avg spin","unit":"rpm","step":1,"min":300,"max":3500,"decimals":0,"better":"lower","description":"Average spin rate across all changeups thrown."}]},{"id":"advanced","label":"Advanced","metrics":[{"key":"bauerUnits","label":"Bauer Units","short":"Bauer units","unit":"BU","step":0.1,"min":5,"max":45,"decimals":1,"better":"higher","description":"Fastball spin rate divided by velocity (RPM ÷ MPH). Lets you compare spin between pitchers who throw at different speeds. Most fastballs land between 22 and 28."},{"key":"movementScore","label":"Advanced Movement Score","short":"Movement score","unit":"","step":0.1,"min":0,"max":200,"decimals":0,"better":"higher","description":"Overall movement score from your tracking app. Enter it on the same scale the app uses (for example, 100 = average)."},{"key":"tilt","label":"Measured Tilt","short":"Tilt","type":"tilt","unit":"","placeholder":"1:15","description":"Spin axis shown as a clock face, measured from ball flight. 12:00 is pure backspin. Right-handed four-seamers usually sit near 12:30 to 1:30; lefties near 10:30 to 11:30."},{"key":"efficiency","label":"Spin Efficiency","short":"Efficiency","unit":"%","step":0.1,"min":0,"max":100,"decimals":0,"better":"higher","description":"Share of total spin that creates movement (transverse spin). 100% means the pitch has no gyro spin."},{"key":"gyroAngle","label":"Gyro Angle","short":"Gyro","unit":"°","step":0.1,"min":0,"max":90,"decimals":0,"better":"neutral","description":"Angle between the spin axis and the direction of flight. 0° is pure backspin or topspin; 90° is pure bullet spin. The right number depends on the pitch."}]}],"charts":[{"id":"fbVelo","label":"Fastball velocity","metrics":["fbMaxVelo","fbAvgVelo"]},{"id":"fbSpin","label":"Fastball spin rate","metrics":["fbMaxSpin"]},{"id":"ivb","label":"Induced vertical break","metrics":["ivb"]},{"id":"cbSpin","label":"Curveball spin rate","metrics":["cbMaxSpin","cbAvgSpin"]},{"id":"slSpin","label":"Slider spin rate","metrics":["slMaxSpin","slAvgSpin"]},{"id":"chSpin","label":"Changeup spin rate","metrics":["chMaxSpin","chAvgSpin"]},{"id":"bauer","label":"Bauer units","metrics":["bauerUnits"]},{"id":"move","label":"Movement score","metrics":["movementScore"]},{"id":"eff","label":"Spin efficiency","metrics":["efficiency"]},{"id":"gyro","label":"Gyro angle","metrics":["gyroAngle"]}]};
  const METRICS_URL = 'data/metrics.json';
  const SAMPLE_URL = 'data/sample-data.json';
  const GRADE_PTS = { 'A+': 4.3, 'A': 4, 'A-': 3.7, 'B+': 3.3, 'B': 3, 'B-': 2.7, 'C+': 2.3, 'C': 2, 'C-': 1.7, 'D+': 1.3, 'D': 1, 'D-': 0.7, 'F': 0 };

  const state = {
    metrics: null,
    defs: {},
    pitchers: [],
    sessions: [],
    view: { name: 'roster', id: null },
    rosterFilter: { q: '', hand: 'all' },
    logFilter: { pitcher: 'all', type: 'all' },
    chartId: null,
    form: null,
    mediaItems: [],
    urls: []
  };

  /* ---------- Small helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const pad2 = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayISO = () => toISO(new Date());
  const parseDate = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const fmtDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => parseDate(iso).toLocaleDateString('en-US', opts);
  const fmtShort = iso => fmtDate(iso, { month: 'short', day: 'numeric' });
  const daysAgoISO = n => { const d = parseDate(todayISO()); d.setDate(d.getDate() - n); return toISO(d); };
  const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const fmtNum = (v, d = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const ICONS = {
    plus: '<path d="M10 4v12M4 10h12"/>',
    back: '<path d="M12 4l-6 6 6 6"/>',
    edit: '<path d="M4 16h3l8.6-8.6a1.4 1.4 0 0 0 0-2l-1-1a1.4 1.4 0 0 0-2 0L4 13v3z"/>',
    trash: '<path d="M4 6h12M8 6V4.5h4V6M5.8 6l.8 10h6.8l.8-10"/>',
    upload: '<path d="M10 13V4M6.5 7.5L10 4l3.5 3.5M4 13.5V16h12v-2.5"/>',
    play: '<path d="M7 4.8l8.2 5.2L7 15.2z"/>',
    x: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
    left: '<path d="M12.5 4l-6 6 6 6"/>',
    right: '<path d="M7.5 4l6 6-6 6"/>',
    download: '<path d="M10 4v9M6.5 9.5L10 13l3.5-3.5M4 16h12"/>',
    copy: '<rect x="7" y="7" width="9" height="9" rx="1.6"/><path d="M4 13V5.6A1.6 1.6 0 0 1 5.6 4H13"/>',
    camera: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h2L8 4h4l1.5 2h2A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z"/><circle cx="10" cy="11" r="2.8"/>',
    search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l3.5 3.5"/>',
    restore: '<path d="M4 10a6 6 0 1 0 2-4.5M4 3.5v3h3"/>'
  };
  const icon = n => `<svg class="i" viewBox="0 0 20 20" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  /* ---------- Metric helpers ---------- */
  function indexMetrics() {
    state.defs = {};
    state.metrics.groups.forEach(g => g.metrics.forEach(m => { state.defs[m.key] = { ...m, group: g.id, groupLabel: g.label }; }));
  }
  const def = k => state.defs[k] || { key: k, label: k, unit: '', decimals: 1 };
  const isNumeric = k => def(k).type !== 'tilt';

  function fmtVal(key, v, withUnit = true) {
    if (v == null || v === '') return '—';
    const m = def(key);
    if (m.type === 'tilt') return esc(v);
    const n = fmtNum(v, m.decimals ?? 1);
    return withUnit && m.unit ? `${n}<span class="unit">${esc(m.unit)}</span>` : n;
  }

  function deltaHTML(key, cur, prev) {
    const m = def(key);
    if (m.type === 'tilt') return '';
    const a = num(cur), b = num(prev);
    if (a == null || b == null) return '';
    const dec = m.decimals ?? 1;
    const d = a - b;
    const shown = Math.abs(d).toFixed(dec);
    if (Number(shown) === 0) return '<span class="delta flat" title="No change">±0</span>';
    let cls = 'flat';
    if (m.better === 'higher') cls = d > 0 ? 'up' : 'down';
    if (m.better === 'lower') cls = d < 0 ? 'up' : 'down';
    const arrow = d > 0 ? '▲' : '▼';
    return `<span class="delta ${cls}">${arrow} ${fmtNum(Math.abs(d), dec)}</span>`;
  }

  const typeLabel = id => (state.metrics.sessionTypes.find(t => t.id === id) || { label: id || 'Session' }).label;
  const typePill = id => `<span class="type-pill type-${esc(id)}${id === 'game' ? '' : ' hollow'}">${esc(typeLabel(id))}</span>`;

  function gradeChip(g, size = '') {
    if (!g) return `<span class="grade grade-none ${size}" title="Not graded">—</span>`;
    return `<span class="grade grade-${esc(g[0].toLowerCase())} ${size}" title="Grade ${esc(g)}">${esc(g)}</span>`;
  }
  function avgGrade(list) {
    const pts = list.filter(s => s.grade in GRADE_PTS).map(s => GRADE_PTS[s.grade]);
    if (!pts.length) return null;
    const a = mean(pts);
    let best = null, bd = Infinity;
    Object.entries(GRADE_PTS).forEach(([g, p]) => { const d = Math.abs(p - a); if (d < bd) { bd = d; best = g; } });
    return best;
  }

  /* ---------- Data helpers ---------- */
  const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
  const pitcherById = id => state.pitchers.find(p => p.id === id);
  const sessionById = id => state.sessions.find(s => s.id === id);
  const sessionsFor = pid => state.sessions.filter(s => s.pitcherId === pid).sort(byDateDesc);
  const fullName = p => (p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : 'Unknown pitcher');
  const classYears = () => state.metrics.classYears || [];
  /* Year label: long "Redshirt Sophomore" or short "R-So". Older records with a graduation year still show it. */
  function classLabel(p, short = false) {
    if (!p) return '';
    const c = classYears().find(x => x.id === p.eligibility);
    if (c) return short ? `${p.redshirt ? 'R-' : ''}${c.id}` : `${p.redshirt ? 'Redshirt ' : ''}${c.label}`;
    return p.classYear ? `Class of ${p.classYear}` : '';
  }
  const handLabel = p => (p && p.throws === 'L' ? 'LHP' : 'RHP');
  const sortedPitchers = () => [...state.pitchers].sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));

  function prevSession(s) {
    return sessionsFor(s.pitcherId).find(x => x.id !== s.id && (x.date < s.date || (x.date === s.date && (x.createdAt || 0) < (s.createdAt || 0)))) || null;
  }
  function peak(list, key) {
    let v = null;
    list.forEach(s => { const x = num(s.metrics?.[key]); if (x != null && (v == null || x > v)) v = x; });
    return v;
  }
  function latestWith(list, key) { return list.find(s => num(s.metrics?.[key]) != null) || null; }

  /* ---------- Object URLs for media ---------- */
  function makeUrl(blob) { const u = URL.createObjectURL(blob); state.urls.push(u); return u; }
  function revokeUrls() { state.urls.forEach(u => URL.revokeObjectURL(u)); state.urls = []; }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast ${kind}`;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 6000 : 3200);
  }

  /* ---------- Modal ---------- */
  function openModal({ html, cls = '', label = 'Dialog', onClose }) {
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
    root.appendChild(wrap);
    const modal = wrap.querySelector('.modal');
    const prevFocus = document.activeElement;
    let closed = false;
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      if (onClose) onClose();
    }
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    setTimeout(() => { const f = modal.querySelector('[autofocus], input:not([type=hidden]), select, textarea, button'); if (f) f.focus(); }, 30);
    return { modal, close };
  }

  function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
    return new Promise(resolve => {
      let answered = false;
      const { modal, close } = openModal({
        cls: 'sm', label: title,
        html: `<h2 class="modal-title">${esc(title)}</h2><p class="modal-text">${message}</p>
          <div class="modal-actions"><span class="spacer"></span>
            <button type="button" class="btn" data-m="no">Cancel</button>
            <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-m="yes">${esc(confirmLabel)}</button>
          </div>`,
        onClose: () => { if (!answered) resolve(false); }
      });
      modal.addEventListener('click', e => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        answered = true;
        resolve(b.dataset.m === 'yes');
        close();
      });
    });
  }

  /* =========================================================
     Boot
     ========================================================= */
  async function loadJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) { return null; }
  }

  async function init() {
    state.metrics = (await loadJSON(METRICS_URL)) || FALLBACK_METRICS;
    if (!state.metrics) {
      $('#main').innerHTML = `<div class="empty"><h2>Metric settings didn't load</h2>
        <p>The app couldn't read <code>data/metrics.json</code>. Open it through a local web server (see README.md) and reload.</p></div>`;
      return;
    }
    indexMetrics();
    state.chartId = state.metrics.charts[0]?.id;
    await DB.ready();
    state.pitchers = await DB.getAll('pitchers');
    state.sessions = await DB.getAll('sessions');
    if (!state.pitchers.length) {
      const seeded = await DB.get('meta', 'seeded');
      if (!seeded) await seedSample();
    }
    await refreshSamplePitchers();
    setStorageStatus();
    bindGlobal();
    render();
  }

  async function seedSample() {
    const data = await loadJSON(SAMPLE_URL);
    if (data && Array.isArray(data.pitchers)) {
      await DB.putMany('pitchers', data.pitchers.map(p => ({ ...p, sample: true })));
      await DB.putMany('sessions', data.sessions.map(s => ({ ...s, sample: true, mediaCount: 0 })));
      state.pitchers = await DB.getAll('pitchers');
      state.sessions = await DB.getAll('sessions');
    }
    await DB.put('meta', { key: 'seeded', value: true });
  }

  async function refreshSamplePitchers() {
    const stale = state.pitchers.filter(p => p.sample && !p.eligibility);
    if (!stale.length) return;
    const data = await loadJSON(SAMPLE_URL);
    if (!data) return;
    for (const p of stale) {
      const fresh = data.pitchers.find(x => x.id === p.id);
      if (!fresh) continue;
      const next = { ...p, eligibility: fresh.eligibility, redshirt: !!fresh.redshirt };
      delete next.classYear; delete next.level;
      await DB.put('pitchers', next);
      Object.assign(p, next); delete p.classYear; delete p.level;
    }
  }

  function setStorageStatus() {
    const el = $('#storage-status');
    if (!el) return;
    el.innerHTML = DB.isPersistent
      ? '<span class="dot"></span>Saved in this browser'
      : '<span class="dot warn"></span>Storage is blocked here. Changes last until you close this tab.';
  }

  /* =========================================================
     Routing + render
     ========================================================= */
  function go(name, id = null, extra = {}) {
    state.view = { name, id, ...extra };
    revokeUrls();
    render();
    window.scrollTo(0, 0);
    $('#main').focus({ preventScroll: true });
  }

  const NAV_FOR = { roster: 'roster', pitcher: 'roster', session: 'sessions', sessions: 'sessions', form: 'sessions', data: 'data' };

  function render() {
    const v = state.view;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === NAV_FOR[v.name]));
    let html;
    switch (v.name) {
      case 'pitcher': html = viewPitcher(v.id); break;
      case 'session': html = viewSession(v.id); break;
      case 'form': html = viewForm(); break;
      case 'sessions': html = viewLog(); break;
      case 'data': html = viewData(); break;
      default: html = viewRoster();
    }
    $('#main').innerHTML = html;
    const titles = { roster: 'Staff', sessions: 'Session Log', data: 'Data & Metrics', form: 'Log Session' };
    if (v.name === 'pitcher') document.title = `${fullName(pitcherById(v.id))} · Mound Report`;
    else if (v.name === 'session') document.title = `Session · Mound Report`;
    else document.title = titles[v.name] ? `${titles[v.name]} · Mound Report` : 'Mound Report';

    if (v.name === 'pitcher') drawChart();
    if (v.name === 'session') loadSessionMedia(v.id);
    if (v.name === 'form') mountForm();
  }

  function notFound(what) {
    return `<div class="empty"><h2>${esc(what)} not found</h2><p>It may have been deleted.</p>
      <button class="btn" data-nav="roster">${icon('back')}Back to staff</button></div>`;
  }

  /* =========================================================
     View: Staff (roster)
     ========================================================= */
  function stat(label, value, sub = '') {
    return `<div class="stat"><p class="stat-label">${label}</p><div class="stat-value">${value}</div>${sub ? `<p class="stat-sub">${sub}</p>` : ''}</div>`;
  }

  function sampleBanner() {
    if (!state.pitchers.some(p => p.sample)) return '';
    return `<div class="banner"><p><strong>You're looking at sample pitchers.</strong> They show how Mound Report works. Clear them when you're ready to add your own staff.</p>
      <button class="btn btn-sm" data-action="clear-sample">Clear sample data</button></div>`;
  }

  function viewRoster() {
    const ps = state.pitchers, ss = state.sessions;
    const last7 = ss.filter(s => s.date >= daysAgoISO(6) && s.date <= todayISO()).length;
    let top = null;
    ps.forEach(p => { const v = peak(sessionsFor(p.id), 'fbMaxVelo'); if (v != null && (!top || v > top.v)) top = { v, p }; });
    const g30 = avgGrade(ss.filter(s => s.date >= daysAgoISO(29)));
    const pens = ss.filter(s => s.type === 'bullpen').length;
    const games = ss.filter(s => s.type === 'game').length;

    const head = `<header class="page-head">
      <div><p class="eyebrow">Pitching staff</p><h1>Staff Overview</h1>
      <p class="lede">${plural(ps.length, 'pitcher')} · ${plural(ss.length, 'session')} logged</p></div>
      <div class="head-actions">
        <button class="btn" data-action="new-pitcher">${icon('plus')}Add Pitcher</button>
        <button class="btn btn-primary" data-action="new-session">${icon('plus')}Log Session</button>
      </div></header>`;

    if (!ps.length) {
      return `${head}<div class="empty"><h2>No pitchers yet</h2>
        <p>Add your first pitcher, then log a bullpen or game with the numbers from TrackMan, Rapsodo, or whatever your staff uses.</p>
        <button class="btn btn-primary" data-action="new-pitcher">${icon('plus')}Add Pitcher</button></div>`;
    }

    return `${head}
      ${sampleBanner()}
      <section class="stat-strip" aria-label="Staff summary">
        ${stat('Sessions · last 7 days', last7)}
        ${stat('Staff peak velo', top ? `${fmtNum(top.v, 1)}<small>mph</small>` : '—', top ? esc(fullName(top.p)) : '')}
        ${stat('Avg grade · last 30 days', g30 ? gradeChip(g30, 'md') : '—')}
        ${stat('Bullpens / Games', `${pens}<small>/</small>${games}`)}
      </section>
      <section class="section">
        <div class="toolbar">
          <div class="search">${icon('search')}<input id="roster-search" type="search" placeholder="Search name or number" aria-label="Search pitchers" value="${esc(state.rosterFilter.q)}"></div>
          <div class="chips" role="group" aria-label="Filter by throwing hand">
            ${['all', 'R', 'L'].map(h => `<button class="chip ${state.rosterFilter.hand === h ? 'on' : ''}" data-action="hand-filter" data-hand="${h}" aria-pressed="${state.rosterFilter.hand === h}">${h === 'all' ? 'All' : h === 'R' ? 'RHP' : 'LHP'}</button>`).join('')}
          </div>
        </div>
        <div id="roster-table">${rosterTable()}</div>
      </section>`;
  }

  function rosterTable() {
    const f = state.rosterFilter;
    const q = f.q.trim().toLowerCase();
    let list = sortedPitchers();
    if (f.hand !== 'all') list = list.filter(p => (p.throws || 'R') === f.hand);
    if (q) list = list.filter(p => `${fullName(p)} ${p.number ?? ''} #${p.number ?? ''} ${classLabel(p)} ${classLabel(p, true)}`.toLowerCase().includes(q));
    if (!list.length) return '<p class="muted">No pitchers match that search.</p>';

    return `<div class="table-wrap"><table class="table">
      <thead><tr><th class="r">#</th><th>Pitcher</th><th>Throws</th><th>Last session</th>
        <th class="r">FB max velo</th><th>Velo trend</th><th class="r">FB spin</th><th class="c">Last grade</th><th class="r">Sessions</th></tr></thead>
      <tbody>${list.map(p => {
        const ss = sessionsFor(p.id);
        const last = ss[0];
        const fb = latestWith(ss, 'fbMaxVelo');
        const spin = latestWith(ss, 'fbMaxSpin');
        const trend = ss.slice().reverse().map(s => num(s.metrics?.fbMaxVelo)).filter(v => v != null).slice(-10);
        return `<tr class="row-link" data-nav="pitcher" data-id="${esc(p.id)}" tabindex="0" aria-label="Open ${esc(fullName(p))}">
          <td class="c-num">${esc(p.number ?? '')}</td>
          <td><div class="p-name">${esc(fullName(p))}</div><div class="p-sub">${esc(classLabel(p) || '—')}</div></td>
          <td><span class="hand">${handLabel(p)}</span></td>
          <td>${last ? `<div class="nowrap">${fmtShort(last.date)}</div><div>${typePill(last.type)}</div>` : '<span class="muted">No sessions</span>'}</td>
          <td class="r mono">${fb ? fmtVal('fbMaxVelo', fb.metrics.fbMaxVelo) : '—'}</td>
          <td>${Charts.spark(trend)}</td>
          <td class="r mono">${spin ? fmtVal('fbMaxSpin', spin.metrics.fbMaxSpin) : '—'}</td>
          <td class="c">${gradeChip(last?.grade)}</td>
          <td class="r mono">${ss.length}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /* =========================================================
     Shared: sessions table
     ========================================================= */
  function sessionsTable(list, { showPitcher = true } = {}) {
    if (!list.length) return '<p class="muted">No sessions match these filters.</p>';
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th>${showPitcher ? '<th>Pitcher</th>' : ''}<th>Type</th>
        <th class="r">Max velo</th><th class="r">Avg velo</th><th class="r">FB spin</th><th class="r">IVB</th>
        <th class="c">Grade</th><th class="c">Media</th><th class="notes-col">Notes</th></tr></thead>
      <tbody>${list.map(s => {
        const p = pitcherById(s.pitcherId);
        const m = s.metrics || {};
        return `<tr class="row-link" data-nav="session" data-id="${esc(s.id)}" tabindex="0" aria-label="Open session from ${fmtDate(s.date)}">
          <td class="nowrap"><strong>${fmtShort(s.date)}</strong><div class="p-sub">${parseDate(s.date).getFullYear()} · ${esc(s.source || '')}</div></td>
          ${showPitcher ? `<td><div class="p-name">${esc(fullName(p))}</div><div class="p-sub">${p ? `#${esc(p.number ?? '')} · ${handLabel(p)}` : ''}</div></td>` : ''}
          <td>${typePill(s.type)}</td>
          <td class="r mono">${fmtVal('fbMaxVelo', m.fbMaxVelo)}</td>
          <td class="r mono">${fmtVal('fbAvgVelo', m.fbAvgVelo)}</td>
          <td class="r mono">${fmtVal('fbMaxSpin', m.fbMaxSpin)}</td>
          <td class="r mono">${fmtVal('ivb', m.ivb)}</td>
          <td class="c">${gradeChip(s.grade)}</td>
          <td class="c">${s.mediaCount ? `<span class="media-count" title="${plural(s.mediaCount, 'file')}">${icon('camera')}${s.mediaCount}</span>` : '<span class="muted">—</span>'}</td>
          <td class="notes-cell notes-col"><span>${esc(s.notes || '')}</span></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /* =========================================================
     View: Session Log
     ========================================================= */
  function viewLog() {
    const f = state.logFilter;
    return `<header class="page-head">
      <div><p class="eyebrow">All pitchers</p><h1>Session Log</h1>
      <p class="lede">Every bullpen, live BP, and game outing, newest first.</p></div>
      <div class="head-actions"><button class="btn btn-primary" data-action="new-session">${icon('plus')}Log Session</button></div></header>
      ${sampleBanner()}
      <section class="section">
        <div class="toolbar">
          <label class="sr-only" for="log-pitcher">Pitcher</label>
          <select id="log-pitcher"><option value="all">All pitchers</option>
            ${sortedPitchers().map(p => `<option value="${esc(p.id)}" ${f.pitcher === p.id ? 'selected' : ''}>${esc(fullName(p))}</option>`).join('')}</select>
          <label class="sr-only" for="log-type">Session type</label>
          <select id="log-type"><option value="all">All session types</option>
            ${state.metrics.sessionTypes.map(t => `<option value="${t.id}" ${f.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
          <span class="muted" id="log-count"></span>
        </div>
        <div id="log-table">${logTable()}</div>
      </section>`;
  }

  function logList() {
    const f = state.logFilter;
    return state.sessions.filter(s => (f.pitcher === 'all' || s.pitcherId === f.pitcher) && (f.type === 'all' || s.type === f.type)).sort(byDateDesc);
  }
  function logTable() {
    if (!state.sessions.length) {
      return `<div class="empty"><h2>No sessions yet</h2><p>Log a bullpen or game to start tracking trends.</p>
        <button class="btn btn-primary" data-action="new-session">${icon('plus')}Log Session</button></div>`;
    }
    return sessionsTable(logList());
  }

  /* =========================================================
     View: Pitcher profile
     ========================================================= */
  function viewPitcher(id) {
    const p = pitcherById(id);
    if (!p) return notFound('Pitcher');
    const ss = sessionsFor(id);
    const last = ss[0];
    const peakV = peak(ss, 'fbMaxVelo');
    const peakVs = ss.find(s => num(s.metrics?.fbMaxVelo) === peakV);
    const peakS = peak(ss, 'fbMaxSpin');
    const avg5 = mean(ss.map(s => num(s.metrics?.fbAvgVelo)).filter(v => v != null).slice(0, 5));
    const pens = ss.filter(s => s.type === 'bullpen').length;
    const games = ss.filter(s => s.type === 'game').length;
    const meta = [
      esc(classLabel(p)),
      p.height ? esc(p.height) : '',
      p.weight ? `${esc(p.weight)} lb` : ''
    ].filter(Boolean);

    return `<a class="back" href="#" data-nav="roster">${icon('back')}Staff</a>
      <header class="p-hero">
        ${p.number !== '' && p.number != null ? `<div class="p-num" aria-label="Number ${esc(p.number)}"><span>#</span>${esc(p.number)}</div>` : ''}
        <div class="p-id">
          <p class="eyebrow">${handLabel(p)}${p.sample ? ' · Sample' : ''}</p>
          <h1>${esc(fullName(p))}</h1>
          ${meta.length ? `<p class="p-meta">${meta.map(x => `<span>${x}</span>`).join('')}</p>` : ''}
        </div>
        <div class="head-actions">
          <button class="btn" data-action="edit-pitcher" data-id="${esc(id)}">${icon('edit')}Edit Profile</button>
          <button class="btn btn-primary" data-action="new-session" data-pitcher="${esc(id)}">${icon('plus')}Log Session</button>
        </div>
      </header>

      <section class="stat-strip five" aria-label="Pitcher summary">
        ${stat('Peak FB velo', peakV != null ? `${fmtNum(peakV, 1)}<small>mph</small>` : '—', peakVs ? `${fmtShort(peakVs.date)} · ${esc(typeLabel(peakVs.type))}` : '')}
        ${stat('Avg FB velo · last 5', avg5 != null ? `${fmtNum(avg5, 1)}<small>mph</small>` : '—')}
        ${stat('Peak FB spin', peakS != null ? `${fmtNum(peakS)}<small>rpm</small>` : '—')}
        ${stat('Last grade', last?.grade ? gradeChip(last.grade, 'md') : '—', last ? `${fmtShort(last.date)} · ${esc(typeLabel(last.type))}` : '')}
        ${stat('Sessions', ss.length, `${plural(pens, 'bullpen')} · ${plural(games, 'game')}`)}
      </section>

      ${ss.length ? `
      <section class="card">
        <div class="card-head">
          <div><h2 class="card-title">Trend</h2><p class="card-hint">Every logged session, oldest to newest.</p></div>
          <div class="select-inline"><label class="sr-only" for="chart-select">Metric to chart</label>
            <select id="chart-select">${state.metrics.charts.map(c => `<option value="${c.id}" ${c.id === state.chartId ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
        </div>
        <div class="legend" id="chart-legend"></div>
        <div id="chart" class="chart"></div>
      </section>

      <div class="two-col">
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">Bullpen vs. In-Game</h2>
            <p class="card-hint">Averages across ${plural(pens, 'bullpen')} and ${plural(games, 'game')}. Difference is game minus bullpen.</p></div></div>
          ${compareTable(ss)}
        </section>
        <section class="card profile-notes">
          <div class="card-head"><h2 class="card-title">Profile Notes</h2>
            <button class="btn btn-sm btn-ghost" data-action="edit-pitcher" data-id="${esc(id)}">${icon('edit')}Edit</button></div>
          <p>${p.notes ? esc(p.notes) : '<span class="muted">No profile notes yet. Add pitch mix, goals, or mechanical cues.</span>'}</p>
        </section>
      </div>

      <section class="section">
        <div class="section-head"><h2 class="card-title">Sessions</h2></div>
        ${sessionsTable(ss, { showPitcher: false })}
      </section>` : `
      <div class="empty"><h2>No sessions yet</h2>
        <p>Log ${esc(p.firstName || 'this pitcher')}'s first bullpen or game to start building trends.</p>
        <button class="btn btn-primary" data-action="new-session" data-pitcher="${esc(id)}">${icon('plus')}Log Session</button></div>`}`;
  }

  function compareTable(ss) {
    const pen = ss.filter(s => s.type === 'bullpen');
    const game = ss.filter(s => s.type === 'game');
    if (!pen.length || !game.length) {
      return `<p class="muted">Log at least one bullpen and one in-game session to compare them here.</p>`;
    }
    const avgOf = (list, k) => mean(list.map(s => num(s.metrics?.[k])).filter(v => v != null));
    let rows = '';
    state.metrics.groups.forEach(g => {
      const keys = g.metrics.filter(m => m.type !== 'tilt').map(m => m.key).filter(k => avgOf(pen, k) != null || avgOf(game, k) != null);
      if (!keys.length) return;
      rows += `<tr class="grp"><td colspan="4">${esc(g.label)}</td></tr>`;
      keys.forEach(k => {
        const m = def(k);
        const a = avgOf(pen, k), b = avgOf(game, k);
        rows += `<tr><td>${esc(m.short || m.label)}</td><td>${a != null ? fmtVal(k, a, false) : '—'}</td><td>${b != null ? fmtVal(k, b, false) : '—'}</td>
          <td>${a != null && b != null ? deltaHTML(k, b, a) : '—'}</td></tr>`;
      });
    });
    return `<div class="table-scroll" style="overflow-x:auto"><table class="compare">
      <thead><tr><th>Metric</th><th>Bullpen</th><th>In-Game</th><th>Diff</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function drawChart() {
    const host = $('#chart');
    if (!host) return;
    const p = pitcherById(state.view.id);
    if (!p) return;
    const cfg = state.metrics.charts.find(c => c.id === state.chartId) || state.metrics.charts[0];
    const sess = sessionsFor(p.id).slice().reverse();
    const colors = ['var(--s1)', 'var(--s2)'];
    const series = cfg.metrics.map((k, i) => ({
      label: def(k).short || def(k).label,
      color: colors[i % 2],
      points: sess.filter(s => num(s.metrics?.[k]) != null).map(s => ({
        x: parseDate(s.date).getTime(),
        y: num(s.metrics[k]),
        filled: s.type === 'game',
        label: `${fmtShort(s.date)} · ${typeLabel(s.type)}`
      }))
    }));
    const legend = $('#chart-legend');
    if (legend) {
      legend.innerHTML = series.map(s => `<span class="lg"><span class="lg-line" style="background:${s.color}"></span>${esc(s.label)}</span>`).join('') +
        `<span class="lg-sep" aria-hidden="true"></span><span class="lg"><span class="lg-dot filled"></span>In-game</span><span class="lg"><span class="lg-dot"></span>Bullpen &amp; practice</span>`;
    }
    const d0 = def(cfg.metrics[0]);
    const svg = Charts.line({ series, width: host.clientWidth || 700, height: 270, unit: d0.unit, decimals: d0.decimals ?? 1 });
    host.innerHTML = svg || `<div class="chart-empty">No ${esc(cfg.label.toLowerCase())} recorded for ${esc(p.firstName || 'this pitcher')} yet.</div>`;
  }

  /* =========================================================
     View: Session detail
     ========================================================= */
  function viewSession(id) {
    const s = sessionById(id);
    if (!s) return notFound('Session');
    const p = pitcherById(s.pitcherId);
    const prev = prevSession(s);
    const groups = state.metrics.groups.map(g => ({ g, rows: g.metrics.filter(m => s.metrics?.[m.key] != null && s.metrics[m.key] !== '') }));
    const recorded = groups.filter(x => x.rows.length);
    const missing = groups.filter(x => !x.rows.length).map(x => x.g.label);

    return `<a class="back" href="#" data-nav="pitcher" data-id="${esc(s.pitcherId)}">${icon('back')}${esc(fullName(p))}</a>
      <header class="s-hero">
        <div class="s-grade">${gradeChip(s.grade, 'xl')}<span>Session grade</span></div>
        <div class="s-id">
          <p class="eyebrow">${esc(fullName(p))} · ${handLabel(p)}${p?.number ? ` · #${esc(p.number)}` : ''}</p>
          <h1>${fmtDate(s.date, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</h1>
          <div class="s-tags">${typePill(s.type)}${s.source ? `<span class="tag">${esc(s.source)}</span>` : ''}${s.pitchCount ? `<span class="tag">${plural(s.pitchCount, 'pitch').replace('pitchs', 'pitches')}</span>` : ''}</div>
        </div>
        <div class="head-actions">
          <button class="btn" data-action="edit-session" data-id="${esc(id)}">${icon('edit')}Edit Session</button>
          <button class="btn btn-danger" data-action="delete-session" data-id="${esc(id)}">${icon('trash')}Delete</button>
        </div>
      </header>

      <section class="section">
        <div class="section-head">
          <h2 class="card-title">Metrics</h2>
          <span class="muted">${prev ? `Changes compared with ${fmtShort(prev.date)} (${esc(typeLabel(prev.type))})` : 'First logged session for this pitcher'}</span>
        </div>
        ${recorded.length ? `<div class="metric-groups">${recorded.map(({ g, rows }) => `
          <section class="card metric-group"><h3>${esc(g.label)}</h3><dl class="m-list">
            ${rows.map(m => `<div class="m-row"><dt>${esc(m.label)}</dt><dd><span class="m-val">${fmtVal(m.key, s.metrics[m.key])}</span>${prev ? deltaHTML(m.key, s.metrics[m.key], prev.metrics?.[m.key]) : ''}</dd></div>`).join('')}
          </dl></section>`).join('')}</div>` : '<p class="muted">No metrics recorded for this session.</p>'}
        ${missing.length && recorded.length ? `<p class="not-recorded">Not recorded: ${missing.map(esc).join(', ')}</p>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2 class="card-title">Coach's Notes</h2>
          <button class="btn btn-sm btn-ghost" data-action="edit-session" data-id="${esc(id)}">${icon('edit')}Edit</button></div>
        ${s.notes ? `<p class="session-notes">${esc(s.notes)}</p>` : '<p class="muted">No notes for this session.</p>'}
      </section>

      <section class="card">
        <div class="card-head">
          <div><h2 class="card-title">Video &amp; Photos</h2><p class="card-hint">Clips and stills from this session.</p></div>
          <div>
            <input id="quick-upload" type="file" accept="image/*,video/*" multiple hidden>
            <button class="btn btn-sm" data-action="quick-upload">${icon('upload')}Add Files</button>
          </div>
        </div>
        <div id="media-grid" class="media-grid"><p class="media-empty">Loading media…</p></div>
      </section>`;
  }

  async function loadSessionMedia(sid) {
    const grid = $('#media-grid');
    if (!grid) return;
    let items = [];
    try { items = await DB.getByIndex('media', 'sessionId', sid); } catch (e) { items = []; }
    if (state.view.name !== 'session' || state.view.id !== sid) return;
    items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    state.mediaItems = items.map(m => ({ ...m, url: m.blob ? makeUrl(m.blob) : '' }));
    // keep the count in sync
    const s = sessionById(sid);
    if (s && s.mediaCount !== items.length) { s.mediaCount = items.length; DB.put('sessions', s).catch(() => {}); }
    grid.innerHTML = state.mediaItems.length
      ? state.mediaItems.map((m, i) => mediaTile(m, i, 'remove-media')).join('')
      : '<p class="media-empty">No video or photos yet. Add bullpen clips, slow-motion release video, or TrackMan screenshots.</p>';
  }

  const isVideo = m => String(m.mime || m.type || '').startsWith('video');

  function mediaTile(m, i, removeAction, captionInput = false) {
    const name = m.caption || m.name || 'Media file';
    const thumb = isVideo(m)
      ? `<video src="${m.url}#t=0.1" muted playsinline preload="metadata"></video><span class="play">${icon('play')}</span><span class="tile-kind">Video</span>`
      : `<img src="${m.url}" alt="${esc(name)}" loading="lazy">`;
    return `<figure class="tile">
      <button type="button" class="tile-media" data-action="open-media" data-idx="${i}" aria-label="Open ${esc(name)}">${thumb}</button>
      ${captionInput
        ? `<label class="sr-only" for="cap-${esc(m.id)}">Caption</label><input type="text" id="cap-${esc(m.id)}" data-caption="${esc(m.id)}" placeholder="Caption (e.g. side view)" value="${esc(m.caption || '')}">`
        : `<figcaption title="${esc(name)}">${esc(name)}</figcaption>`}
      <button type="button" class="tile-remove" data-action="${removeAction}" data-id="${esc(m.id)}" aria-label="Remove ${esc(name)}">${icon('x')}</button>
    </figure>`;
  }

  function openLightbox(items, start) {
    if (!items.length) return;
    let idx = start;
    const { modal, close } = openModal({ cls: 'lightbox', label: 'Media viewer', html: '' });
    function draw() {
      const m = items[idx];
      const name = m.caption || m.name || 'Media file';
      modal.innerHTML = `<div class="lb-top"><p class="lb-cap">${esc(name)}</p><span class="lb-count">${idx + 1} / ${items.length}</span>
          <button type="button" class="icon-btn" data-lb="close" aria-label="Close">${icon('x')}</button></div>
        <div class="lb-stage">${isVideo(m) ? `<video src="${m.url}" controls playsinline autoplay></video>` : `<img src="${m.url}" alt="${esc(name)}">`}</div>
        ${items.length > 1 ? `<div class="lb-nav"><button type="button" class="btn btn-sm" data-lb="prev">${icon('left')}Previous</button>
          <button type="button" class="btn btn-sm" data-lb="next">Next${icon('right')}</button></div>` : ''}`;
      const c = modal.querySelector('[data-lb="close"]');
      if (c) c.focus();
    }
    draw();
    modal.addEventListener('click', e => {
      const b = e.target.closest('[data-lb]');
      if (!b) return;
      if (b.dataset.lb === 'close') close();
      if (b.dataset.lb === 'prev') { idx = (idx - 1 + items.length) % items.length; draw(); }
      if (b.dataset.lb === 'next') { idx = (idx + 1) % items.length; draw(); }
    });
    modal.addEventListener('keydown', e => {
      if (items.length < 2) return;
      if (e.key === 'ArrowLeft') { idx = (idx - 1 + items.length) % items.length; draw(); }
      if (e.key === 'ArrowRight') { idx = (idx + 1) % items.length; draw(); }
    });
  }

  async function saveMediaFiles(files, sessionId, pitcherId, captions = {}) {
    let saved = 0;
    for (const file of files) {
      if (!/^(image|video)\//.test(file.type)) continue;
      await DB.put('media', {
        id: uid('m'), sessionId, pitcherId,
        name: file.name, mime: file.type, size: file.size,
        caption: captions[file.__tmpId] || '',
        blob: file, createdAt: Date.now() + saved
      });
      saved++;
    }
    return saved;
  }

  function storageErrorMessage(e) {
    return e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)))
      ? 'Not enough storage space for those files. Try shorter clips, or remove older media.'
      : "Those files couldn't be saved. Try again, or use a smaller file.";
  }

  async function quickUpload(files) {
    const s = sessionById(state.view.id);
    if (!s || !files.length) return;
    try {
      const n = await saveMediaFiles(files, s.id, s.pitcherId);
      if (!n) { toast('Choose photo or video files.', 'error'); return; }
      revokeUrls();
      await loadSessionMedia(s.id);
      toast(`Added ${plural(n, 'file')}`);
    } catch (e) { toast(storageErrorMessage(e), 'error'); }
  }

  /* =========================================================
     View: Session form (new / edit)
     ========================================================= */
  function viewForm() {
    const editing = state.view.id ? sessionById(state.view.id) : null;
    if (state.view.id && !editing) return notFound('Session');
    if (!state.pitchers.length) {
      return `<header class="page-head"><div><p class="eyebrow">New session</p><h1>Log Session</h1></div></header>
        <div class="empty"><h2>Add a pitcher first</h2><p>Sessions belong to a pitcher. Add one, then come back to log the session.</p>
        <button class="btn btn-primary" data-action="new-pitcher">${icon('plus')}Add Pitcher</button></div>`;
    }
    const s = editing || {
      pitcherId: state.view.pitcherId || '',
      date: todayISO(), type: 'bullpen', source: state.metrics.sources[0],
      pitchCount: '', metrics: {}, grade: '', notes: ''
    };
    state.form = { sessionId: editing ? editing.id : null, newFiles: [], existing: [], removed: new Set() };
    const backNav = editing ? `data-nav="session" data-id="${esc(editing.id)}"` : (s.pitcherId ? `data-nav="pitcher" data-id="${esc(s.pitcherId)}"` : 'data-nav="sessions"');

    const metricField = m => {
      const id = `m-${m.key}`;
      const v = s.metrics?.[m.key] ?? '';
      if (m.type === 'tilt') {
        return `<div class="field"><label for="${id}">${esc(m.label)}</label>
          <input id="${id}" name="m:${m.key}" type="text" inputmode="numeric" autocomplete="off" placeholder="${esc(m.placeholder || '1:15')}" value="${esc(v)}">
          <span class="hint">Clock face, h:mm</span><em class="err" id="${id}-err"></em></div>`;
      }
      const input = `<div class="input-unit"><input id="${id}" name="m:${m.key}" type="number" inputmode="decimal" step="${m.step ?? 'any'}" min="${m.min ?? ''}" max="${m.max ?? ''}" value="${esc(v)}" placeholder="${esc(m.placeholder || '')}">${m.unit ? `<span class="u">${esc(m.unit)}</span>` : ''}</div>`;
      const body = m.key === 'bauerUnits'
        ? `<div class="input-row">${input}<button type="button" class="btn btn-sm" data-action="calc-bauer">Calculate</button></div><span class="hint" id="bu-hint">Max FB spin ÷ max FB velo</span>`
        : input;
      return `<div class="field"><label for="${id}">${esc(m.label)}</label>${body}<em class="err" id="${id}-err"></em></div>`;
    };

    return `<a class="back" href="#" ${backNav}>${icon('back')}${editing ? 'Back to session' : 'Cancel'}</a>
      <header class="page-head"><div><p class="eyebrow">${editing ? 'Edit session' : 'New session'}</p><h1>${editing ? 'Edit Session' : 'Log Session'}</h1>
        <p class="lede">Enter the numbers from your session report. Leave anything you didn't track blank.</p></div></header>

      <form id="session-form" class="form" novalidate>
        <section class="form-card">
          <h2 class="card-title">Session</h2>
          <div class="field-grid">
            <div class="field"><label for="f-pitcher">Pitcher <span class="req">*</span></label>
              <select id="f-pitcher" name="pitcherId" required>
                <option value="">Choose a pitcher</option>
                ${sortedPitchers().map(p => `<option value="${esc(p.id)}" ${p.id === s.pitcherId ? 'selected' : ''}>${esc(fullName(p))}${p.number ? ` (#${esc(p.number)})` : ''}</option>`).join('')}
              </select><em class="err" id="f-pitcher-err"></em></div>
            <div class="field"><label for="f-date">Date <span class="req">*</span></label>
              <input id="f-date" name="date" type="date" required value="${esc(s.date)}"><em class="err" id="f-date-err"></em></div>
            <div class="field"><label for="f-source">Data source</label>
              <select id="f-source" name="source">${state.metrics.sources.map(x => `<option ${x === s.source ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
            <div class="field"><label for="f-pitches">Pitch count</label>
              <input id="f-pitches" name="pitchCount" type="number" min="0" max="250" step="1" inputmode="numeric" value="${esc(s.pitchCount ?? '')}"></div>
          </div>
          <fieldset class="seg"><legend>Session type</legend><div class="seg-row">
            ${state.metrics.sessionTypes.map(t => `<label><input type="radio" name="type" value="${t.id}" ${t.id === s.type ? 'checked' : ''}><span>${esc(t.label)}</span></label>`).join('')}
          </div></fieldset>
        </section>

        ${state.metrics.groups.map(g => `<section class="form-card">
          <h2 class="card-title">${esc(g.label)}</h2>
          <div class="field-grid">${g.metrics.map(metricField).join('')}</div>
        </section>`).join('')}

        <section class="form-card">
          <h2 class="card-title">Grade &amp; Notes</h2>
          <fieldset class="grade-pick"><legend>Session grade</legend><div class="seg-row">
            ${state.metrics.grades.map(g => `<label><input type="radio" name="grade" value="${esc(g)}" ${s.grade === g ? 'checked' : ''}><span class="grade grade-${g[0].toLowerCase()}">${esc(g)}</span></label>`).join('')}
            <label><input type="radio" name="grade" value="" ${!s.grade ? 'checked' : ''}><span class="grade grade-none">No grade</span></label>
          </div></fieldset>
          <div class="field"><label for="f-notes">Coach's notes</label>
            <textarea id="f-notes" name="notes" rows="5" placeholder="What did you see? Command, pitch shapes, mechanics, how the arm felt, what to work on next.">${esc(s.notes || '')}</textarea></div>
        </section>

        <section class="form-card">
          <div class="form-card-head"><div><h2 class="card-title">Video &amp; Photos</h2>
            <p class="card-hint">Attach clips and stills from this session. They stay with this pitcher and date.</p></div></div>
          <div id="dropzone" class="dropzone">
            ${icon('upload')}
            <div>Drag files here or <button type="button" class="link-btn" data-action="pick-files">choose files</button></div>
            <small>Photos and videos · saved in this browser</small>
            <input id="form-files" type="file" accept="image/*,video/*" multiple hidden>
          </div>
          <div id="form-media" class="media-grid"></div>
        </section>

        <div class="form-actions">
          <p class="form-error" id="form-error" hidden></p>
          <span class="spacer"></span>
          <button type="button" class="btn" ${backNav}>Cancel</button>
          <button type="submit" class="btn btn-primary" id="save-session">${editing ? 'Save Changes' : 'Save Session'}</button>
        </div>
      </form>`;
  }

  async function mountForm() {
    const form = $('#session-form');
    if (!form) return;
    form.addEventListener('submit', saveSessionForm);
    const dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => addFormFiles(e.dataTransfer?.files || []));
    $('#form-files').addEventListener('change', e => { addFormFiles(e.target.files); e.target.value = ''; });

    if (state.form.sessionId) {
      try {
        const items = await DB.getByIndex('media', 'sessionId', state.form.sessionId);
        items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        state.form.existing = items.map(m => ({ ...m, url: m.blob ? makeUrl(m.blob) : '', origCaption: m.caption || '' }));
      } catch (e) { state.form.existing = []; }
    }
    renderFormMedia();
  }

  function formMediaList() {
    if (!state.form) return [];
    return [
      ...state.form.existing.filter(m => !state.form.removed.has(m.id)),
      ...state.form.newFiles
    ];
  }

  function renderFormMedia() {
    const host = $('#form-media');
    if (!host) return;
    const list = formMediaList();
    host.innerHTML = list.map((m, i) => mediaTile(m, i, 'form-remove-media', true)).join('');
  }

  function addFormFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => /^(image|video)\//.test(f.type));
    if (!files.length) { toast('Choose photo or video files.', 'error'); return; }
    files.forEach(file => {
      const id = uid('tmp');
      file.__tmpId = id;
      state.form.newFiles.push({ id, file, name: file.name, mime: file.type, caption: '', url: makeUrl(file), isNew: true });
    });
    renderFormMedia();
  }

  function setErr(id, msg) {
    const el = document.getElementById(`${id}-err`);
    const input = document.getElementById(id);
    if (el) el.textContent = msg || '';
    if (input) input.classList.toggle('invalid', !!msg);
  }

  async function saveSessionForm(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    let firstBad = null;
    const bad = (id, msg) => { setErr(id, msg); if (!firstBad) firstBad = id; };
    $$('.err', form).forEach(el => { el.textContent = ''; });
    $$('.invalid', form).forEach(el => el.classList.remove('invalid'));

    const pitcherId = fd.get('pitcherId');
    const date = fd.get('date');
    if (!pitcherId) bad('f-pitcher', 'Choose the pitcher for this session.');
    if (!date) bad('f-date', 'Enter the session date.');

    const metrics = {};
    Object.values(state.defs).forEach(m => {
      const raw = String(fd.get(`m:${m.key}`) ?? '').trim();
      if (!raw) return;
      const id = `m-${m.key}`;
      if (m.type === 'tilt') {
        const t = raw.replace(/\s/g, '');
        if (!/^(1[0-2]|0?[1-9]):[0-5]\d$/.test(t)) { bad(id, 'Use clock format, like 1:15 or 11:45.'); return; }
        metrics[m.key] = t.replace(/^0/, '');
        return;
      }
      const n = Number(raw);
      if (Number.isNaN(n)) { bad(id, 'Enter a number.'); return; }
      if ((m.min != null && n < m.min) || (m.max != null && n > m.max)) {
        bad(id, `Should be between ${m.min} and ${m.max}${m.unit ? ' ' + m.unit : ''}.`);
        return;
      }
      metrics[m.key] = n;
    });

    const errBox = $('#form-error');
    if (firstBad) {
      errBox.textContent = 'Fix the highlighted fields to save.';
      errBox.hidden = false;
      const el = document.getElementById(firstBad);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
      return;
    }
    errBox.hidden = true;

    const btn = $('#save-session');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const existing = state.form.sessionId ? sessionById(state.form.sessionId) : null;
    const now = Date.now();
    const obj = {
      id: existing ? existing.id : uid('s'),
      pitcherId, date,
      type: fd.get('type') || 'bullpen',
      source: fd.get('source') || '',
      pitchCount: num(fd.get('pitchCount')),
      metrics,
      grade: fd.get('grade') || '',
      notes: String(fd.get('notes') || '').trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      sample: existing ? !!existing.sample : false,
      mediaCount: 0
    };

    try {
      // Media: removals, caption edits, re-assignment, new uploads
      for (const id of state.form.removed) await DB.delete('media', id);
      for (const m of state.form.existing) {
        if (state.form.removed.has(m.id)) continue;
        if (m.caption !== m.origCaption || m.pitcherId !== pitcherId) {
          const { url, origCaption, ...rec } = m;
          await DB.put('media', { ...rec, pitcherId });
        }
      }
      const captions = {};
      state.form.newFiles.forEach(nf => { captions[nf.id] = nf.caption; });
      await saveMediaFiles(state.form.newFiles.map(nf => nf.file), obj.id, pitcherId, captions);
      obj.mediaCount = await DB.countByIndex('media', 'sessionId', obj.id);

      await DB.put('sessions', obj);
      const i = state.sessions.findIndex(s => s.id === obj.id);
      if (i >= 0) state.sessions[i] = obj; else state.sessions.push(obj);
      state.form = null;
      toast(existing ? 'Session updated' : 'Session saved');
      go('session', obj.id);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = existing ? 'Save Changes' : 'Save Session';
      toast(storageErrorMessage(err), 'error');
    }
  }

  function calcBauer() {
    const spin = num($('#m-fbMaxSpin')?.value);
    const velo = num($('#m-fbMaxVelo')?.value);
    const hint = $('#bu-hint');
    if (spin == null || velo == null || velo === 0) {
      if (hint) hint.textContent = 'Enter max FB spin and max FB velo first.';
      return;
    }
    const bu = Math.round((spin / velo) * 10) / 10;
    $('#m-bauerUnits').value = bu.toFixed(1);
    if (hint) hint.textContent = `${fmtNum(spin)} rpm ÷ ${fmtNum(velo, 1)} mph = ${bu.toFixed(1)}`;
  }

  /* =========================================================
     Pitcher add/edit modal
     ========================================================= */
  function openPitcherModal(id) {
    const p = id ? pitcherById(id) : { throws: 'R' };
    if (id && !p) return;
    const { modal, close } = openModal({
      label: id ? 'Edit pitcher' : 'Add pitcher',
      html: `<form id="pitcher-form" novalidate>
        <h2 class="modal-title">${id ? 'Edit Pitcher' : 'Add Pitcher'}</h2>
        <div class="field-grid two">
          <div class="field"><label for="p-first">First name <span class="req">*</span></label><input id="p-first" name="firstName" type="text" autocomplete="off" value="${esc(p.firstName || '')}"><em class="err" id="p-first-err"></em></div>
          <div class="field"><label for="p-last">Last name <span class="req">*</span></label><input id="p-last" name="lastName" type="text" autocomplete="off" value="${esc(p.lastName || '')}"><em class="err" id="p-last-err"></em></div>
          <div class="field"><label for="p-number">Jersey number</label><input id="p-number" name="number" type="text" inputmode="numeric" maxlength="3" value="${esc(p.number ?? '')}"></div>
          <div class="field"><label for="p-height">Height</label><input id="p-height" name="height" type="text" value="${esc(p.height || '')}"></div>
          <div class="field"><label for="p-weight">Weight (lb)</label><input id="p-weight" name="weight" type="number" min="60" max="400" step="1" value="${esc(p.weight ?? '')}"></div>
          <fieldset class="seg"><legend>Throws</legend><div class="seg-row">
            <label><input type="radio" name="throws" value="R" ${p.throws !== 'L' ? 'checked' : ''}><span>Right</span></label>
            <label><input type="radio" name="throws" value="L" ${p.throws === 'L' ? 'checked' : ''}><span>Left</span></label>
          </div></fieldset>
          <fieldset class="seg field full"><legend>Year</legend><div class="seg-row">
            ${classYears().map(c => `<label><input type="radio" name="eligibility" value="${esc(c.id)}" ${p.eligibility === c.id ? 'checked' : ''}><span title="${esc(c.label)}">${esc(c.id)}</span></label>`).join('')}
            <label class="check rs-check"><input type="checkbox" name="redshirt" id="p-redshirt" ${p.redshirt ? 'checked' : ''}> Redshirt</label>
          </div></fieldset>
        </div>
        <div class="field"><label for="p-notes">Profile notes</label>
          <textarea id="p-notes" name="notes" rows="3" placeholder="Pitch mix, goals, injury history, mechanical cues">${esc(p.notes || '')}</textarea></div>
        <div class="modal-actions">
          ${id ? `<button type="button" class="btn btn-danger" data-m="delete">${icon('trash')}Delete</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-m="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Add Pitcher'}</button>
        </div></form>`
    });
    // Height placeholder needs a literal quote mark; set it safely here.
    const h = modal.querySelector('#p-height');
    if (h) h.placeholder = `6'1"`;

    modal.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      if (b.dataset.m === 'cancel') close();
      if (b.dataset.m === 'delete') {
        close();
        const n = sessionsFor(id).length;
        const ok = await confirmDialog({
          title: 'Delete pitcher?',
          message: `This removes <strong>${esc(fullName(p))}</strong>${n ? ` and ${plural(n, 'session')}, including their video and photos` : ''}. This can't be undone.`,
          confirmLabel: 'Delete Pitcher'
        });
        if (ok) await deletePitcher(id);
      }
    });

    modal.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const firstName = String(fd.get('firstName') || '').trim();
      const lastName = String(fd.get('lastName') || '').trim();
      setErr('p-first', firstName ? '' : 'Enter a first name.');
      setErr('p-last', lastName ? '' : 'Enter a last name.');
      if (!firstName || !lastName) { (firstName ? $('#p-last', modal) : $('#p-first', modal)).focus(); return; }
      const obj = {
        ...(id ? p : {}),
        id: id || uid('p'),
        firstName, lastName,
        number: String(fd.get('number') || '').trim(),
        throws: fd.get('throws') === 'L' ? 'L' : 'R',
        eligibility: String(fd.get('eligibility') || ''),
        redshirt: fd.get('redshirt') === 'on',
        height: String(fd.get('height') || '').trim(),
        weight: num(fd.get('weight')),
        notes: String(fd.get('notes') || '').trim(),
        updatedAt: Date.now(),
        createdAt: id ? p.createdAt : Date.now()
      };
      delete obj.level;
      delete obj.classYear;
      try {
        await DB.put('pitchers', obj);
        const i = state.pitchers.findIndex(x => x.id === obj.id);
        if (i >= 0) state.pitchers[i] = obj; else state.pitchers.push(obj);
        close();
        toast(id ? 'Pitcher updated' : `${fullName(obj)} added`);
        if (id) render();
        else if (state.view.name === 'form') go('form', null, { pitcherId: obj.id });
        else go('pitcher', obj.id);
      } catch (err) { toast("The pitcher couldn't be saved. Try again.", 'error'); }
    });
  }

  async function deletePitcher(id) {
    const p = pitcherById(id);
    try {
      const mediaKeys = await DB.keysByIndex('media', 'pitcherId', id);
      for (const k of mediaKeys) await DB.delete('media', k);
      for (const s of sessionsFor(id)) await DB.delete('sessions', s.id);
      await DB.delete('pitchers', id);
      state.sessions = state.sessions.filter(s => s.pitcherId !== id);
      state.pitchers = state.pitchers.filter(x => x.id !== id);
      toast(`${fullName(p)} deleted`);
      go('roster');
    } catch (e) { toast("The pitcher couldn't be deleted. Try again.", 'error'); }
  }

  async function deleteSession(id) {
    const s = sessionById(id);
    if (!s) return;
    const ok = await confirmDialog({
      title: 'Delete session?',
      message: `This removes the ${esc(typeLabel(s.type).toLowerCase())} session from <strong>${fmtDate(s.date)}</strong>${s.mediaCount ? `, including ${plural(s.mediaCount, 'video or photo')}`.replace('video or photos', 'videos and photos') : ''}. This can't be undone.`,
      confirmLabel: 'Delete Session'
    });
    if (!ok) return;
    try {
      const keys = await DB.keysByIndex('media', 'sessionId', id);
      for (const k of keys) await DB.delete('media', k);
      await DB.delete('sessions', id);
      state.sessions = state.sessions.filter(x => x.id !== id);
      toast('Session deleted');
      go('pitcher', s.pitcherId);
    } catch (e) { toast("The session couldn't be deleted. Try again.", 'error'); }
  }

  /* =========================================================
     View: Data & Metrics
     ========================================================= */
  function viewData() {
    const hasSample = state.pitchers.some(p => p.sample);
    return `<header class="page-head"><div><p class="eyebrow">Settings</p><h1>Data &amp; Metrics</h1>
      <p class="lede">Back up your staff, restore a backup, and see what each metric means.</p></div></header>

      <div class="data-grid">
        <section class="card">
          <h2 class="card-title">Back Up</h2>
          <p>Everything is saved in this browser on this device. Download a backup file regularly so you can restore it on another computer or after clearing your browser.</p>
          <label class="check"><input type="checkbox" id="backup-media"> Include video and photos (the file can get large)</label>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="export">${icon('download')}Download Backup</button>
            <button class="btn" data-action="copy-json">${icon('copy')}Copy Stats as JSON</button>
          </div>
        </section>

        <section class="card">
          <h2 class="card-title">Restore</h2>
          <p>Choose a backup file exported from Mound Report. Pitchers and sessions in the file are added; any with the same ID are replaced.</p>
          <input id="import-file" type="file" accept="application/json,.json" hidden>
          <div class="btn-row"><button class="btn" data-action="import">${icon('restore')}Restore from Backup</button></div>
        </section>

        ${hasSample ? `<section class="card">
          <h2 class="card-title">Sample Data</h2>
          <p>The sample pitchers (Delgado, Okafor, Whitfield, Castillo) are only there to show how things work. Clearing them leaves your own pitchers untouched.</p>
          <div class="btn-row"><button class="btn" data-action="clear-sample">Clear Sample Data</button></div>
        </section>` : ''}

        <section class="card danger-card">
          <h2 class="card-title">Start Over</h2>
          <p>Delete every pitcher, session, video, and photo stored in this browser. Download a backup first if you might need it.</p>
          <div class="btn-row"><button class="btn btn-danger" data-action="clear-all">${icon('trash')}Delete All Data</button></div>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><div><h2 class="card-title">Metric Reference</h2>
          <p class="card-hint">What each field means. Edit <code>data/metrics.json</code> to rename fields, change units, or add metrics.</p></div></div>
        ${state.metrics.groups.map(g => `<div class="ref-group"><h3>${esc(g.label)}</h3><dl class="ref-list">
          ${g.metrics.map(m => `<dt>${esc(m.label)}${m.unit ? `<small>${esc(m.unit)}</small>` : m.type === 'tilt' ? '<small>clock face</small>' : ''}</dt><dd>${esc(m.description || '')}</dd>`).join('')}
        </dl></div>`).join('')}
      </section>`;
  }

  function stripForExport() {
    return {
      app: 'mound-report', version: 1, exportedAt: new Date().toISOString(),
      pitchers: state.pitchers,
      sessions: state.sessions
    };
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(url) {
    const [head, body] = url.split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function exportBackup() {
    const includeMedia = $('#backup-media')?.checked;
    const data = stripForExport();
    data.media = [];
    try {
      if (includeMedia) {
        toast('Preparing backup…');
        const all = await DB.getAll('media');
        for (const m of all) {
          const { blob, ...rest } = m;
          data.media.push({ ...rest, dataUrl: blob ? await blobToDataURL(blob) : null });
        }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mound-report-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Backup file created. Check your downloads folder.');
    } catch (e) { toast("The backup couldn't be created. Try again without video and photos.", 'error'); }
  }

  function copyJSON() {
    const text = JSON.stringify(stripForExport(), null, 2);
    const done = () => toast('Stats copied to clipboard');
    const fallback = () => {
      const { modal, close } = openModal({
        label: 'Copy stats',
        html: `<h2 class="modal-title">Copy Stats</h2><p class="modal-text">Select all and copy this text.</p>
          <textarea id="copy-area" rows="12" readonly></textarea>
          <div class="modal-actions"><span class="spacer"></span><button class="btn" data-m="close">Done</button></div>`
      });
      const ta = modal.querySelector('#copy-area');
      ta.value = text; ta.focus(); ta.select();
      modal.querySelector('[data-m="close"]').addEventListener('click', () => close());
    };
    try {
      navigator.clipboard.writeText(text).then(done, fallback);
    } catch (e) { fallback(); }
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'mound-report' || !Array.isArray(data.pitchers) || !Array.isArray(data.sessions)) throw new Error('format');
      await DB.putMany('pitchers', data.pitchers);
      await DB.putMany('sessions', data.sessions);
      let mediaN = 0;
      for (const m of data.media || []) {
        if (!m.dataUrl) continue;
        const { dataUrl, ...rest } = m;
        await DB.put('media', { ...rest, blob: dataURLToBlob(dataUrl) });
        mediaN++;
      }
      // recount media per imported session
      for (const s of data.sessions) {
        const c = await DB.countByIndex('media', 'sessionId', s.id);
        if (c !== s.mediaCount) await DB.put('sessions', { ...s, mediaCount: c });
      }
      await DB.put('meta', { key: 'seeded', value: true });
      state.pitchers = await DB.getAll('pitchers');
      state.sessions = await DB.getAll('sessions');
      toast(`Restored ${plural(data.pitchers.length, 'pitcher')}, ${plural(data.sessions.length, 'session')}${mediaN ? `, ${plural(mediaN, 'media file')}` : ''}`);
      render();
    } catch (e) {
      toast("That file isn't a Mound Report backup. Choose a .json file downloaded from this app.", 'error');
    }
  }

  async function clearSample() {
    const ok = await confirmDialog({
      title: 'Clear sample data?',
      message: 'This removes the four sample pitchers and their sessions. Pitchers you added stay.',
      confirmLabel: 'Clear Sample Data'
    });
    if (!ok) return;
    const ids = state.pitchers.filter(p => p.sample).map(p => p.id);
    for (const id of ids) {
      const mk = await DB.keysByIndex('media', 'pitcherId', id);
      for (const k of mk) await DB.delete('media', k);
      for (const s of sessionsFor(id)) await DB.delete('sessions', s.id);
      await DB.delete('pitchers', id);
    }
    for (const s of state.sessions.filter(x => x.sample)) await DB.delete('sessions', s.id);
    state.pitchers = state.pitchers.filter(p => !p.sample);
    state.sessions = state.sessions.filter(s => !s.sample && !ids.includes(s.pitcherId));
    toast('Sample data cleared');
    go('roster');
  }

  async function clearAll() {
    const ok = await confirmDialog({
      title: 'Delete all data?',
      message: `This deletes ${plural(state.pitchers.length, 'pitcher')}, ${plural(state.sessions.length, 'session')}, and every video and photo in this browser. This can't be undone.`,
      confirmLabel: 'Delete Everything'
    });
    if (!ok) return;
    await DB.clear('media');
    await DB.clear('sessions');
    await DB.clear('pitchers');
    await DB.put('meta', { key: 'seeded', value: true });
    state.pitchers = [];
    state.sessions = [];
    toast('All data deleted');
    go('roster');
  }

  /* =========================================================
     Global events
     ========================================================= */
  async function handleAction(action, el) {
    switch (action) {
      case 'new-session': {
        const pid = el.dataset.pitcher || (state.view.name === 'pitcher' ? state.view.id : null);
        go('form', null, { pitcherId: pid });
        break;
      }
      case 'edit-session': go('form', el.dataset.id); break;
      case 'delete-session': deleteSession(el.dataset.id); break;
      case 'new-pitcher': openPitcherModal(null); break;
      case 'edit-pitcher': openPitcherModal(el.dataset.id); break;
      case 'hand-filter':
        state.rosterFilter.hand = el.dataset.hand;
        $$('.chip[data-action="hand-filter"]').forEach(c => { const on = c.dataset.hand === el.dataset.hand; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
        $('#roster-table').innerHTML = rosterTable();
        break;
      case 'open-media': {
        const items = state.view.name === 'form' ? formMediaList() : state.mediaItems;
        openLightbox(items, Number(el.dataset.idx) || 0);
        break;
      }
      case 'remove-media': {
        const m = state.mediaItems.find(x => x.id === el.dataset.id);
        const ok = await confirmDialog({ title: 'Remove this file?', message: `<strong>${esc(m?.caption || m?.name || 'This file')}</strong> will be removed from the session.`, confirmLabel: 'Remove' });
        if (!ok) return;
        await DB.delete('media', el.dataset.id);
        revokeUrls();
        await loadSessionMedia(state.view.id);
        toast('File removed');
        break;
      }
      case 'form-remove-media': {
        const id = el.dataset.id;
        const ni = state.form.newFiles.findIndex(f => f.id === id);
        if (ni >= 0) state.form.newFiles.splice(ni, 1); else state.form.removed.add(id);
        renderFormMedia();
        break;
      }
      case 'pick-files': $('#form-files')?.click(); break;
      case 'quick-upload': $('#quick-upload')?.click(); break;
      case 'calc-bauer': calcBauer(); break;
      case 'export': exportBackup(); break;
      case 'copy-json': copyJSON(); break;
      case 'import': $('#import-file')?.click(); break;
      case 'clear-sample': clearSample(); break;
      case 'clear-all': clearAll(); break;
      default: break;
    }
  }

  function bindGlobal() {
    document.addEventListener('click', e => {
      if (e.target.closest('#modal-root') && !e.target.closest('[data-action]')) return;
      const act = e.target.closest('[data-action]');
      if (act) { e.preventDefault(); handleAction(act.dataset.action, act); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) { e.preventDefault(); go(nav.dataset.nav, nav.dataset.id || null); }
    });

    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-nav]')) {
        e.preventDefault();
        go(e.target.dataset.nav, e.target.dataset.id || null);
      }
    });

    document.addEventListener('input', e => {
      if (e.target.id === 'roster-search') {
        state.rosterFilter.q = e.target.value;
        $('#roster-table').innerHTML = rosterTable();
      }
      if (e.target.dataset.caption && state.form) {
        const id = e.target.dataset.caption;
        const item = formMediaList().find(m => m.id === id);
        if (item) item.caption = e.target.value;
      }
    });

    document.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'chart-select') { state.chartId = t.value; drawChart(); }
      if (t.id === 'log-pitcher') { state.logFilter.pitcher = t.value; $('#log-table').innerHTML = logTable(); }
      if (t.id === 'log-type') { state.logFilter.type = t.value; $('#log-table').innerHTML = logTable(); }
      if (t.id === 'quick-upload') { quickUpload(Array.from(t.files || [])); t.value = ''; }
      if (t.id === 'import-file' && t.files?.[0]) { importBackup(t.files[0]); t.value = ''; }
    });

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (state.view.name === 'pitcher') drawChart(); }, 120);
    });
  }

  init().catch(err => {
    console.error(err);
    $('#main').innerHTML = `<div class="empty"><h2>Something went wrong loading the app</h2><p>Reload the page. If it keeps happening, check that the app files are all in the same folder.</p></div>`;
  });
})();
