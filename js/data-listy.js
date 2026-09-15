// Przedmioty, listy tematyczne (polski, matematyka) oraz lista lektur obowiązkowych.

window.PLANER_PRZEDMIOTY = {
  bio:  { name: 'Biologia',      level: 'PR', color: '#5c7d55', tint: '#eaf0e6' },
  chem: { name: 'Chemia',        level: 'PR', color: '#4f7793', tint: '#e7eef3' },
  pol:  { name: 'Język polski',  level: 'PP', color: '#9c6248', tint: '#f4e9e2' },
  mat:  { name: 'Matematyka',    level: 'PR', color: '#a5822f', tint: '#f4ecdb' }
};

// Kolejność zakładek.
window.PLANER_KOLEJNOSC = ['bio', 'chem', 'pol', 'mat'];

// Przedmioty bez rozpiski z podstawy programowej — listy tematyczne.
// Każda grupa staje się osobnym działem (label === tytuł działu).
window.PLANER_LISTY = {
  pol: [
    { label: null, points: [
      'Biblia, antyk, mitologia — konteksty',
      'Średniowiecze',
      'Renesans i barok',
      'Oświecenie',
      'Romantyzm',
      'Pozytywizm',
      'Młoda Polska',
      'Dwudziestolecie międzywojenne',
      'Literatura wojny i okupacji',
      'Współczesność',
      'Środki stylistyczne i teoria literatury',
      'Wypracowanie — schemat i wprawki',
      'Test językowy — czytanie ze zrozumieniem',
      'Retoryka i erystyka',
      'Gramatyka i poprawność językowa'
    ] }
  ],
  mat: [
    { label: 'Algebra', points: [
      'Liczby rzeczywiste, potęgi i logarytmy',
      'Wyrażenia algebraiczne i wzory skróconego mnożenia',
      'Równania i nierówności (także z parametrem)',
      'Wielomiany',
      'Funkcje wymierne',
      'Wartość bezwzględna'
    ] },
    { label: 'Funkcje i ciągi', points: [
      'Własności funkcji, przekształcenia wykresów',
      'Funkcja liniowa i kwadratowa',
      'Funkcja wykładnicza i logarytmiczna',
      'Ciągi arytmetyczne i geometryczne',
      'Granica ciągu i funkcji'
    ] },
    { label: 'Geometria', points: [
      'Planimetria — trójkąty i okręgi',
      'Twierdzenia o kątach i podobieństwie',
      'Trygonometria i tożsamości',
      'Geometria analityczna na płaszczyźnie',
      'Stereometria — bryły i przekroje',
      'Wektory'
    ] },
    { label: 'Analiza i rachunek prawdopodobieństwa', points: [
      'Rachunek różniczkowy — pochodna',
      'Badanie funkcji i optymalizacja',
      'Kombinatoryka',
      'Prawdopodobieństwo warunkowe i całkowite',
      'Statystyka opisowa'
    ] }
  ]
};

// Lektury obowiązkowe — podstawa programowa 2024.
window.PLANER_LEKTURY = [
  { group: 'Zakres podstawowy', items: [
    'Biblia — Ks. Rodzaju, Hioba, Koheleta, Psalmów, Apokalipsa św. Jana (fragmenty)',
    'Jan Parandowski, Mitologia, cz. I Grecja',
    'Homer, Iliada (fragmenty)',
    'Sofokles, Antygona',
    'Lament świętokrzyski (fragmenty)',
    'Rozmowa Mistrza Polikarpa ze Śmiercią (fragmenty)',
    'Pieśń o Rolandzie (fragmenty)',
    'William Szekspir, Makbet',
    'Molier, Skąpiec',
    'Ignacy Krasicki, wybrana satyra',
    'Adam Mickiewicz, wybrane ballady, w tym Romantyczność',
    'Adam Mickiewicz, Dziady cz. III',
    'Bolesław Prus, Lalka',
    'Henryk Sienkiewicz, Potop (fragmenty)',
    'Fiodor Dostojewski, Zbrodnia i kara',
    'Stanisław Wyspiański, Wesele',
    'Władysław Stanisław Reymont, Chłopi (fragmenty)',
    'Stefan Żeromski, Przedwiośnie',
    'Witold Gombrowicz, Ferdydurke (fragmenty)',
    'Tadeusz Borowski, Proszę państwa do gazu',
    'Gustaw Herling-Grudziński, Inny świat (fragmenty)',
    'Hanna Krall, Zdążyć przed Panem Bogiem',
    'Albert Camus, Dżuma',
    'George Orwell, Rok 1984',
    'Sławomir Mrożek, Tango',
    'Marek Nowakowski, Górą „Edek” (Prawo prerii)',
    'Andrzej Stasiuk, Miejsce (Opowieści galicyjskie)',
    'Olga Tokarczuk, Profesor Andrews w Warszawie (Gra na wielu bębenkach)',
    'Ryszard Kapuściński, Podróże z Herodotem (fragmenty)'
  ] },
  { group: 'Z zakresu szkoły podstawowej', items: [
    'Ignacy Krasicki, bajki',
    'Adam Mickiewicz, Dziady cz. II',
    'Adam Mickiewicz, Pan Tadeusz (ks. I, II, IV, X, XI, XII)',
    'Aleksander Fredro, Zemsta',
    'Juliusz Słowacki, Balladyna'
  ] }
];
