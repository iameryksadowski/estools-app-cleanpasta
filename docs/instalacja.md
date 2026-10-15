# Cleanpasta - instalacja i obsługa

Cleanpasta wkleja tekst bez tła, kolorów i obcych fontów. Zostają pogrubienia, listy, linki i entery, a tekst przyjmuje styl miejsca, do którego wklejasz: Mail, Gmail, Slack, Notatki, Word.

## 1. Instalacja

**Sposób A - plik DMG (od Eryka)**

1. Otwórz plik Cleanpasta-*.dmg i przeciągnij Cleanpasta na folder Aplikacje.
2. Uruchom Cleanpasta z Aplikacji. macOS pokaże komunikat, że nie może sprawdzić aplikacji - kliknij "Gotowe" (nie "Przenieś do Kosza").
3. Otwórz Ustawienia systemowe > Prywatność i ochrona, przewiń w dół i przy "Cleanpasta" kliknij "Otwórz mimo to", potem potwierdź hasłem lub Touch ID.
4. To jest potrzebne tylko przy pierwszej instalacji. Aktualizacje instalują się już bez tego.

**Sposób B - jedna komenda (bez żadnych ostrzeżeń macOS)**

1. Otwórz aplikację Terminal (Cmd+Spacja, wpisz "Terminal", Enter).
2. Wklej poniższą linię i naciśnij Enter:

   curl -fsSL https://github.com/iameryksadowski/estools-app-cleanpasta/releases/latest/download/install.sh | sh

3. Gotowe: Cleanpasta jest w Aplikacjach i działa. Ikona pojawia się w pasku menu u góry ekranu.

## 2. Jedno pozwolenie: Dostępność

Cleanpasta sam naciska Cmd+V, dlatego macOS raz pyta o zgodę.

1. Przy pierwszym uruchomieniu otworzy się okno Cleanpasta. Kliknij "Allow Accessibility".
2. W Ustawieniach systemowych włącz przełącznik przy "Cleanpasta".
3. Wróć do okna Cleanpasta - zobaczysz "Allowed".

## 3. Używanie

- Skopiuj tekst jak zwykle (Cmd+C) - z przeglądarki, czatu, dokumentu.
- Zamiast Cmd+V naciśnij **Control+Option+Command+V**. Tekst wklei się czysty.
- Albo kliknij ikonę w pasku menu > **Paste Clean**.
- **Repair Clipboard** czyści tylko schowek - potem wklejasz zwykłym Cmd+V, gdzie chcesz.

## 4. Ustawienia (ikona w pasku menu > Settings...)

- **Shortcuts** - własne skróty dla Paste Clean i Repair Clipboard.
- **Formatting** - zamiana długich myślników na "-", zamiana cudzysłowów na proste, rozmiar tekstu (domyślnie 12 px, jak w Apple Mail).
- **Open at login** - Cleanpasta startuje razem z Makiem.
- **Updates** - gdy wyjdzie nowa wersja, Cleanpasta pokaże listę zmian i zapyta, czy zainstalować.

**Po aktualizacji:** macOS może ponownie poprosić o Dostępność. Cleanpasta sam otworzy wtedy swoje okno - kliknij "Allow Accessibility" i w Ustawieniach systemowych wyłącz, a potem włącz przełącznik przy Cleanpasta.

Gdy okno ustawień jest otwarte, Cleanpasta ma ikonę w Docku. Po zamknięciu okna zostaje tylko w pasku menu.

## 5. Odinstalowanie

Ikona w pasku menu > Quit Cleanpasta, potem przeciągnij Cleanpasta z Aplikacji do Kosza.

---

ES Tools by Eryk Sadowski · eryksadowski.com
