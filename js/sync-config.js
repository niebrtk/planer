// Logowanie i synchronizacja postępu między urządzeniami — konfiguracja.
//
// Dopóki oba pola są puste, planer działa jak dotąd: postęp siedzi tylko
// w tej przeglądarce, a w nagłówku nie ma nic o koncie.
//
// Żeby włączyć logowanie przez GitHuba i Google, załóż darmowy projekt
// w Supabase i wklej tutaj jego adres oraz klucz „anon public"
// (Project Settings → API). Krok po kroku: patrz README.md, sekcja „Logowanie".
//
// Klucz „anon" jest publiczny z założenia — może leżeć w repozytorium.
// Dostępu do cudzych danych pilnuje RLS po stronie bazy. Nigdy nie wklejaj
// tu klucza „service_role".
window.PLANER_SYNC_CONFIG = {
  url: '',
  anonKey: ''
};
