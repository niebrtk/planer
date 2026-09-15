/* Planer maturalny — logika strony.
   Bez frameworka i bez kroku budowania: dane z js/data-*.js, stan w localStorage. */
(function () {
  'use strict';

  // — konfiguracja ————————————————————————————————————————————————
  var EXAM_DATE = '2027-05-04';        // dzień matury (pierwszy egzamin)
  var EXAM_TIME = '09:00:00';          // godzina rozpoczęcia
  var ARKUSZE_GOAL = 15;               // cel arkuszy na przedmiot
  var INTERVALS = [1, 3, 7, 14, 30];   // odstępy powtórek w dniach
  var REVIEW_SHOWN = 6;                // ile powtórek pokazywać naraz
  var MILESTONES = [25, 50, 100, 150, 200, 250, 300, 350, 400];
  var PRZYGOTOWANIE_MIN = 15;          // czas na przygotowanie na ustnej
  var WYPOWIEDZ_MIN = 10;              // czas wypowiedzi
  var NOTATKA_POLA = [
    { id: 'teza', label: 'Teza' },
    { id: 'argumenty', label: 'Argumenty z lektury' },
    { id: 'kontekst', label: 'Kontekst' },
    { id: 'wniosek', label: 'Wniosek' }
  ];
  var STORE_KEY = 'matura-planner-v1';
  var DAY = 86400000;

  var META = window.PLANER_PRZEDMIOTY;
  var IDS = window.PLANER_KOLEJNOSC;
  var DZIALY = window.PLANER_DZIALY;
  var LISTY = window.PLANER_LISTY;
  var LEKTURY = window.PLANER_LEKTURY;
  var PYTANIA = window.PLANER_PYTANIA;
  var LEK_LABELS = ['Nieprzeczytane', 'W trakcie czytania', 'Przeczytane', 'Omówione'];
  var PYT_LABELS = ['do opracowania', 'w trakcie', 'opracowane'];
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
    pytania: saved.pytania || {},  // numer pytania ustnego -> 0 do opracowania / 1 w trakcie / 2 opracowane
    notatki: saved.notatki || {},  // numer pytania -> { teza, argumenty, kontekst, wniosek }
    ustnaNr: saved.ustnaNr || null,// wylosowane pytanie w trybie ustnej
    rep: saved.rep || {},          // 'sid|si|gi|pi' -> { l: poziom powtórki, d: termin (ms) }
    log: saved.log || {},          // 'RRRR-MM-DD' -> ile wymagań opanowano tego dnia
    theme: THEMES.indexOf(saved.theme) >= 0 ? saved.theme : 'auto',
    open: {},                      // 'sid|si' -> czy dział rozwinięty
    openLek: {}                    // tytuł lektury -> czy pytania rozwinięte
  };

  var POLA_ZAPISU = ['active', 'tab', 'marks', 'arkusze', 'lektury', 'pytania',
    'notatki', 'ustnaNr', 'rep', 'log', 'theme'];

  function zapisywanyStan() {
    var out = {};
    POLA_ZAPISU.forEach(function (k) { out[k] = state[k]; });
    return out;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(zapisywanyStan()));
    } catch (e) { /* tryb prywatny / brak miejsca — planer działa dalej, bez zapisu */ }
    if (window.PLANER_SYNC && window.PLANER_SYNC.zapisz) window.PLANER_SYNC.zapisz();
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

  function wszystkiePytania() {
    return Object.keys(PYTANIA).reduce(function (a, t) {
      return a.concat(PYTANIA[t].map(function (q) {
        return { nr: q.nr, temat: q.temat, zrodlo: q.zrodlo, lektura: t };
      }));
    }, []).sort(function (a, b) { return a.nr - b.nr; });
  }
  function pytanieNr(nr) {
    return wszystkiePytania().find(function (q) { return q.nr === nr; }) || null;
  }
  function maNotatke(nr) {
    var n = state.notatki[nr];
    return !!n && NOTATKA_POLA.some(function (f) { return (n[f.id] || '').trim(); });
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
  // Kontynuacja: dla każdego przedmiotu pierwsze nieopanowane wymaganie leżące
  // ZA ostatnim opanowanym. Nic jeszcze nie opanowane — zaczynamy od początku.
  // Gdy za ostatnim opanowanym nic nie zostało, wracamy do luk wcześniej.
  function nextFor(sid) {
    var pts = allPoints().filter(function (p) { return p.sid === sid; });
    var last = -1;
    pts.forEach(function (p, i) { if ((state.marks[p.key] || 0) === 2) last = i; });
    var unmastered = function (p) { return (state.marks[p.key] || 0) !== 2; };
    return pts.slice(last + 1).find(unmastered) || pts.find(unmastered);
  }
  function proposals() {
    return IDS.map(nextFor).filter(Boolean);
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
  function cyclePytanie(nr) {
    state.pytania[nr] = ((state.pytania[nr] || 0) + 1) % 3;
    save(); render();
  }
  var timer = { faza: 'idle', koniec: 0 };   // faza: idle | przygotowanie | wypowiedz | koniec

  function losujPytanie() {
    var wszystkie = wszystkiePytania();
    var pula = wszystkie.filter(function (q) {
      return (state.pytania[q.nr] || 0) !== 2 && q.nr !== state.ustnaNr;
    });
    if (!pula.length) pula = wszystkie.filter(function (q) { return q.nr !== state.ustnaNr; });
    if (!pula.length) pula = wszystkie;
    state.ustnaNr = pula[Math.floor(Math.random() * pula.length)].nr;
    timer.faza = 'idle';
    save(); render();
  }
  function startFazy(faza) {
    timer.faza = faza;
    timer.koniec = Date.now() + (faza === 'przygotowanie' ? PRZYGOTOWANIE_MIN : WYPOWIEDZ_MIN) * 60000;
    render();
  }
  function stopTimera() { timer.faza = 'idle'; render(); }
  function zapiszNotatke(nr, pole, wartosc) {
    var n = state.notatki[nr] || (state.notatki[nr] = {});
    n[pole] = wartosc;
    save();   // bez render(), żeby nie przerywać pisania
  }
  function toggleLektura(title) {
    state.openLek[title] = !state.openLek[title];
    render();
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
    tickUstna();
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
    renderHistoria(sumDone, sumTotal);
    renderSubjectTabs(counts);

    $('panel-title').textContent = meta.name;
    $('panel-meta').textContent = (meta.level === 'PR' ? 'Poziom rozszerzony' : 'Poziom podstawowy') +
      ' · ' + counts[act].done + '/' + counts[act].total + ' punktów';
    $('panel-bar').style.width = counts[act].pct + '%';

    var tabs = [{ id: 'dzialy', label: 'Działy' }, { id: 'arkusze', label: 'Arkusze' }];
    if (act === 'pol') { tabs.push({ id: 'lektury', label: 'Lektury' }); tabs.push({ id: 'ustna', label: 'Ustna' }); }
    if (!tabs.some(function (t) { return t.id === state.tab; })) state.tab = 'dzialy';
    renderSubtabs(tabs);

    var body = $('panel-body');
    clear(body);
    if (state.tab === 'dzialy') body.appendChild(renderSections(act));
    else if (state.tab === 'lektury') body.appendChild(renderLektury());
    else if (state.tab === 'ustna') body.appendChild(renderUstna());
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

    var prop = proposals();
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
    var body = el('div', 'today-text');
    body.appendChild(el('div', 'today-sekcja', p.sekcja));
    body.appendChild(el('div', null, p.text));
    jump.appendChild(body);
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
    var done = 0, total = 0, pytDone = 0, pytTotal = 0;
    LEKTURY.forEach(function (g) {
      g.items.forEach(function (title) {
        total++;
        if ((state.lektury[lekKey(g.group, title)] || 0) >= 2) done++;
      });
    });
    Object.keys(PYTANIA).forEach(function (t) {
      PYTANIA[t].forEach(function (q) { pytTotal++; if ((state.pytania[q.nr] || 0) === 2) pytDone++; });
    });

    wrap.appendChild(el('div', 'lektury-hint', done + '/' + total +
      ' lektur przeczytanych · kliknij, aby zmienić: nieprzeczytane → w trakcie czytania → przeczytane → omówione'));
    wrap.appendChild(el('div', 'lektury-hint', pytDone + '/' + pytTotal +
      ' pytań jawnych na ustną opracowanych · rozwiń lekturę, aby zobaczyć jej pytania'));

    LEKTURY.forEach(function (g) {
      var grp = el('div', 'lek-group');
      grp.appendChild(el('div', 'lek-group-label', g.group));
      var list = el('div', 'lek-list');
      g.items.forEach(function (title) { list.appendChild(renderLektura(g.group, title)); });
      grp.appendChild(list);
      wrap.appendChild(grp);
    });
    return wrap;
  }

  function renderLektura(group, title) {
    var key = lekKey(group, title);
    var v = state.lektury[key] || 0;
    var cls = v >= 2 ? ' is-done' : v === 1 ? ' is-progress' : '';
    var pyt = PYTANIA[title] || [];
    var open = !!state.openLek[title];

    var item = el('div', 'lek-item');
    var row = el('div', 'lek-row');
    var status = btn('lek-status', null, function () { cycleLektura(key); });
    status.appendChild(el('span', 'lek-box' + cls, v === 3 ? '★' : v === 2 ? '✓' : v === 1 ? '·' : ''));
    status.appendChild(el('span', 'lek-name' + (v >= 2 ? ' is-done' : ''), title));
    status.appendChild(el('span', 'lek-tag' + cls, LEK_LABELS[v]));
    row.appendChild(status);

    if (pyt.length) {
      var qDone = pyt.filter(function (q) { return (state.pytania[q.nr] || 0) === 2; }).length;
      var toggle = btn('lek-toggle' + (qDone === pyt.length ? ' is-complete' : ''), null,
        function () { toggleLektura(title); });
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.appendChild(el('span', null, qDone + '/' + pyt.length + ' pyt.'));
      toggle.appendChild(el('span', 'lek-caret', open ? '–' : '+'));
      row.appendChild(toggle);
    }
    item.appendChild(row);

    if (open && pyt.length) {
      var box = el('div', 'lek-questions');
      pyt.forEach(function (q) {
        var pv = state.pytania[q.nr] || 0;
        var b = btn('pyt-row', null, function () { cyclePytanie(q.nr); });
        b.setAttribute('aria-pressed', pv === 2 ? 'true' : 'false');
        b.title = PYT_LABELS[pv];
        b.appendChild(el('span', 'pyt-box' + (pv === 2 ? ' is-done' : pv === 1 ? ' is-progress' : ''),
          pv === 2 ? '✓' : pv === 1 ? '·' : ''));
        var txt = el('div', 'pyt-text');
        var head = el('div', 'pyt-temat' + (pv === 2 ? ' is-done' : ''));
        head.appendChild(el('span', 'pyt-nr', q.nr + '.'));
        head.appendChild(document.createTextNode(' ' + q.temat));
        txt.appendChild(head);
        txt.appendChild(el('div', 'pyt-zrodlo', q.zrodlo));
        if (maNotatke(q.nr)) head.appendChild(el('span', 'pyt-nota', 'notatka'));
        b.appendChild(txt);
        box.appendChild(b);
      });
      item.appendChild(box);
    }
    return item;
  }

  // — historia: wykres postępu i heatmapa dni ——————————————————————
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function dataZKlucza(k) {
    var cz = k.split('-');
    return new Date(+cz[0], +cz[1] - 1, +cz[2]);
  }
  function opisDnia(k) {
    return dataZKlucza(k).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Dzień po dniu: ile opanowano i ile było opanowanych łącznie.
  function historiaDni(sumDone) {
    var klucze = Object.keys(state.log).sort();
    if (!klucze.length) return null;
    var suma = klucze.reduce(function (a, k) { return a + state.log[k]; }, 0);
    var cum = sumDone - suma;                      // stan sprzed pierwszego zapisanego dnia
    var start = dataZKlucza(klucze[0]);
    var minStart = new Date(Date.now() - 13 * DAY);
    minStart.setHours(0, 0, 0, 0);
    if (start > minStart) start = minStart;

    var dni = [], d = new Date(start);
    d.setHours(0, 0, 0, 0);
    var dzis = new Date(); dzis.setHours(0, 0, 0, 0);
    while (d <= dzis) {
      var k = dayKey(d);
      cum += state.log[k] || 0;
      dni.push({ k: k, ile: state.log[k] || 0, cum: cum });
      d = new Date(d.getTime() + DAY);
    }
    return dni;
  }

  function renderHistoria(sumDone, sumTotal) {
    var host = $('historia');
    clear(host);
    var dni = historiaDni(sumDone);

    var head = el('div', 'today-head');
    head.appendChild(el('span', 'kicker', 'Historia'));
    host.appendChild(head);

    if (!dni) {
      host.appendChild(el('div', 'today-empty',
        'Wykres i kalendarz pojawią się, gdy odhaczysz pierwsze wymagania.'));
      return;
    }
    host.appendChild(wykresPostepu(dni, sumTotal));
    host.appendChild(heatmapaDni());
  }

  // Wykres skumulowanego postępu: jedna seria (ink) + przerywana linia wymaganego tempa.
  function wykresPostepu(dni, sumTotal) {
    var blok = el('div', 'hist-blok');
    blok.appendChild(el('div', 'today-block-label', 'Opanowane wymagania w czasie'));
    var readout = el('div', 'hist-readout');
    blok.appendChild(readout);

    var W = 720, H = 200, L = 6, R = 92, T = 14, B = 26;
    var start = dataZKlucza(dni[0].k);
    var doEgzaminu = Math.max(1, Math.round((new Date(EXAM_DATE + 'T' + EXAM_TIME) - start) / DAY));
    var cel = function (i) {
      return dni[0].cum + (sumTotal - dni[0].cum) * Math.min(1, i / doEgzaminu);
    };
    var maxY = Math.max(1, dni[dni.length - 1].cum, cel(dni.length - 1)) * 1.12;
    var x = function (i) { return L + (W - L - R) * (dni.length === 1 ? 0 : i / (dni.length - 1)); };
    var y = function (v) { return T + (H - T - B) * (1 - v / maxY); };

    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'hist-svg', role: 'img',
      'aria-label': 'Wykres: ' + dni[dni.length - 1].cum + ' opanowanych wymagań na ' +
        opisDnia(dni[dni.length - 1].k) + ', przy wymaganym tempie ' + Math.round(cel(dni.length - 1)) + '.' });

    s.appendChild(svg('line', { x1: L, y1: y(0), x2: W - R, y2: y(0), class: 'hist-os' }));

    var celD = dni.map(function (_, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(cel(i)); }).join(' ');
    s.appendChild(svg('path', { d: celD, class: 'hist-cel' }));

    var linia = dni.map(function (p, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(p.cum); }).join(' ');
    s.appendChild(svg('path', { d: linia, class: 'hist-linia' }));

    // etykiety bezpośrednie zamiast legendy — jedna seria i jedna linia odniesienia
    var ostatni = dni[dni.length - 1];
    s.appendChild(svg('circle', { cx: x(dni.length - 1), cy: y(ostatni.cum), r: 4, class: 'hist-punkt' }));
    var lab = svg('text', { x: x(dni.length - 1) + 10, y: y(ostatni.cum) + 4, class: 'hist-label' });
    lab.textContent = ostatni.cum + ' opanowane';
    s.appendChild(lab);
    // gdy linia tempa biegnie blisko postępu, etykiety rozjeżdżamy, żeby się nie nachodziły
    var yCel = y(cel(dni.length - 1)), yCum = y(ostatni.cum);
    if (Math.abs(yCel - yCum) < 15) yCel = yCum + (yCel >= yCum ? 15 : -15);
    var labCel = svg('text', { x: x(dni.length - 1) + 10, y: yCel + 4, class: 'hist-label is-muted' });
    labCel.textContent = 'wymagane tempo';
    s.appendChild(labCel);

    [0, dni.length - 1].forEach(function (i, n) {
      var t = svg('text', { x: x(i), y: H - 6, class: 'hist-tick' + (n ? ' is-end' : '') });
      t.textContent = dataZKlucza(dni[i].k).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
      s.appendChild(t);
    });

    // warstwa hover: pionowa linia trafia w najbliższy dzień
    var kres = svg('line', { x1: 0, y1: T, x2: 0, y2: y(0), class: 'hist-kres', opacity: 0 });
    s.appendChild(kres);
    var lupa = svg('circle', { r: 4, class: 'hist-lupa', opacity: 0 });
    s.appendChild(lupa);
    var hit = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' });
    s.appendChild(hit);

    var pokazDzien = function (p) {
      clear(readout);
      readout.appendChild(el('strong', null, p.cum + ' opanowanych'));
      readout.appendChild(document.createTextNode(' · ' + opisDnia(p.k) +
        (p.ile ? ' · tego dnia +' + p.ile : ' · tego dnia nic')));
    };
    pokazDzien(ostatni);
    hit.addEventListener('pointermove', function (e) {
      var r = s.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * W;
      var i = Math.max(0, Math.min(dni.length - 1,
        Math.round((px - L) / Math.max(1, (W - L - R)) * (dni.length - 1))));
      kres.setAttribute('x1', x(i)); kres.setAttribute('x2', x(i)); kres.setAttribute('opacity', 1);
      lupa.setAttribute('cx', x(i)); lupa.setAttribute('cy', y(dni[i].cum)); lupa.setAttribute('opacity', 1);
      pokazDzien(dni[i]);
    });
    hit.addEventListener('pointerleave', function () {
      kres.setAttribute('opacity', 0); lupa.setAttribute('opacity', 0); pokazDzien(ostatni);
    });
    blok.appendChild(s);

    // te same liczby bez najeżdżania myszą
    var det = el('details', 'hist-liczby');
    det.appendChild(el('summary', null, 'Pokaż liczby'));
    var tab = el('table', 'hist-tabela');
    var thead = el('tr');
    ['Dzień', 'Tego dnia', 'Łącznie'].forEach(function (t) { thead.appendChild(el('th', null, t)); });
    tab.appendChild(thead);
    dni.slice().reverse().forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('td', null, opisDnia(p.k)));
      tr.appendChild(el('td', null, p.ile ? '+' + p.ile : '—'));
      tr.appendChild(el('td', null, String(p.cum)));
      tab.appendChild(tr);
    });
    det.appendChild(tab);
    blok.appendChild(det);
    return blok;
  }

  // Kalendarz aktywności: jeden odcień, więcej = ciemniej.
  function heatmapaDni() {
    var TYG = 18, CELA = 13, ODSTEP = 3;
    var blok = el('div', 'hist-blok');
    blok.appendChild(el('div', 'today-block-label', 'Kalendarz nauki — ostatnie ' + TYG + ' tygodni'));

    var dzis = new Date(); dzis.setHours(0, 0, 0, 0);
    var koniecTyg = new Date(dzis.getTime() + (6 - (dzis.getDay() + 6) % 7) * DAY);   // niedziela bieżącego tygodnia
    var start = new Date(koniecTyg.getTime() - (TYG * 7 - 1) * DAY);

    var W = TYG * (CELA + ODSTEP), H = 7 * (CELA + ODSTEP) + 16;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'hm-svg', role: 'img',
      'aria-label': 'Kalendarz aktywności z ostatnich ' + TYG + ' tygodni.' });

    var miesiace = {};
    for (var t = 0; t < TYG; t++) {
      for (var d = 0; d < 7; d++) {
        var data = new Date(start.getTime() + (t * 7 + d) * DAY);
        if (data > dzis) continue;
        var k = dayKey(data), ile = state.log[k] || 0;
        var poziom = ile <= 0 ? 0 : ile <= 2 ? 1 : ile <= 5 ? 2 : 3;
        var cela = svg('rect', {
          x: t * (CELA + ODSTEP), y: 16 + d * (CELA + ODSTEP),
          width: CELA, height: CELA, class: 'hm-cela poziom-' + poziom, tabindex: '0'
        });
        var tip = svg('title');
        tip.textContent = opisDnia(k) + ' · ' + (ile > 0 ? ile + ' ' +
          plural(ile, 'wymaganie', 'wymagania', 'wymagań') : 'nic');
        cela.appendChild(tip);
        s.appendChild(cela);
        var mkey = data.getFullYear() + '-' + data.getMonth();
        if (d === 0 && !miesiace[mkey]) { miesiace[mkey] = true;
          var m = svg('text', { x: t * (CELA + ODSTEP), y: 9, class: 'hm-miesiac' });
          m.textContent = data.toLocaleDateString('pl-PL', { month: 'short' });
          s.appendChild(m);
        }
      }
    }
    blok.appendChild(s);

    var leg = el('div', 'hm-legenda');
    leg.appendChild(el('span', null, 'mniej'));
    [0, 1, 2, 3].forEach(function (p) { leg.appendChild(el('span', 'hm-probka poziom-' + p)); });
    leg.appendChild(el('span', null, 'więcej'));
    blok.appendChild(leg);
    return blok;
  }

  function renderUstna() {
    var wrap = el('div', 'ustna');
    var wszystkie = wszystkiePytania();
    var opracowane = wszystkie.filter(function (q) { return (state.pytania[q.nr] || 0) === 2; }).length;
    var zNotatka = wszystkie.filter(function (q) { return maNotatke(q.nr); }).length;

    wrap.appendChild(el('div', 'lektury-hint', opracowane + '/' + wszystkie.length +
      ' pytań opracowanych · ' + zNotatka + ' z notatką · losowanie omija te już opracowane'));

    var akcje = el('div', 'ustna-akcje');
    akcje.appendChild(btn('today-btn is-primary', state.ustnaNr ? 'Wylosuj inne' : 'Wylosuj pytanie', losujPytanie));
    wrap.appendChild(akcje);

    var q = pytanieNr(state.ustnaNr);
    if (!q) {
      wrap.appendChild(el('div', 'today-empty',
        'Wylosuj pytanie, a planer odmierzy ' + PRZYGOTOWANIE_MIN + ' minut na przygotowanie i ' +
        WYPOWIEDZ_MIN + ' minut wypowiedzi — jak na prawdziwej ustnej.'));
      return wrap;
    }

    var karta = el('div', 'ustna-karta');
    karta.appendChild(el('div', 'ustna-lektura', q.lektura));
    var temat = el('div', 'ustna-temat');
    temat.appendChild(el('span', 'pyt-nr', q.nr + '.'));
    temat.appendChild(document.createTextNode(' ' + q.temat));
    karta.appendChild(temat);
    karta.appendChild(el('div', 'ustna-zrodlo', q.zrodlo));
    wrap.appendChild(karta);

    // — timer —
    var box = el('div', 'ustna-timer');
    var faza = el('div', 'ustna-faza');
    faza.id = 'ustna-faza';
    faza.textContent = fazaLabel();
    box.appendChild(faza);
    var zegar = el('div', 'ustna-zegar');
    zegar.id = 'ustna-zegar';
    zegar.textContent = zegarTekst();
    box.appendChild(zegar);

    var sterowanie = el('div', 'ustna-sterowanie');
    sterowanie.appendChild(btn('today-btn' + (timer.faza === 'przygotowanie' ? ' is-primary' : ''),
      'Przygotowanie ' + PRZYGOTOWANIE_MIN + ' min', function () { startFazy('przygotowanie'); }));
    sterowanie.appendChild(btn('today-btn' + (timer.faza === 'wypowiedz' ? ' is-primary' : ''),
      'Wypowiedź ' + WYPOWIEDZ_MIN + ' min', function () { startFazy('wypowiedz'); }));
    if (timer.faza !== 'idle') sterowanie.appendChild(btn('today-btn', 'Zatrzymaj', stopTimera));
    box.appendChild(sterowanie);
    wrap.appendChild(box);

    // — samoocena —
    var ocena = el('div', 'ustna-ocena');
    ocena.appendChild(el('span', 'today-block-label', 'Jak poszło?'));
    var przyciski = el('div', 'today-actions');
    przyciski.appendChild(btn('today-btn is-primary', 'poszło', function () {
      state.pytania[q.nr] = 2; timer.faza = 'idle'; save(); render();
    }));
    przyciski.appendChild(btn('today-btn', 'do poprawki', function () {
      state.pytania[q.nr] = 1; timer.faza = 'idle'; save(); render();
    }));
    ocena.appendChild(przyciski);
    wrap.appendChild(ocena);

    // — notatka —
    var notatka = el('div', 'ustna-notatka');
    notatka.appendChild(el('div', 'today-block-label', 'Plan wypowiedzi'));
    NOTATKA_POLA.forEach(function (f) {
      var pole = el('div', 'nota-pole');
      var lab = el('label', 'nota-label', f.label);
      lab.htmlFor = 'nota-' + f.id;
      pole.appendChild(lab);
      var ta = el('textarea', 'nota-input');
      ta.id = 'nota-' + f.id;
      ta.rows = f.id === 'argumenty' ? 4 : 2;
      ta.value = (state.notatki[q.nr] && state.notatki[q.nr][f.id]) || '';
      ta.addEventListener('input', function () { zapiszNotatke(q.nr, f.id, ta.value); });
      pole.appendChild(ta);
      notatka.appendChild(pole);
    });
    wrap.appendChild(notatka);
    return wrap;
  }

  function fazaLabel() {
    return timer.faza === 'przygotowanie' ? 'Przygotowanie'
      : timer.faza === 'wypowiedz' ? 'Wypowiedź'
      : timer.faza === 'koniec' ? 'Czas minął'
      : 'Gotowy do startu';
  }
  function zegarTekst() {
    if (timer.faza === 'idle') return pad(PRZYGOTOWANIE_MIN) + ':00';
    var left = Math.max(0, timer.koniec - Date.now());
    return pad(Math.floor(left / 60000)) + ':' + pad(Math.floor(left / 1000) % 60);
  }
  function tickUstna() {
    var zegar = document.getElementById('ustna-zegar');
    if (!zegar) return;
    if (timer.faza === 'przygotowanie' || timer.faza === 'wypowiedz') {
      if (Date.now() >= timer.koniec) {
        // po przygotowaniu automatycznie startuje wypowiedź, jak na egzaminie
        if (timer.faza === 'przygotowanie') {
          timer.faza = 'wypowiedz';
          timer.koniec = Date.now() + WYPOWIEDZ_MIN * 60000;
        } else {
          timer.faza = 'koniec';
        }
      }
    }
    zegar.textContent = zegarTekst();
    var faza = document.getElementById('ustna-faza');
    if (faza) faza.textContent = fazaLabel();
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

  $('theme-btn').addEventListener('click', cycleTheme);

  // — most dla warstwy logowania (js/sync.js) ————————————————————————
  window.PLANER_APP = {
    stan: zapisywanyStan,
    wczytaj: function (nowy) {
      POLA_ZAPISU.forEach(function (k) { if (nowy[k] !== undefined) state[k] = nowy[k]; });
      if (!META[state.active]) state.active = 'bio';
      backfillReviews();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(zapisywanyStan())); } catch (e) {}
      applyTheme();
      render();
    },
    odswiez: render
  };

  // — start ————————————————————————————————————————————————————————
  backfillReviews();
  applyTheme();
  save();
  render();
  tick();
  setInterval(tick, 1000);
})();
