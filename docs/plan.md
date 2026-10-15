# ES Tools - plan od A do Z

Stan: 29.09.2026. Autor planu: Eryk Sadowski. Ten plik jest źródłem prawdy dla prac nad ES Tools i apką Clean Paste; statusy faz aktualizujemy tutaj.

## 0. Cel

- **Dziś:** Maciek dostaje działającą apkę Clean Paste. Instalacja bez terminala: plik DMG, przeciągnij do Aplikacji, jedno kliknięcie w uprawnienia.
- **Szerzej:** ES Tools to linia małych, bardzo użytecznych narzędzi na wspólnym fundamencie (brand, ustawienia, aktualizacje z changelogiem, integracja z Raycastem), marka podrzędna Eryk Sadowski.

## 1. Decyzje architektoniczne

| # | Decyzja | Dlaczego | Odrzucone |
|---|---|---|---|
| D1 | Jedno repo na produkt, plus `estools-docs` (brand, katalog) i później `estools-lib-core` | każdy produkt ma własne wydania i aktualizacje; `eryksadowski-tools` to katalog na jednorazowe zadania | `estools-tools` (typ `tools` = skrypty, nazwa "tools-tools") |
| D2 | Osobne apki, nie launcher z pluginami | różne narzędzia, różne uprawnienia; launcherem jest już Raycast | launcher ES Tools |
| D3 | Clean Paste = natywna apka AppKit + SwiftUI, w pasku menu; ikona w Docku tylko przy otwartym oknie ustawień lub aktualizacji | lekka, zawsze pod ręką, nie zaśmieca Docka | Electron, sam Raycast |
| D4 | Konwersja: jedno źródło `convert.ts` (repo Raycasta), w apce przez JavaScriptCore z pliku `Resources/convert.js` (esbuild) | jedna logika i jedne testy dla Raycasta i apki | port do Swift (dwie implementacje do utrzymania) |
| D5 | Schowek natywnie: NSPasteboard (HTML, web archive, RTF, tekst), wklejanie przez CGEvent Cmd+V po puszczeniu modyfikatorów | ten sam algorytm co w rozszerzeniu, sprawdzony w Mailu | Raycast Clipboard API |
| D6 | Skróty globalne przez Carbon `RegisterEventHotKey`, własne pole do nagrywania skrótu | działa bez Dostępności i bez zależności | biblioteki zewnętrzne |
| D7 | Start przy logowaniu przez `SMAppService.mainApp` | systemowy sposób od macOS 13 | LaunchAgent w plist |
| D8 | Aktualizacje bez żadnych licencji: Sparkle 2 z darmowym podpisem EdDSA, `appcast.xml` jako asset GitHub Release, changelog w oknie aktualizacji, instalacja po zgodzie użytkownika (szczegóły w sekcji 2c) | aktualizacja pobrana przez samą apkę nie dostaje flagi kwarantanny, więc macOS jej nie blokuje; Apple Developer niepotrzebny | notaryzacja (płatna), ręczne pobieranie każdej wersji |
| D9 | Repo apki publiczne | ES Tools jest open source (rejestr kodów); pliki aktualizacji muszą być do pobrania bez logowania | prywatne repo + osobny hosting |
| D10 | Podpis darmowym, stałym certyfikatem "ES Tools Code Signing" (samopodpisany, ważny 10 lat, zrobiony lokalnie) | stały podpis = uprawnienie Dostępność przetrwa aktualizacje, a Sparkle sprawdza, że aktualizacja pochodzi od tego samego autora | podpis ad-hoc (Dostępność do ponownego włączenia po każdej wersji), Developer ID (płatne) |
| D11 | Build: Swift Package Manager + skrypt składający `.app` (Command Line Tools, Swift 5.10, SDK 14.4) | licencja Xcode nie jest zaakceptowana, a to wymaga `sudo` | projekt Xcode |
| D12 | Minimum macOS 14 | JavaScriptCore z macOS 14 obsługuje wszystkie wyrażenia regularne konwertera (lookbehind, `\p{L}`) | macOS 13 |
| D13 | UI po angielsku (brand ES Tools), instrukcja dla Maćka po polsku | zasada brandu; polska lokalizacja później | - |
| D14 | (zastąpione przez D20) | | |
| D16 | Uniwersalność: jedna biblioteka `CleanPasteCore` (konwerter, schowek, opcje) używana przez apkę i przez CLI `cleanpaste`; testy wklejania nie tylko w Mailu, także Gmail (Chrome), Slack, Notatki, Pages, Word | narzędzie ma działać wszędzie, gdzie się wkleja, i w automatyzacji | logika zaszyta w apce |
| D17 | CLI `cleanpaste` w paczce apki (`Contents/Helpers/cleanpaste`), instalowane z ustawień jednym kliknięciem jako link w `~/.local/bin` (bez hasła administratora) | Eryk, skrypty, Raycast Script Commands i agenci AI mogą czyścić i kopiować tekst bez klikania | osobna instalacja przez Homebrew (później) |
| D18 | Skill AI `clean-paste`: uczy Claude'a pisać drafty w Markdown i oddawać je przez `cleanpaste --copy`, żeby Eryk wklejał gotowy, sformatowany tekst; źródło w repo apki (`skills/clean-paste`), kopia w `eryksadowski-tools/skills` | AI przygotowuje maile i wiadomości gotowe do wklejenia, bez ręcznego formatowania | instrukcje w CLAUDE.md |
| D19 | Jedna ikona ES Tools w pasku menu: sygnet ES, pod nim sekcje narzędzi (dziś tylko Clean Paste). Przy drugim narzędziu: wspólny rejestr w `~/Library/Application Support/ES Tools/`, pierwsza uruchomiona apka ES Tools pokazuje ikonę i menu wszystkich narzędzi, pozostałe chowają swoje; akcje przez schematy URL narzędzi (część `estools-lib-core`) | wiele narzędzi nie zaśmieca paska menu, marka jest jedna | osobna ikona każdego narzędzia |
| D20 | Ikony apek ES Tools: duży sygnet ES w tle (jak w PDF-ach marki), znak narzędzia na środku w zieleni; wersja jasna domyślna, ciemna podmieniana w locie; propozycje w `design/proposals` (wybrana E) | spójna rodzina ikon, jedno narzędzie od drugiego odróżnia znak na środku | napis w ikonie |
| D15 | Integracja z Raycastem: apka ma schemat URL `estools-clean-paste://paste`, `://repair`, `://settings`; rozszerzenie Raycasta zostaje i działa samodzielnie | Raycast może wywołać apkę jednym deeplinkiem | - |

