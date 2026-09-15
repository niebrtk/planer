/* Planer maturalny — logika strony.
   Bez frameworka i bez kroku budowania: dane z js/data-*.js, stan w localStorage. */
(function () {
  'use strict';

  // — konfiguracja ————————————————————————————————————————————————
  var EXAM_DATE = '2027-05-04';        // dzień matury (pierwszy egzamin)
  var EXAM_TIME = '09:00:00';          // godzina rozpoczęcia
  var ARKUSZE_GOAL = 15;               // cel arkuszy na przedmiot
  var INTERVALS = [1, 3, 7, 14, 30];   // odstępy powtórek w dniach
  var PROPOSALS = 3;                   // ile wymagań proponować na dziś
  var REVIEW_SHOWN = 6;                // ile powtórek pokazywać naraz
  var MILESTONES = [25, 50, 100, 150, 200, 250, 300, 350, 400];
  var STORE_KEY = 'matura-planner-v1';
  var DAY = 86400000;

  var META = window.PLANER_PRZEDMIOTY;
  var IDS = window.PLANER_KOLEJNOSC;
  var DZIALY = window.PLANER_DZIALY;
  var LISTY = window.PLANER_LISTY;
  var LEKTURY = window.PLANER_LEKTURY;
  var LEK_LABELS = ['Nieprzeczytane', 'W trakcie czytania', 'Przeczytane', 'Omówione'];
  var THEMES = ['auto', 'jasny', 'ciemny'];

  // — stan ————————————————————————————————————————————————————————
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) {}

  var state = {
    active: META[saved.active] ? saved.active : 'bio',
    tab: saved.tab || 'dzialy',
    marks: saved.marks || {},      // 'sid|si|gi|pi' -> 0 do nauki / 1 w trakcie / 2 opanowane
    arkusze: saved.arkusze || {},  // sid -> liczba rozwiązanych arkuszy
    lektury: saved.lektury || {},  // 'grp|tytuł' -> 0..3
    rep: saved.rep || {},          // 'sid|si|gi|pi' -> { l: poziom powtórki, d: termin (ms) }
    log: saved.log || {},          // 'RRRR-MM-DD' -> ile wymagań opanowano tego dnia
    theme: THEMES.indexOf(saved.theme) >= 0 ? saved.theme : 'auto',
    open: {}                       // 'sid|si' -> czy dział rozwinięty
  };

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        active: state.active, tab: state.tab, marks: state.marks,
        arkusze: state.arkusze, lektury: state.lektury,
        rep: state.rep, log: state.log, theme: state.theme
      }));
    } catch (e) { /* tryb prywatny / brak miejsca — planer działa dalej, bez zapisu */ }
  }

  // — daty ————————————————————————————————————————————————————————
  function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysToExam() {
    var diff = new Date(EXAM_DATE + 'T' + EXAM_TIME) - new Date();
    return Math.max(1, Math.ceil(diff / DAY));
  }

  // — dane przedmiotu ——————————————————————————————————————————————
  function sectionsFor(sid) {
    if (DZIALY[sid]) return DZIALY[sid];
    return (LISTY[sid] || []).map(function (g) {
      return { num: '', title: g.label || 'Zakres wymagań', groups: [g] };
    });
  }

  function markKey(sid, si, gi, pi) { return sid + '|' + si + '|' + gi + '|' + pi; }
  function lekKey(group, title) { return group.slice(0, 4) + '|' + title; }

  // Płaska lista wszystkich wymagań — do powtórek i propozycji na dziś.
  var flatCache = null;
  function allPoints() {
    if (flatCache) return flatCache;
    flatCache = [];
    IDS.forEach(function (sid) {
      sectionsFor(sid).forEach(function (sec, si) {
        sec.groups.forEach(function (g, gi) {
          g.points.forEach(function (text, pi) {
            flatCache.push({
              sid: sid, si: si, gi: gi, pi: pi,
              key: markKey(sid, si, gi, pi), text: text,
              sekcja: (sec.num ? sec.num + '. ' : '') + sec.title
            });
          });
        });
      });
    });
    return flatCache;
  }

  function countSubject(sid) {
    var done = 0, total = 0, score = 0;
    sectionsFor(sid).forEach(function (sec, si) {
      sec.groups.forEach(function (g, gi) {
        g.points.forEach(function (_, pi) {
          var v = state.marks[markKey(sid, si, gi, pi)] || 0;
          total++; score += v; if (v === 2) done++;
        });
      });
    });
    return { done: done, total: total, score: score, pct: total ? Math.round(100 * score / (total * 2)) : 0 };
  }

  // — powtórki ————————————————————————————————————————————————————
  function scheduleReview(key, level) {
    state.rep[key] = { l: level, d: Date.now() + INTERVALS[Math.min(level, INTERVALS.length - 1)] * DAY };
  }
  // Wymagania opanowane przed wprowadzeniem powtórek dostają termin na jutro.
  function backfillReviews() {
    Object.keys(state.marks).forEach(function (key) {
      if (state.marks[key] === 2 && !state.rep[key]) scheduleReview(key, 0);
    });
    Object.keys(state.rep).forEach(function (key) {
      if (state.marks[key] !== 2) delete state.rep[key];
    });
  }
  function dueReviews() {
    var now = Date.now();
    var byKey = {};
    allPoints().forEach(function (p) { byKey[p.key] = p; });
    return Object.keys(state.rep)
      .filter(function (k) { return state.rep[k].d <= now && byKey[k]; })
      .sort(function (a, b) { return state.rep[a].d - state.rep[b].d; })
      .map(function (k) { return byKey[k]; });
  }

  // — propozycje na dziś ————————————————————————————————————————————
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function proposals(counts) {
    var today = dayKey(new Date());
    var due = {};
    dueReviews().forEach(function (p) { due[p.key] = true; });

    var scored = allPoints().filter(function (p) {
      return (state.marks[p.key] || 0) !== 2 && !due[p.key];
    }).map(function (p) {
      var v = state.marks[p.key] || 0;
      // zaczęte wymagania mają pierwszeństwo, potem najsłabiej opanowany przedmiot
      var score = (v === 1 ? 1000 : 0) + (100 - counts[p.sid].pct) + hash(p.key + today) * 20;
      return { p: p, score: score };
    }).sort(function (a, b) { return b.score - a.score; });

    var out = [], seen = {};
    for (var i = 0; i < scored.length && out.length < PROPOSALS; i++) {
      var p = scored[i].p, bucket = p.sid + '|' + p.si;
      if (seen[bucket]) continue;      // najwyżej jedno wymaganie z działu
      seen[bucket] = true;
      out.push(p);
    }
    return out;
  }

  // — tempo, seria, cele ——————————————————————————————————————————
  function logToday(n) {
    var k = dayKey(new Date());
    state.log[k] = (state.log[k] || 0) + n;
    if (state.log[k] <= 0) delete state.log[k];
  }
  function streak() {
    var d = new Date(), n = 0;
    if (!state.log[dayKey(d)]) d = new Date(Date.now() - DAY);  // dziś jeszcze nic — liczymy od wczoraj
    while (state.log[dayKey(d)]) { n++; d = new Date(d - DAY); }
    return n;
  }
  function lastDays(n) {
    var sum = 0;
    for (var i = 0; i < n; i++) sum += state.log[dayKey(new Date(Date.now() - i * DAY))] || 0;
    return sum;
  }
  function weekCount() {
    var now = new Date();
    var dow = (now.getDay() + 6) % 7;   // poniedziałek = 0
    var sum = 0;
    for (var i = 0; i <= dow; i++) sum += state.log[dayKey(new Date(Date.now() - i * DAY))] || 0;
    return sum;
  }

  // — akcje ————————————————————————————————————————————————————————
  function setMark(key, v) {
    var prev = state.marks[key] || 0;
    if (prev === v) return;
    state.marks[key] = v;
    if (v === 2) { scheduleReview(key, 0); logToday(1); }
    else if (prev === 2) { delete state.rep[key]; logToday(-1); }
    save(); render();
  }
  function cycleMark(key) { setMark(key, ((state.marks[key] || 0) + 1) % 3); }
  function reviewOk(key) {
    var r = state.rep[key] || { l: 0 };
    scheduleReview(key, Math.min(r.l + 1, INTERVALS.length - 1));
    save(); render();
  }
  function reviewAgain(key) { setMark(key, 1); }   // wraca do „w trakcie", powtórka znika

  function cycleLektura(key) {
    state.lektury[key] = ((state.lektury[key] || 0) + 1) % 4;
    save(); render();
  }
  function bumpArk(d) {
    state.arkusze[state.active] = Math.max(0, (state.arkusze[state.active] || 0) + d);
    save(); render();
  }
  function setSubject(sid) {
    state.active = sid; state.tab = 'dzialy';
    save(); render();
  }
  function setTab(id) { state.tab = id; save(); render(); }
  function toggleSection(sid, si) {
    state.open[sid + '|' + si] = !state.open[sid + '|' + si];
    render();
  }
  function jumpTo(p) {
    state.active = p.sid; state.tab = 'dzialy';
    state.open[p.sid + '|' + p.si] = true;
    save(); render();
    requestAnimationFrame(function () {
      var node = document.querySelector('[data-key="' + CSS.escape(p.key) + '"]');
      if (!node) return;
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node.classList.add('is-target');
      node.focus({ preventScroll: true });
    });
  }

  // — motyw ————————————————————————————————————————————————————————
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  function effectiveTheme() {
    return state.theme === 'auto' ? (mql.matches ? 'dark' : 'light')
      : state.theme === 'ciemny' ? 'dark' : 'light';
  }
  function applyTheme() { document.documentElement.dataset.theme = effectiveTheme(); }
  function cycleTheme() {
    state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
    save(); applyTheme(); render();
  }
  function subjColor(m) { return effectiveTheme() === 'dark' ? m.colorDark : m.color; }
  function subjTint(m) { return effectiveTheme() === 'dark' ? m.tintDark : m.tint; }
  mql.addEventListener('change', function () { if (state.theme === 'auto') { applyTheme(); render(); } });

  // — pomocniki DOM ————————————————————————————————————————————————
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function btn(className, text, onClick) {
    var b = el('button', className, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n);
    if (a === 1) return one;
    if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 10 || a % 100 >= 20)) return few;
    return many;
  }

  // — odliczanie ————————————————————————————————————————————————————
  function pad(n) { return String(n).padStart(2, '0'); }
  function tick() {
    var diff = Math.max(0, new Date(EXAM_DATE + 'T' + EXAM_TIME) - new Date());
    $('days').textContent = Math.floor(diff / DAY);
    $('hours').textContent = pad(Math.floor(diff / 3600000) % 24);
    $('minutes').textContent = pad(Math.floor(diff / 60000) % 60);
    $('seconds').textContent = pad(Math.floor(diff / 1000) % 60);
  }

  // — render ————————————————————————————————————————————————————————
  function render() {
    var act = state.active;
    var meta = META[act];
    var counts = {};
    var sumDone = 0, sumTotal = 0, sumScore = 0, totalArkusze = 0;

    IDS.forEach(function (id) {
      counts[id] = countSubject(id);
      sumDone += counts[id].done;
      sumTotal += counts[id].total;
      sumScore += counts[id].score;
      totalArkusze += state.arkusze[id] || 0;
    });
    // Ten sam wzór co dla przedmiotu: „w trakcie" liczy się jako pół punktu.
    var overallPct = sumTotal ? Math.round(100 * sumScore / (sumTotal * 2)) : 0;

    document.documentElement.style.setProperty('--subject-color', subjColor(meta));
    document.documentElement.style.setProperty('--subject-tint', subjTint(meta));

    $('exam-year').textContent = EXAM_DATE.slice(0, 4);
    $('theme-btn').textContent = 'Motyw: ' + state.theme;
    $('overall-pct').textContent = overallPct + '%';
    $('done-total').textContent = sumDone;
    $('arkusze-total').textContent = totalArkusze + ' / ' + (ARKUSZE_GOAL * IDS.length);

    renderToday(counts, sumDone, sumTotal);
    renderSubjectTabs(counts);

    $('panel-title').textContent = meta.name;
    $('panel-meta').textContent = (meta.level === 'PR' ? 'Poziom rozszerzony' : 'Poziom podstawowy') +
      ' · ' + counts[act].done + '/' + counts[act].total + ' punktów';
    $('panel-bar').style.width = counts[act].pct + '%';

    var tabs = [{ id: 'dzialy', label: 'Działy' }, { id: 'arkusze', label: 'Arkusze' }];
    if (act === 'pol') tabs.push({ id: 'lektury', label: 'Lektury' });
    if (!tabs.some(function (t) { return t.id === state.tab; })) state.tab = 'dzialy';
    renderSubtabs(tabs);

    var body = $('panel-body');
    clear(body);
    if (state.tab === 'dzialy') body.appendChild(renderSections(act));
    else if (state.tab === 'lektury') body.appendChild(renderLektury());
    else body.appendChild(renderArkusze(meta));
  }

  // „Dziś": tempo, cel tygodnia, powtórki i propozycje
  function renderToday(counts, sumDone, sumTotal) {
    var left = sumTotal - sumDone;
    var days = daysToExam();
    var pace = left / days;
    var week = weekCount();
    var weekGoal = Math.max(5, Math.round(pace * 7));
    var avg7 = lastDays(7) / 7;
    var s = streak();

    $('streak').textContent = s ? 'seria ' + s + ' ' + plural(s, 'dzień', 'dni', 'dni') : 'seria — ';

    var paceEl = $('pace');
    clear(paceEl);
    if (left === 0) {
      paceEl.appendChild(document.createTextNode('Wszystkie wymagania opanowane.'));
    } else {
      paceEl.appendChild(document.createTextNode(
        pace.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) +
        ' wymagania dziennie'));
      var note = el('div', 'pace-note', 'tyle trzeba, żeby zdążyć z ' + left + ' ' +
        plural(left, 'wymaganiem', 'wymaganiami', 'wymaganiami') + ' w ' + days + ' ' +
        plural(days, 'dzień', 'dni', 'dni') +
        (lastDays(7) > 0
          ? ' · ostatni tydzień: ' + avg7.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) +
            '/dzień, ' + (avg7 >= pace ? 'jesteś na dobrej drodze' : 'trzeba przyspieszyć')
          : ''));
      paceEl.appendChild(note);
    }

    var next = MILESTONES.concat(sumTotal).find(function (m) { return m > sumDone; });
    $('milestone').textContent = next
      ? 'Następny kamień milowy: ' + next + ' opanowanych punktów — zostało ' + (next - sumDone) + '.'
      : 'Wszystkie kamienie milowe zdobyte.';

    $('week-label').textContent = 'W tym tygodniu ' + week + ' / ' + weekGoal + ' wymagań';
    $('week-bar').style.width = Math.min(100, Math.round(100 * week / weekGoal)) + '%';

    var lists = $('today-lists');
    clear(lists);

    var due = dueReviews();
    if (due.length) {
      var block = el('div', 'today-block');
      block.appendChild(el('div', 'today-block-label',
        'Do powtórki (' + due.length + ')'));
      due.slice(0, REVIEW_SHOWN).forEach(function (p) {
        block.appendChild(todayRow(p, [
          btn('today-btn is-primary', 'umiem', function () { reviewOk(p.key); }),
          btn('today-btn', 'jeszcze nie', function () { reviewAgain(p.key); })
        ]));
      });
      if (due.length > REVIEW_SHOWN) {
        block.appendChild(el('div', 'today-more',
          'i jeszcze ' + (due.length - REVIEW_SHOWN) + ' — pokażą się po odhaczeniu powyższych.'));
      }
      lists.appendChild(block);
    }

    var prop = proposals(counts);
    if (prop.length) {
      var pb = el('div', 'today-block');
      pb.appendChild(el('div', 'today-block-label', 'Na dziś'));
      prop.forEach(function (p) {
        pb.appendChild(todayRow(p, [
          btn('today-btn is-primary', 'opanowane', function () { setMark(p.key, 2); }),
          btn('today-btn', 'w trakcie', function () { setMark(p.key, 1); })
        ]));
      });
      lists.appendChild(pb);
    } else if (!due.length) {
      lists.appendChild(el('div', 'today-empty',
        'Na dziś nic nie czeka — wszystko opanowane i powtórzone.'));
    }
  }

  function todayRow(p, actions) {
    var m = META[p.sid];
    var row = el('div', 'today-row');
    row.style.setProperty('--subject-color', subjColor(m));   // przyciski w kolorze przedmiotu wiersza
    var jump = btn('today-jump', null, function () { jumpTo(p); });
    var tag = el('span', 'today-tag', m.short);
    tag.style.setProperty('--c', subjColor(m));
    jump.appendChild(tag);
    var text = el('span', 'today-text', p.text);
    jump.appendChild(text);
    jump.title = m.name + ' · ' + p.sekcja;
    row.appendChild(jump);
    var acts = el('div', 'today-actions');
    actions.forEach(function (a) { acts.appendChild(a); });
    row.appendChild(acts);
    return row;
  }

  function renderSubjectTabs(counts) {
    var nav = $('subjects');
    clear(nav);
    IDS.forEach(function (id) {
      var m = META[id];
      var active = id === state.active;
      var b = btn('subject-tab', null, function () { setSubject(id); });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.style.setProperty('--c', subjColor(m));
      b.style.setProperty('--tint', subjTint(m));
      b.appendChild(document.createTextNode(m.name + ' ' + m.level));
      b.appendChild(el('span', 'subject-tab-pct', counts[id].pct + '%'));
      nav.appendChild(b);
    });
  }

  function renderSubtabs(tabs) {
    var wrap = $('subtabs');
    clear(wrap);
    tabs.forEach(function (t) {
      var b = btn('subtab', t.label, function () { setTab(t.id); });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', state.tab === t.id ? 'true' : 'false');
      wrap.appendChild(b);
    });
  }

  function renderSections(act) {
    var frag = document.createDocumentFragment();
    var list = el('div', 'sections');

    sectionsFor(act).forEach(function (sec, si) {
      var open = !!state.open[act + '|' + si];
      var sDone = 0, sTotal = 0;
      sec.groups.forEach(function (g, gi) {
        g.points.forEach(function (_, pi) {
          sTotal++;
          if ((state.marks[markKey(act, si, gi, pi)] || 0) === 2) sDone++;
        });
      });

      var box = el('div', 'section');
      var head = btn('section-head', null, function () { toggleSection(act, si); });
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      head.appendChild(el('span', 'section-num', sec.num));
      head.appendChild(el('span', 'section-title', sec.title));
      head.appendChild(el('span', 'section-count' + (sTotal && sDone === sTotal ? ' is-complete' : ''),
        sDone + '/' + sTotal));
      head.appendChild(el('span', 'section-caret', open ? '–' : '+'));
      box.appendChild(head);

      if (open) box.appendChild(renderSectionBody(act, si, sec));
      list.appendChild(box);
    });

    frag.appendChild(list);
    frag.appendChild(el('div', 'hint',
      'Rozwiń dział, aby zaznaczać pojedyncze wymagania: do nauki → w trakcie → opanowane. ' +
      'Opanowane wracają później w sekcji „Dziś" do powtórki.'));
    return frag;
  }

  function renderSectionBody(act, si, sec) {
    var body = el('div', 'section-body');
    sec.groups.forEach(function (g, gi) {
      var group = el('div', 'group');
      if (g.label) group.appendChild(el('div', 'group-label', g.label));
      var points = el('div', 'points');
      g.points.forEach(function (text, pi) {
        var key = markKey(act, si, gi, pi);
        var v = state.marks[key] || 0;
        var row = btn('point', null, function () { cycleMark(key); });
        row.dataset.key = key;
        row.setAttribute('aria-pressed', v === 2 ? 'true' : 'false');
        row.appendChild(el('span', 'point-box' + (v === 2 ? ' is-done' : v === 1 ? ' is-progress' : ''),
          v === 2 ? '✓' : v === 1 ? '·' : ''));
        row.appendChild(el('span', 'point-text' + (v === 2 ? ' is-done' : ''), text));
        points.appendChild(row);
      });
      group.appendChild(points);
      body.appendChild(group);
    });
    return body;
  }

  function renderLektury() {
    var wrap = el('div', 'lektury');
    var done = 0, total = 0;
    LEKTURY.forEach(function (g) {
      g.items.forEach(function (title) {
        total++;
        if ((state.lektury[lekKey(g.group, title)] || 0) >= 2) done++;
      });
    });
    wrap.appendChild(el('div', 'lektury-hint', done + '/' + total +
      ' lektur przeczytanych · kliknij, aby zmienić: nieprzeczytane → w trakcie czytania → przeczytane → omówione'));

    LEKTURY.forEach(function (g) {
      var grp = el('div', 'lek-group');
      grp.appendChild(el('div', 'lek-group-label', g.group));
      var list = el('div', 'lek-list');
      g.items.forEach(function (title) {
        var key = lekKey(g.group, title);
        var v = state.lektury[key] || 0;
        var cls = v >= 2 ? ' is-done' : v === 1 ? ' is-progress' : '';
        var row = btn('lek-row', null, function () { cycleLektura(key); });
        row.appendChild(el('span', 'lek-box' + cls, v === 3 ? '★' : v === 2 ? '✓' : v === 1 ? '·' : ''));
        row.appendChild(el('span', 'lek-name' + (v >= 2 ? ' is-done' : ''), title));
        row.appendChild(el('span', 'lek-tag' + cls, LEK_LABELS[v]));
        list.appendChild(row);
      });
      grp.appendChild(list);
      wrap.appendChild(grp);
    });
    return wrap;
  }

  function renderArkusze(meta) {
    var row = el('div', 'arkusze');
    row.appendChild(el('span', 'arkusze-label', 'Arkusze — ' + meta.name));

    var ctrl = el('div', 'arkusze-ctrl');
    var minus = btn('ark-btn', '−', function () { bumpArk(-1); });
    minus.setAttribute('aria-label', 'odejmij arkusz');
    var count = el('span', 'ark-count', (state.arkusze[state.active] || 0) + ' / ' + ARKUSZE_GOAL);
    var plus = btn('ark-btn is-primary', '+', function () { bumpArk(1); });
    plus.setAttribute('aria-label', 'dodaj arkusz');

    ctrl.appendChild(minus); ctrl.appendChild(count); ctrl.appendChild(plus);
    row.appendChild(ctrl);
    return row;
  }

  // — skróty klawiszowe ————————————————————————————————————————————
  function rows() {
    return [].slice.call(document.querySelectorAll(
      '.today-jump, .section-head, .point, .lek-row'));
  }
  function moveFocus(d) {
    var list = rows();
    if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    var next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
  function toggleAll() {
    var act = state.active;
    var secs = sectionsFor(act);
    var anyClosed = secs.some(function (_, si) { return !state.open[act + '|' + si]; });
    secs.forEach(function (_, si) { state.open[act + '|' + si] = anyClosed; });
    render();
  }
  function showHelp(on) {
    $('help').hidden = !on;
    if (on) $('help-close').focus(); else $('help-btn').focus();
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

    if (e.key === 'Escape') { showHelp(false); return; }
    if (e.key === '?') { e.preventDefault(); showHelp($('help').hidden); return; }
    if (!$('help').hidden) return;

    var i = '1234'.indexOf(e.key);
    if (i >= 0 && IDS[i]) { e.preventDefault(); setSubject(IDS[i]); return; }

    switch (e.key.toLowerCase()) {
      case 'd': setTab('dzialy'); break;
      case 'a': setTab('arkusze'); break;
      case 'l': if (state.active === 'pol') setTab('lektury'); break;
      case 'j': e.preventDefault(); moveFocus(1); break;
      case 'k': e.preventDefault(); moveFocus(-1); break;
      case 'o': toggleAll(); break;
      case 't': cycleTheme(); break;
    }
  });

  $('theme-btn').addEventListener('click', cycleTheme);
  $('help-btn').addEventListener('click', function () { showHelp(true); });
  $('help-close').addEventListener('click', function () { showHelp(false); });
  $('help').addEventListener('click', function (e) { if (e.target === $('help')) showHelp(false); });

  // — start ————————————————————————————————————————————————————————
  backfillReviews();
  applyTheme();
  save();
  render();
  tick();
  setInterval(tick, 1000);
})();
