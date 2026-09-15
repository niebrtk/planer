/* Planer maturalny — logika strony.
   Bez frameworka i bez kroku budowania: dane z js/data-*.js, stan w localStorage. */
(function () {
  'use strict';

  // — konfiguracja ————————————————————————————————————————————————
  var EXAM_DATE = '2027-05-04';   // dzień matury (pierwszy egzamin)
  var EXAM_TIME = '09:00:00';     // godzina rozpoczęcia
  var ARKUSZE_GOAL = 15;          // cel arkuszy na przedmiot
  var STORE_KEY = 'matura-planner-v1';

  var META = window.PLANER_PRZEDMIOTY;
  var IDS = window.PLANER_KOLEJNOSC;
  var DZIALY = window.PLANER_DZIALY;
  var LISTY = window.PLANER_LISTY;
  var LEKTURY = window.PLANER_LEKTURY;
  var LEK_LABELS = ['Nieprzeczytane', 'W trakcie czytania', 'Przeczytane', 'Omówione'];

  // — stan ————————————————————————————————————————————————————————
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) {}

  var state = {
    active: META[saved.active] ? saved.active : 'bio',
    tab: saved.tab || 'dzialy',
    marks: saved.marks || {},      // 'sid|si|gi|pi' -> 0 do nauki / 1 w trakcie / 2 opanowane
    arkusze: saved.arkusze || {},  // sid -> liczba rozwiązanych arkuszy
    lektury: saved.lektury || {},  // 'grp|tytuł' -> 0..3
    open: {}                       // 'sid|si' -> czy dział rozwinięty
  };

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        active: state.active, tab: state.tab, marks: state.marks,
        arkusze: state.arkusze, lektury: state.lektury
      }));
    } catch (e) { /* tryb prywatny / brak miejsca — planer działa dalej, bez zapisu */ }
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
    return { done: done, total: total, pct: total ? Math.round(100 * score / (total * 2)) : 0 };
  }

  // — akcje ————————————————————————————————————————————————————————
  function cycleMark(key) {
    state.marks[key] = ((state.marks[key] || 0) + 1) % 3;
    save(); render();
  }
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
    var k = sid + '|' + si;
    state.open[k] = !state.open[k];
    render();
  }

  // — pomocniki DOM ————————————————————————————————————————————————
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // — odliczanie ————————————————————————————————————————————————————
  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    var target = new Date(EXAM_DATE + 'T' + EXAM_TIME);
    var diff = Math.max(0, target - new Date());
    $('days').textContent = Math.floor(diff / 86400000);
    $('hours').textContent = pad(Math.floor(diff / 3600000) % 24);
    $('minutes').textContent = pad(Math.floor(diff / 60000) % 60);
    $('seconds').textContent = pad(Math.floor(diff / 1000) % 60);
  }

  // — render ————————————————————————————————————————————————————————
  function render() {
    var act = state.active;
    var meta = META[act];
    var counts = {};
    var sumDone = 0, sumTotal = 0, totalArkusze = 0;

    IDS.forEach(function (id) {
      counts[id] = countSubject(id);
      sumDone += counts[id].done;
      sumTotal += counts[id].total;
      totalArkusze += state.arkusze[id] || 0;
    });
    var overallPct = sumTotal
      ? Math.round(100 * IDS.reduce(function (a, id) { return a + counts[id].pct * counts[id].total; }, 0) / sumTotal)
      : 0;

    document.documentElement.style.setProperty('--subject-color', meta.color);
    document.documentElement.style.setProperty('--subject-tint', meta.tint);

    $('exam-year').textContent = EXAM_DATE.slice(0, 4);
    $('overall-pct').textContent = overallPct + '%';
    $('done-total').textContent = sumDone;
    $('arkusze-total').textContent = totalArkusze + ' / ' + (ARKUSZE_GOAL * IDS.length);

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

  function renderSubjectTabs(counts) {
    var nav = $('subjects');
    clear(nav);
    IDS.forEach(function (id) {
      var m = META[id];
      var active = id === state.active;
      var b = el('button', 'subject-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.style.setProperty('--c', m.color);
      b.style.setProperty('--tint', m.tint);
      b.appendChild(document.createTextNode(m.name + ' ' + m.level));
      b.appendChild(el('span', 'subject-tab-pct', counts[id].pct + '%'));
      b.addEventListener('click', function () { setSubject(id); });
      nav.appendChild(b);
    });
  }

  function renderSubtabs(tabs) {
    var wrap = $('subtabs');
    clear(wrap);
    tabs.forEach(function (t) {
      var b = el('button', 'subtab', t.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', state.tab === t.id ? 'true' : 'false');
      b.addEventListener('click', function () { setTab(t.id); });
      wrap.appendChild(b);
    });
  }

  function renderSections(act) {
    var frag = document.createDocumentFragment();
    var list = el('div', 'sections');
    var data = sectionsFor(act);

    data.forEach(function (sec, si) {
      var open = !!state.open[act + '|' + si];
      var sDone = 0, sTotal = 0;
      sec.groups.forEach(function (g, gi) {
        g.points.forEach(function (_, pi) {
          sTotal++;
          if ((state.marks[markKey(act, si, gi, pi)] || 0) === 2) sDone++;
        });
      });

      var box = el('div', 'section');
      var head = el('button', 'section-head');
      head.type = 'button';
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      head.appendChild(el('span', 'section-num', sec.num));
      head.appendChild(el('span', 'section-title', sec.title));
      head.appendChild(el('span', 'section-count' + (sTotal && sDone === sTotal ? ' is-complete' : ''),
        sDone + '/' + sTotal));
      head.appendChild(el('span', 'section-caret', open ? '–' : '+'));
      head.addEventListener('click', function () { toggleSection(act, si); });
      box.appendChild(head);

      if (open) box.appendChild(renderSectionBody(act, si, sec));
      list.appendChild(box);
    });

    frag.appendChild(list);
    frag.appendChild(el('div', 'hint',
      'Rozwiń dział, aby zaznaczać pojedyncze wymagania: do nauki → w trakcie → opanowane.'));
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
        var row = el('button', 'point');
        row.type = 'button';
        row.setAttribute('aria-pressed', v === 2 ? 'true' : 'false');
        row.appendChild(el('span', 'point-box' + (v === 2 ? ' is-done' : v === 1 ? ' is-progress' : ''),
          v === 2 ? '✓' : v === 1 ? '·' : ''));
        row.appendChild(el('span', 'point-text' + (v === 2 ? ' is-done' : ''), text));
        row.addEventListener('click', function () { cycleMark(key); });
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
        var row = el('button', 'lek-row');
        row.type = 'button';
        row.appendChild(el('span', 'lek-box' + cls, v === 3 ? '★' : v === 2 ? '✓' : v === 1 ? '·' : ''));
        row.appendChild(el('span', 'lek-name' + (v >= 2 ? ' is-done' : ''), title));
        row.appendChild(el('span', 'lek-tag' + cls, LEK_LABELS[v]));
        row.addEventListener('click', function () { cycleLektura(key); });
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
    var minus = el('button', 'ark-btn', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'odejmij arkusz');
    minus.addEventListener('click', function () { bumpArk(-1); });

    var count = el('span', 'ark-count',
      (state.arkusze[state.active] || 0) + ' / ' + ARKUSZE_GOAL);

    var plus = el('button', 'ark-btn is-primary', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'dodaj arkusz');
    plus.addEventListener('click', function () { bumpArk(1); });

    ctrl.appendChild(minus); ctrl.appendChild(count); ctrl.appendChild(plus);
    row.appendChild(ctrl);
    return row;
  }

  // — start ————————————————————————————————————————————————————————
  render();
  tick();
  setInterval(tick, 1000);
})();