## 2. Specyfikacja: ES Tools Clean Paste 1.0.0 (apka)

- **Pasek menu:** ikona schowka. Menu: Paste Clean (skrót), Repair Clipboard (skrót), Settings..., Check for Updates..., About Clean Paste, Quit.
- **Paste Clean** (domyślnie ⌃⌥⌘V): czyta schowek, czyści formatowanie, zapisuje wynik i sam wciska Cmd+V. Pusty schowek albo sam obraz lub plik: zwykłe Cmd+V. Brak Dostępności: czysty tekst zostaje w schowku i pojawia się podpowiedź.
- **Repair Clipboard** (bez domyślnego skrótu): czyści schowek w miejscu, bez wklejania. Podpowiedź: "Clipboard repaired - paste with Cmd+V". Nazwa zamiast "Clean Clipboard", bo nie kasuje schowka.
- **Czyszczenie:** zostają pogrubienia, kursywa, podkreślenia, linki, entery, twarde spacje, listy i proste tabele; znikają tła, kolory i fonty. Markdown zamienia się na tekst sformatowany. Myślniki i cudzysłowy typograficzne zamieniają się na znaki z klawiatury.
- **Ustawienia** (okno, ikona w Docku tylko wtedy):
  - Shortcuts: Paste Clean, Repair Clipboard (kliknij i naciśnij klawisze, Delete czyści).
  - Formatting: Replace dashes, Replace quotes, Font size: 12 px (domyślnie, jak Apple Mail), 11, 13, 14, 16 px albo rozmiar aplikacji docelowej.
  - General: Open at login, Show confirmation (podpowiedź na ekranie).
  - Updates: Check automatically, Check now, wersja.
  - Permission: status Dostępności i przycisk do Ustawień systemowych.
  - Stopka: ES Tools by Eryk Sadowski · eryksadowski.com.
