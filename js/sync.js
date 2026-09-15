// Logowanie (GitHub, Google) i synchronizacja postępu przez Supabase.
// Bez konfiguracji w js/sync-config.js moduł nie robi nic — planer zostaje lokalny.

const CFG = window.PLANER_SYNC_CONFIG || {};
const TABELA = 'planer_postep';
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ——— scalanie stanów ———
// Zasada: nigdy nie gubimy postępu. Przy konflikcie wygrywa dalej posunięta wartość,
// a pola „ustawieniowe" bierzemy z nowszej strony.
export function polacz(lokalny, zdalny, lokalnyNowszy) {
  if (!zdalny) return lokalny;
  if (!lokalny) return zdalny;
  const out = {};
  const maxMapa = (a = {}, b = {}) => {
    const o = { ...a };
    Object.keys(b).forEach(k => { o[k] = Math.max(a[k] || 0, b[k] || 0); });
    return o;
  };
  out.marks = maxMapa(lokalny.marks, zdalny.marks);
  out.lektury = maxMapa(lokalny.lektury, zdalny.lektury);
  out.pytania = maxMapa(lokalny.pytania, zdalny.pytania);
  out.arkusze = maxMapa(lokalny.arkusze, zdalny.arkusze);
  out.log = maxMapa(lokalny.log, zdalny.log);

  // powtórki: dalszy termin = wyższy poziom powtórki
  out.rep = { ...(zdalny.rep || {}) };
  Object.entries(lokalny.rep || {}).forEach(([k, r]) => {
    const z = out.rep[k];
    if (!z || (r && r.d > z.d)) out.rep[k] = r;
  });

  // notatki: pole po polu, dłuższy tekst wygrywa (krótszy bywa niedokończony)
  out.notatki = { ...(zdalny.notatki || {}) };
  Object.entries(lokalny.notatki || {}).forEach(([nr, n]) => {
    const z = out.notatki[nr] || {};
    const scalone = { ...z };
    Object.entries(n || {}).forEach(([pole, tekst]) => {
      if ((tekst || '').length >= (z[pole] || '').length) scalone[pole] = tekst;
    });
    out.notatki[nr] = scalone;
  });

  const nowszy = lokalnyNowszy ? lokalny : zdalny;
  ['active', 'tab', 'theme', 'ustnaNr'].forEach(k => {
    out[k] = nowszy[k] !== undefined ? nowszy[k] : lokalny[k];
  });
  return out;
}

// ——— UI konta w nagłówku ———
const host = document.getElementById('konto');
const stan = { klient: null, uzytkownik: null, komunikat: '', menu: false };
let stosowanie = false, czasomierz = null;

function przycisk(tekst, onClick, klasa) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = klasa || 'tool-btn';
  b.textContent = tekst;
  b.addEventListener('click', onClick);
  return b;
}

function rysuj() {
  if (!host) return;
  host.textContent = '';
  if (!stan.klient) return;

  if (stan.uzytkownik) {
    const etykieta = stan.uzytkownik.email || 'zalogowany';
    const info = document.createElement('span');
    info.className = 'konto-info';
    info.textContent = stan.komunikat || etykieta;
    info.title = etykieta;
    host.appendChild(info);
    host.appendChild(przycisk('Wyloguj', wyloguj));
    return;
  }

  host.appendChild(przycisk(stan.menu ? 'Zaloguj ×' : 'Zaloguj', () => { stan.menu = !stan.menu; rysuj(); }));
  if (stan.menu) {
    const menu = document.createElement('span');
    menu.className = 'konto-menu';
    menu.appendChild(przycisk('GitHub', () => zaloguj('github')));
    menu.appendChild(przycisk('Google', () => zaloguj('google')));
    host.appendChild(menu);
  }
  if (stan.komunikat) {
    const info = document.createElement('span');
    info.className = 'konto-info';
    info.textContent = stan.komunikat;
    host.appendChild(info);
  }
}

function komunikat(tekst) { stan.komunikat = tekst; rysuj(); }

async function zaloguj(provider) {
  komunikat('przekierowanie…');
  const { error } = await stan.klient.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.href.split('#')[0] }
  });
  if (error) komunikat('błąd logowania');
}

async function wyloguj() {
  await stan.klient.auth.signOut();
  stan.uzytkownik = null;
  komunikat('');
}

// ——— synchronizacja ———
async function pobierzIScal() {
  const lokalny = window.PLANER_APP.stan();
  const { data, error } = await stan.klient
    .from(TABELA).select('dane, zmieniono').eq('user_id', stan.uzytkownik.id).maybeSingle();
  if (error) { komunikat('błąd odczytu'); return; }

  const zdalny = data && data.dane;
  const lokalnyNowszy = !data || !data.zmieniono ||
    Number(localStorage.getItem('matura-planner-zmieniono') || 0) > Date.parse(data.zmieniono);
  const scalony = polacz(lokalny, zdalny, lokalnyNowszy);

  stosowanie = true;
  window.PLANER_APP.wczytaj(scalony);
  stosowanie = false;
  await wyslij(scalony);
}

async function wyslij(dane) {
  const { error } = await stan.klient.from(TABELA)
    .upsert({ user_id: stan.uzytkownik.id, dane, zmieniono: new Date().toISOString() });
  komunikat(error ? 'błąd zapisu' : 'zapisano ' +
    new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
}

// wołane z app.js przy każdym zapisie — wysyłkę zbieramy w paczki
window.PLANER_SYNC = {
  zapisz() {
    try { localStorage.setItem('matura-planner-zmieniono', String(Date.now())); } catch (e) {}
    if (!stan.klient || !stan.uzytkownik || stosowanie) return;
    clearTimeout(czasomierz);
    czasomierz = setTimeout(() => wyslij(window.PLANER_APP.stan()), 2000);
  }
};

// ——— start ———
if (CFG.url && CFG.anonKey) {
  try {
    const { createClient } = await import(CDN);
    stan.klient = createClient(CFG.url, CFG.anonKey);
    rysuj();
    stan.klient.auth.onAuthStateChange(async (_zdarzenie, sesja) => {
      const bylZalogowany = !!stan.uzytkownik;
      stan.uzytkownik = sesja ? sesja.user : null;
      stan.menu = false;
      rysuj();
      if (stan.uzytkownik && !bylZalogowany) {
        komunikat('synchronizacja…');
        await pobierzIScal();
      }
    });
    const { data } = await stan.klient.auth.getSession();
    if (data.session) {
      stan.uzytkownik = data.session.user;
      rysuj();
      await pobierzIScal();
    }
  } catch (e) {
    console.warn('Synchronizacja niedostępna:', e);
  }
}
