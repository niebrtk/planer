# Planer maturalny

Interaktywny planer nauki do matury: odliczanie, postęp z podstawy programowej i lista lektur.
Zbudowany z projektu przygotowanego w Claude Design.
Zwykły HTML + CSS + JS — bez frameworka, bez instalacji, bez kroku budowania.

## Uruchomienie

Otwórz `index.html` w przeglądarce (działa też przez `file://`, po prostu dwuklik).
Ewentualnie lokalny serwer, np. `npx http-server .`

## Co jest w środku

| Plik | Zawartość |
| --- | --- |
| `index.html` | szkielet strony (nagłówek, odliczanie, statystyki, panel przedmiotu) |
| `styles/ds.css` | system projektowy „Industry" — tokeny, typografia (Barlow / Barlow Condensed) |
| `styles/app.css` | paleta planera (ciepła, papierowa) i style wszystkich elementów |
| `js/data-dzialy.js` | działy i wymagania: biologia PR (18 działów, 214 wymagań), chemia PR (22 / 173) |
| `js/data-listy.js` | przedmioty, listy tematyczne polskiego i matematyki, 34 lektury obowiązkowe |
| `js/data-pytania.js` | 75 pytań jawnych na maturę ustną, przypisanych do tytułów lektur |
| `js/app.js` | stan, odliczanie, renderowanie, zapis postępu |
| `js/sync-config.js` | adres i klucz projektu Supabase (puste = planer działa lokalnie) |
| `js/sync.js` | logowanie GitHub/Google i synchronizacja postępu |

## Jak używać

- **Zakładki przedmiotów** — biologia PR, chemia PR, polski PP, matematyka PR; przy każdej procent postępu.
- **Działy** — kliknięcie rozwija dział; każde wymaganie klika się cyklicznie:
  do nauki → w trakcie → opanowane. „W trakcie" liczy się jako pół punktu w procentach.
- **Arkusze** — licznik rozwiązanych arkuszy, osobno dla każdego przedmiotu.
- **Lektury** (tylko polski) — nieprzeczytane → w trakcie czytania → przeczytane → omówione.
  Przy lekturze, która ma pytania jawne na maturę ustną, po prawej jest licznik `0/3 pyt.`
  — rozwija listę pytań. Każde pytanie ma własny status: do opracowania → w trakcie → opracowane.
  Razem 75 pytań przy 28 lekturach (pozostałe 6 pozycji pytań jawnych nie ma).

### Sekcja „Dziś"

- **Powtórki w odstępach** — wymaganie oznaczone jako opanowane wraca do powtórki po 1, 3, 7, 14
  i 30 dniach. „Umiem" przesuwa je na kolejny odstęp, „jeszcze nie" cofa do statusu *w trakcie*.
- **Na dziś** — kontynuacja materiału: z każdego przedmiotu pierwsze nieopanowane wymaganie
  leżące za ostatnim opanowanym, w kolejności z podstawy programowej, z nazwą działu nad treścią.
  Nic jeszcze nie opanowane — lista zaczyna od pierwszego wymagania. Gdy za ostatnim opanowanym
  nic nie zostało, wracają pominięte luki. Kliknięcie treści przenosi do wymagania w dziale.
- **Tempo** — ile wymagań dziennie trzeba opanować, żeby zdążyć do matury, i jak wypada
  średnia z ostatnich 7 dni.
- **Cel tygodnia** liczy się sam z wymaganego tempa (tempo × 7), obok seria dni i kamienie milowe.

### Ustna

Zakładka **Ustna** przy języku polskim: losujesz pytanie (losowanie omija te już opracowane),
planer odmierza 15 minut przygotowania i automatycznie przechodzi w 10 minut wypowiedzi.
Po wszystkim oceniasz się sam — *poszło* ustawia pytanie na opracowane, *do poprawki* na w trakcie.
Pod spodem plan wypowiedzi w czterech polach (teza, argumenty z lektury, kontekst, wniosek),
zapisywany na bieżąco; pytanie z notatką dostaje znacznik w zakładce Lektury.

### Historia