- **Pierwsze uruchomienie:** otwiera ustawienia z sekcją powitalną i krokiem "Allow Accessibility".
- **Prywatność:** brak telemetrii; sieć tylko do sprawdzania aktualizacji.
- **General w ustawieniach:** także "Install command line tool" (link `cleanpaste` w `~/.local/bin`, z informacją o PATH).

## 2a. Specyfikacja: CLI `cleanpaste`

```
cleanpaste [FILE] [options]
  wejście: FILE, albo stdin (gdy jest), albo schowek
  --markdown | --html | --text   typ wejścia (domyślnie: auto, jak w apce)
  --copy                         wynik do schowka (HTML + tekst)
  --paste                        do schowka i Cmd+V w aktywnej apce (wymaga Dostępności)
  --repair                       wyczyść schowek w miejscu (= Repair Clipboard)
  --print html|text|json         co wypisać na stdout (domyślnie html; przy --copy nic)
  --body                         tylko treść draftu: bez front matter i notatek po pierwszym ---
  --keep-dashes --keep-quotes    wyłącz zamiany
  --font-size N                  0 = bez rozmiaru; domyślnie wartość z ustawień apki (12)
  --version, --help
```

Kody wyjścia: 0 ok, 1 błąd użycia, 2 nic do wyczyszczenia, 3 brak Dostępności przy --paste.

## 2b. Skill AI `clean-paste`

- Kiedy: Eryk prosi o maila, wiadomość albo odpowiedź do wklejenia (Mail, Gmail, Slack, WhatsApp), albo o "skopiuj mi to sformatowane".
- Jak: Claude pisze treść w Markdown (pogrubienia, listy, linki), zapisuje do pliku tymczasowego i uruchamia `cleanpaste --markdown --copy PLIK`; mówi Erykowi "w schowku, wklej Cmd+V". Bez apki (czat w przeglądarce): oddaje czysty Markdown i przypomina o Paste Clean.
- Zasady: proste cudzysłowy i krótki myślnik już w treści; nic nie wysyła sam.

## 2c. Instalacja i aktualizacje bez licencji

- **Pierwsza instalacja, sposób 1 (polecany):** jedna komenda w Terminalu, skopiowana z README albo od Eryka:
  `curl -fsSL https://github.com/iameryksadowski/estools-app-clean-paste/releases/latest/download/install.sh | sh`.
  Skrypt pobiera najnowszy zip, rozpakowuje do Aplikacji i uruchamia apkę. curl nie nadaje flagi kwarantanny, więc nie ma żadnego ostrzeżenia.
