# estools-app-cleanpasta - zasady pracy

ES Tools Cleanpasta jako apka macOS w pasku menu + CLI `cleanpasta` + skill AI. Plan i decyzje: `docs/plan.md` (statusy faz aktualizujemy tam).

- Marka **ES Tools by Eryk Sadowski** (`~/Development/estools-docs/brand/BRAND.md (standardy produktów: estools-docs/docs/standards.md)`): zero Profitway, zero emoji, tylko krótki myślnik "-" i proste cudzysłowy " i '. Interfejs, README, CHANGELOG i komentarze po angielsku; `docs/instalacja.md`, ten plik i rozmowa z Erykiem po polsku.
- Logika czyszczenia: `converter/src/convert.ts` (TypeScript, pnpm, Node 24; testy jednostkowe i testy wklejania do WebKit w `converter/tests`, lab w `converter/lab`), bundlowana do `Resources/convert.js` (`scripts/build-converter.sh`) i uruchamiana w JavaScriptCore. Zmiana zachowania = zmiana i testy w `converter/`, potem `scripts/build-converter.sh` i `scripts/test.sh`. Przeniesione z `estools-plugin-raycast-clean-paste` (zarchiwizowane) 15.10.2026.
- Listy: numerowane punkty wklejamy jako zwykłe akapity "1. ..." bez wcięcia; listą (MailOutline) są tylko punkty z kropkami, przyklejone pod linią z dwukropkiem. Powitanie w pierwszej linii = osobny akapit.
- Nazwa produktu: **Cleanpasta** (ES Tools Cleanpasta); identyfikator pakietu zostaje `com.eryksadowski.estools.cleanpaste` (ciągłość aktualizacji, Dostępności i ustawień), stary link `estools-clean-paste://` nadal działa.
- Build na Command Line Tools (Swift 5.10, SDK 14.4): licencja Xcode nie jest zaakceptowana (wymaga sudo, robi to Eryk). Targety: `CleanpastaCore` (biblioteka), `CleanpastaApp` (apka), `cleanpasta` (CLI, folder `Sources/CLI`; system plików nie rozróżnia wielkości liter).
- Apka: `LSUIElement`, ikona w Docku tylko przy otwartym oknie (`DockIcon.show/hide`). Ikona jasna domyślnie, ciemna podmieniana w locie (`AppIcon`). Propozycje ikon: `design/proposals` (wybrana nr 1).
- Aktualizacje bez licencji Apple: Sparkle 2 + EdDSA, appcast jako asset GitHub Release, podpis stałym samopodpisanym certyfikatem "ES Tools Code Signing" (Dostępność przetrwa aktualizacje). Certyfikat i klucz tworzy Eryk sam: `scripts/setup-signing.sh` (zmienia pęk kluczy), kopie do 1Password.
- Przed commitem: `scripts/test.sh`, `scripts/build-app.sh`, grep na myślniki i cudzysłowy typograficzne w zmienionych plikach (wyjątek: testy konwersji).
- Git: `main` = wydane wersje, praca na `development`, PR `development` -> `main`, wydanie `scripts/release.sh` na `main`. Conventional Commits po angielsku, zero atrybucji AI.