Na dole strony wykres skumulowanego postępu z przerywaną linią wymaganego tempa
(najedź, żeby zobaczyć konkretny dzień; „pokaż liczby" rozwija tabelę) oraz kalendarz
nauki z ostatnich 18 tygodni — jeden odcień, więcej wymagań = ciemniej (w ciemnym motywie: jaśniej).

### Motyw

Motyw przełącza przycisk w nagłówku: auto (ustawienie systemu) → jasny → ciemny.

## Ustawienia

Na górze `js/app.js`:

```js
var EXAM_DATE = '2027-05-04';   // dzień matury
var EXAM_TIME = '09:00:00';     // godzina rozpoczęcia
var ARKUSZE_GOAL = 15;          // cel arkuszy na przedmiot
```

## Zapis postępu

Wszystko siedzi w `localStorage` przeglądarki pod kluczem `matura-planner-v1`
(zaznaczenia, arkusze, lektury, pytania ustne, notatki do wypowiedzi, terminy powtórek,
dzienny licznik opanowanych wymagań, motyw i ostatnio otwarta zakładka). Dane nie wychodzą nigdzie poza
Twój komputer — ale też nie przenoszą się między przeglądarkami ani urządzeniami,
a wyczyszczenie danych witryny je kasuje.

## Logowanie i synchronizacja

Dopóki `js/sync-config.js` jest pusty, planer działa wyłącznie lokalnie i w nagłówku
nie ma nic o koncie. Po skonfigurowaniu pojawia się przycisk **Zaloguj** (GitHub / Google),
a postęp wędruje między telefonem a komputerem.

### Co trzeba zrobić raz

1. **Supabase** — załóż darmowy projekt na [supabase.com](https://supabase.com).
2. **Tabela na postęp** — w SQL Editor uruchom:

   ```sql
   create table if not exists public.planer_postep (
     user_id uuid primary key references auth.users on delete cascade,
     dane jsonb not null,
     zmieniono timestamptz not null default now()
   );
   alter table public.planer_postep enable row level security;
   create policy "wlasny odczyt"      on public.planer_postep for select using (auth.uid() = user_id);
   create policy "wlasny zapis"       on public.planer_postep for insert with check (auth.uid() = user_id);
   create policy "wlasna aktualizacja" on public.planer_postep for update
     using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

   RLS sprawia, że każdy widzi wyłącznie swój wiersz.

3. **GitHub jako sposób logowania** — na GitHubie: Settings → Developer settings →
   OAuth Apps → New OAuth App. Homepage: `https://niebrtk.github.io/planer/`,
   Authorization callback URL: `https://<twój-projekt>.supabase.co/auth/v1/callback`.
   Client ID i wygenerowany secret wklej w Supabase → Authentication → Providers → GitHub.
4. **Google** — Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID
   (typ: Web application), Authorized redirect URI ten sam `…/auth/v1/callback`.
   Client ID i secret wklej w Supabase → Authentication → Providers → Google.
5. **Adresy powrotu** — Supabase → Authentication → URL Configuration:
   Site URL `https://niebrtk.github.io/planer/`, a w Redirect URLs dorzuć ten sam adres
   (i `http://localhost:8080/` jeśli testujesz lokalnie).
6. **Klucze do planera** — Supabase → Project Settings → API: skopiuj *Project URL*
   i klucz *anon public* do `js/sync-config.js`, zacommituj i wypchnij.

Klucz `anon` jest publiczny z założenia i może leżeć w repozytorium — dostępu pilnuje RLS.
Klucza `service_role` **nigdy** tu nie wklejaj.

### Jak działa scalanie

Przy logowaniu planer nie nadpisuje niczego w ciemno, tylko scala stan lokalny ze zdalnym:
przy każdym wymaganiu, lekturze, pytaniu i liczniku arkuszy wygrywa dalej posunięta wartość,
przy powtórkach dalszy termin, w notatkach dłuższy tekst (pole po polu), a ustawienia
(motyw, ostatnia zakładka) bierze z nowszej strony. Potem każdy zapis leci do chmury
z dwusekundowym opóźnieniem, żeby nie strzelać przy każdym kliknięciu.

## Dane z podstawy programowej

`js/data-dzialy.js` powstało z wyciągu z PDF-ów podstawy programowej 2027 dla biologii i chemii. Poprawiono w nim 9 śmieci po ekstrakcji z PDF — numery stron
i przypisów, które wpadły w środek zdań (np. „właściwości fizyczne i 1 chemiczne").