- **Pierwsza instalacja, sposób 2:** DMG z przeglądarki, przeciągnij do Aplikacji, przy pierwszym uruchomieniu raz "Otwórz mimo to" w Ustawieniach systemowych (Prywatność i ochrona). Instrukcja ze zrzutami w DMG i w `docs/instalacja.md`.
- **Aktualizacje:** apka raz dziennie sprawdza `appcast.xml`. Gdy jest nowa wersja, pokazuje okno z changelogiem i przyciskiem Install Update; pobiera, sprawdza podpis EdDSA, podmienia się i uruchamia ponownie. Bez ostrzeżeń macOS i bez ponownego nadawania Dostępności (stały certyfikat).
- **Awaryjnie:** menu "Check for Updates..." i link do strony wydań; ręczna aktualizacja = przeciągnięcie nowej wersji do Aplikacji.
- **Klucze:** prywatny klucz EdDSA i certyfikat "ES Tools Code Signing" żyją w pęku kluczy Eryka; kopie do 1Password (Eryk). Bez nich nie da się wydać aktualizacji, którą przyjmą zainstalowane apki.
- **Wydanie:** `scripts/release.sh` (lokalnie): build, podpis, zip, DMG, `install.sh`, appcast z changelogiem, GitHub Release. Później GitHub Actions po push na `main` z nową wersją (klucze jako sekrety repo).
- **Wtyczka do Illustratora:** osobne, proste sprawdzanie wersji (plik z numerem wersji w GitHub Release i komunikat "jest nowa wersja, pobierz").

## 3. Repo `estools-app-clean-paste`

```
Package.swift                 SPM, zależność Sparkle
Sources/CleanPasteCore/       biblioteka: Converter, Clipboard, Options, Markdown body
Sources/CleanPaste/           apka: main, AppDelegate, HotKeys, Preferences, ShortcutField,
                              SettingsView, HUD, Updater, CLI installer
Sources/cleanpaste/           CLI
skills/clean-paste/           skill AI
Resources/convert.js          generowany z repo Raycasta (scripts/build-converter.sh), commitowany
Resources/AppIcon.icns        z design/icon.svg (scripts/make-icon.sh)
Resources/Info.plist          szablon (wersja wstawiana przy budowie)
design/icon.svg               źródło ikony
scripts/build-app.sh          .app + podpis + zip + dmg
scripts/release.sh            wydanie: build, podpis EdDSA, appcast.xml, GitHub Release
tests/                        testy konwertera w JavaScriptCore na fixture'ach z repo Raycasta
docs/plan.md                  ten plik
docs/instalacja.md            instrukcja po polsku (dla Maćka)
README.md, CHANGELOG.md, CLAUDE.md, LICENSE
```

## 4. Fazy

Każda faza kończy się commitem na `development` i spełnionymi kryteriami odbioru.

