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
| `js/app.js` | stan, odliczanie, renderowanie, zapis postępu |

## Jak używać

- **Zakładki przedmiotów** — biologia PR, chemia PR, polski PP, matematyka PR; przy każdej procent postępu.
- **Działy** — kliknięcie rozwija dział; każde wymaganie klika się cyklicznie:
  do nauki → w trakcie → opanowane. „W trakcie" liczy się jako pół punktu w procentach.
- **Arkusze** — licznik rozwiązanych arkuszy, osobno dla każdego przedmiotu.
- **Lektury** (tylko polski) — nieprzeczytane → w trakcie czytania → przeczytane → omówione.

### Sekcja „Dziś"

- **Powtórki w odstępach** — wymaganie oznaczone jako opanowane wraca do powtórki po 1, 3, 7, 14
  i 30 dniach. „Umiem" przesuwa je na kolejny odstęp, „jeszcze nie" cofa do statusu *w trakcie*.
- **Na dziś** — chronologicznie: z każdego przedmiotu pierwsze nieopanowane wymaganie
  w kolejności z podstawy programowej (dział I, II, III… i punkty po kolei), z nazwą działu
  nad treścią. Wymaganie ze statusem *w trakcie* wraca samo, bo leży wcześniej w kolejności.
  Kliknięcie treści przenosi do tego wymagania w dziale.
- **Tempo** — ile wymagań dziennie trzeba opanować, żeby zdążyć do matury, i jak wypada
  średnia z ostatnich 7 dni.
- **Cel tygodnia** liczy się sam z wymaganego tempa (tempo × 7), obok seria dni i kamienie milowe.

### Motyw i skróty

Motyw przełącza przycisk w nagłówku albo <kbd>t</kbd>: auto (ustawienie systemu) → jasny → ciemny.

| Klawisz | Działanie |
| --- | --- |
| `1` `2` `3` `4` | biologia, chemia, polski, matematyka |
| `d` `a` `l` | działy, arkusze, lektury |
| `j` `k` | następny / poprzedni wiersz |
| `spacja` | zmiana statusu zaznaczonego wiersza |
| `o` | rozwiń lub zwiń wszystkie działy |
| `t` | zmiana motywu |
| `?` | okno ze skrótami (`Esc` zamyka) |

## Ustawienia

Na górze `js/app.js`:

```js
var EXAM_DATE = '2027-05-04';   // dzień matury
var EXAM_TIME = '09:00:00';     // godzina rozpoczęcia
var ARKUSZE_GOAL = 15;          // cel arkuszy na przedmiot
```

## Zapis postępu

Wszystko siedzi w `localStorage` przeglądarki pod kluczem `matura-planner-v1`
(zaznaczenia, arkusze, lektury, terminy powtórek, dzienny licznik opanowanych wymagań,
motyw i ostatnio otwarta zakładka). Dane nie wychodzą nigdzie poza
Twój komputer — ale też nie przenoszą się między przeglądarkami ani urządzeniami,
a wyczyszczenie danych witryny je kasuje.

## Dane z podstawy programowej

`js/data-dzialy.js` powstało z wyciągu z PDF-ów podstawy programowej 2027 dla biologii i chemii. Poprawiono w nim 9 śmieci po ekstrakcji z PDF — numery stron
i przypisów, które wpadły w środek zdań (np. „właściwości fizyczne i 1 chemiczne").