### F1. Szkielet i konwerter
- Repo, Package.swift, skrypt `build-converter.sh`, `Resources/convert.js`.
- Test: konwerter w JavaScriptCore daje dokładnie te same wyniki co testy jednostkowe Raycasta (fixture'y: czat, VS Code, Mail, cudzysłowy, rozmiar fontu).
- **Odbiór:** `scripts/test.sh` przechodzi.

### F2. Rdzeń
- Biblioteka `CleanPasteCore`: Converter, Clipboard (odczyt HTML, web archive, RTF, tekst; zapis; Cmd+V po puszczeniu modyfikatorów), Options.
- CLI `cleanpaste` wg specyfikacji 2a.
- Apka: HotKeys, Preferences.
- **Odbiór:** `cleanpaste` czyści plik, stdin i schowek; wynik identyczny z testami Raycasta; skrót w apce czyści schowek.

### F3. Interfejs
- Menu w pasku, okno ustawień (SwiftUI), zmiana ikony w Docku przy oknie, pole skrótu, podpowiedź HUD, pierwsze uruchomienie, schemat URL.
- **Odbiór:** ikona w Docku pojawia się tylko przy otwartym oknie i znika po zamknięciu; każda opcja zapisuje się i działa od razu.

### F4. Ikona i brand
- `design/icon.svg`, `AppIcon.icns` (16-1024 px), ikona w pasku menu jako template.
- **Odbiór:** ikona czytelna w 16, 32, 128 i 512 px; zgodna z BRAND.md (jeden akcent, bez gradientów).

### F5. Paczka
- `build-app.sh`: `Clean Paste.app` (Info.plist, LSUIElement, ikona, convert.js, Sparkle.framework), podpis ad-hoc, zip i DMG.
- Test wklejania przez lab WebKit z repo Raycasta i ręcznie w TextEdit.
- `docs/instalacja.md` po polsku: instalacja, "Otwórz mimo to", Dostępność, skrót, co robi każda opcja.
- **Odbiór:** DMG instaluje się na czystym koncie; Paste Clean działa w Mailu.

### F6. Aktualizacje
- Certyfikat "ES Tools Code Signing" (samopodpisany), Sparkle 2, klucz EdDSA, `release.sh`, `install.sh`, appcast z changelogiem.
- Repo na GitHubie (publiczne), Release 1.0.0 z DMG, zipem i appcast.xml.
- GitHub Actions: wydanie po zmianie wersji na `main` (wymaga sekretu z kluczem EdDSA).
- **Odbiór:** wersja 1.0.0 wykrywa testowe wydanie 1.0.1 i pokazuje changelog.

### F6b. Skill AI
- `skills/clean-paste/SKILL.md` w repo apki, kopia i zip w `eryksadowski-tools/skills`, upload na claude.ai.
- **Odbiór:** w nowej sesji Claude na prośbę "napisz maila do X i daj mi do wklejenia" kładzie sformatowany tekst do schowka przez `cleanpaste`.

### F7. Przekazanie Maćkowi
- Paczka: DMG + instrukcja. Wysyła Eryk.

### F8. Porządki ES Tools
- `estools-docs`: brand (z `eryksadowski-tools/estools/brand`), katalog produktów, zasady wspólne.
- `estools-plugin-illustrator-logo-export`: przeniesienie z historią (`git subtree split`).
- Wpisy w rejestrze nazw (`eryksadowski-docs`), README w `eryksadowski-tools` wskazuje nowe repo, PR `development` -> `main`.
- Rozszerzenie Raycasta: link do apki w README.

### F9. Później
- `estools-lib-core` (pakiet Swift) przy drugiej apce: ustawienia, aktualizacje, skróty, O aplikacji.
- Developer ID i notaryzacja, polska lokalizacja, Raycast Store, strona ES Tools na eryksadowski.com.

## 5. Ryzyka

| Ryzyko | Skutek | Co robimy |
|---|---|---|
| Brak notaryzacji | DMG z przeglądarki trzeba raz otworzyć przez "Otwórz mimo to" | instalacja komendą curl (bez ostrzeżeń); instrukcja dla DMG |
| Utrata klucza EdDSA albo certyfikatu | zainstalowane apki nie przyjmą kolejnych aktualizacji | kopie w 1Password zaraz po utworzeniu |
| Konflikt skrótu z inną apką | skrót nie działa | ustawienia pokazują błąd rejestracji, skrót można zmienić |
| Stare macOS u odbiorcy | apka się nie uruchomi | minimum macOS 14, informacja w instrukcji |

## 6. Decyzje dla Eryka (nie blokują pracy)

1. Kopie klucza EdDSA i certyfikatu do 1Password (po F6).
2. Publiczne repo apki: zgodne z "ES Tools = open source"; bez tego aktualizacje u Maćka nie zadziałają.
3. Domyślny skrót Paste Clean ⌃⌥⌘V.
4. Polska lokalizacja interfejsu.

## 6a. F10 - Cleanpasta (15.10.2026)

Eryk: cała apka nazywa się "Cleanpasta", aktualizacja ma przenieść istniejące instalacje; numerowane punkty wklejamy jako tekst; Raycast włączany z ustawień; skróty można usunąć; porządek na Macu.

| # | Decyzja | Dlaczego |
|---|---|---|
| R1 | Nazwa wszędzie: apka "Cleanpasta" (produkt "ES Tools Cleanpasta"), plik `Cleanpasta.app`, CLI `cleanpasta`, link `cleanpasta://`, repo `estools-app-cleanpasta`, skill `cleanpasta` | jedna nazwa produktu od A do Z |
| R2 | Identyfikator pakietu bez zmian (`com.eryksadowski.estools.cleanpaste`), stary link `estools-clean-paste://` nadal działa | Sparkle podmienia apkę tylko przy tym samym identyfikatorze; zostają Dostępność, ustawienia i skróty; stare Quicklinki w Raycaście dalej działają |
| R3 | Po aktualizacji apka sama zmienia nazwę pliku z `Clean Paste.app` na `Cleanpasta.app` i przepina link CLI | Sparkle zostawia starą nazwę pliku |
| R4 | GitHub przekierowuje stare adresy po zmianie nazwy repo, więc zainstalowane 1.0.x znajdą aktualizację; nowa wersja ma już nowy adres appcastu | brak ręcznej reinstalacji u prezesa |
| R5 | Konwerter (`convert.ts`, testy, fixture'y, lab WebKit) przenosi się do repo apki (`converter/`, pnpm); rozszerzenie Raycasta zostaje zarchiwizowane | jeden produkt, jedno źródło logiki |
| R6 | Listy numerowane wklejamy jako zwykłe linie tekstu "1. ...", bez wcięcia; tylko listy punktowane są listami | numeracja w mailach się nie rozjeżdża, tekst wygląda jak wpisany ręcznie (przykład: wycena dla Hadat) |
| R7 | Raycast w ustawieniach: sekcja z przyciskiem dodania komend (Quicklinki z importu), statusem i instrukcją usunięcia; żadnej osobnej wtyczki do instalowania | Raycast nie pozwala dodać komend inaczej bez sklepu Raycast |
| R8 | Każdy skrót ma przycisk usunięcia; brak skrótu jest poprawnym stanem | Eryk: "trzeba móc usunąć i nie ustawiać żadnego" |

Wydanie: 1.1.0. Sprzątanie na Macu Eryka: stare rozszerzenie Raycasta (do Kosza), stary link `cleanpaste`, plik importu w Pobranych, stary skill `clean-paste` na claude.ai wyłączony.

## 7. Status (01.10.2026)

- [x] F0 Plan
- [x] F1 Szkielet i konwerter (20/20 testów zgodności JavaScriptCore z TypeScript)
- [x] F2 Rdzeń (biblioteka, CLI `cleanpaste`, skróty, ustawienia)
- [x] F3 Interfejs (pasek menu z sygnetem ES, okno ustawień, Dock tylko przy oknie - sprawdzone, HUD, schemat URL - Repair sprawdzony na żywo)
- [x] F4 Ikona i brand (wariant E: sygnet w tle, zielony schowek; jasna domyślnie, ciemna w locie)
- [x] F5 Paczka (universal .app, zip, DMG, instrukcja PL; podpis ad-hoc do czasu F6)
- [x] F6 Aktualizacje - repo publiczne, certyfikat "ES Tools Code Signing" w pęku kluczy, klucz EdDSA w pliku, kopie w 1Password (Sadowscy > Work > "ES Tools - Clean Paste signing"); Release v1.0.0 opublikowany, komenda instalacyjna sprawdzona; aktualizacja 1.0.0 -> 1.0.1 sprawdzona lokalnie. Do zrobienia: wydanie automatycznie z GitHub Actions po zmianie wersji na `main`
- [x] F6b Skill AI (`clean-paste` wgrany na claude.ai, kopia w `eryksadowski-tools/skills`)
- [x] F7 Przekazanie Maćkowi - DMG 1.0.0 z PDF "Jak zainstalować" oddany Erykowi (01.10)
- [x] F8 Porządki ES Tools (`estools-docs` z historią brandu, Logo Export z historią z powrotem w swoim repo, rejestr nazw) - PR-y zmergowane
- [ ] F10 Cleanpasta (zmiana nazwy, listy numerowane, Raycast z ustawień, skróty do usunięcia, porządek)
- [ ] F9 Później
