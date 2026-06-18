# Interaktywna Prezentacja "Dzień na Lotnisku"

**Data:** 2026-06-18  
**Cel:** Zabawna, interaktywna prezentacja HTML dla zarządu lotniska pokazująca korzyści z produktów Papkin, Protazy i Gerwazy.

---

## Parametry projektu

- **Język:** Polski
- **Format:** Pojedynczy plik HTML (działa offline, zero zależności zewnętrznych)
- **Styl graficzny:** Pixel-art / 8-bit retro (CSS box-shadow sprites, keyframe animations)
- **Czcionka:** Press Start 2P (Google Fonts)
- **Dźwięk:** Opcjonalne chiptune (Web Audio API), wyłączalne przyciskiem 🔇
- **Zależności zewnętrzne:** Tylko Google Fonts (Press Start 2P)

---

## Postacie

Trzy współczesne postacie w stylu pixel-art:

| Postać | Opis | Kolor | Animacje |
|--------|------|-------|---------|
| **Papkin** | Młody analityk w słuchawkach i z laptopem, koszula w kratę | Fioletowy | idle (chodzi), akcja (pisze błyskawicznie, lecą dokumenty), win (skacze z gwiazdkami) |
| **Protazy** | Energiczna asystentka w garniturze otoczona latającymi kopertami | Pomarańczowy | idle (chodzi), akcja (sortuje maile gestem jak DJ), win (skacze z gwiazdkami) |
| **Gerwazy** | Poważny inspektor w okularach z tabletem, garnitur + odznaka | Niebieski | idle (chodzi), akcja (skanuje dokumenty, pojawia się checkmark), win (skacze z gwiazdkami) |

---

## Struktura scen

Aplikacja ma **6 scen** przewijanych poziomo. Pasek na górze pokazuje zegar (06:00–22:00) z pikselową animacją tykania.

### Scena 1 — 06:30 | Wejście do terminalu
- **Lokacja:** Hall terminalu, pasażerowie, tablice odlotów
- **Zdarzenie:** Intro — lotnisko się budzi. Wszyscy trzej bohaterowie wchodzą w pikselowej czołówce z tytułem "Dzień na lotnisku"
- **Bohater:** Wszyscy 3
- **Paleta:** Ciepły amber, jasne niebo za oknami

### Scena 2 — 08:00 | Sala konferencyjna
- **Lokacja:** Stół konferencyjny, ekran projekcji, krzesła
- **Problem (chaos):** Narada zarządu trwa, nikt nie notuje, góra kartek rośnie, kierownicy się kłócą kto co ustalił
- **Rozwiązanie:** Wkracza **Papkin** z laptopem, błyskawiczne pisanie, ekran projekcji pokazuje gotowy protokół
- **Korzyść:** "-70% czasu na dokumentowanie spotkań"
- **Bullets:** Automatyczna transkrypcja na żywo / Gotowy protokół w minutę po spotkaniu / Każde ustalenie przypisane do osoby

### Scena 3 — 10:30 | Biuro obsługi klienta
- **Lokacja:** Open space z biurkami, monitory, licznik wiadomości rośnie
- **Problem (chaos):** Skrzynka mailowa eksploduje (animowany licznik: 247 nieprzeczytanych), pracownicy panikują
- **Rozwiązanie:** Wkracza **Protazy**, sortuje maile gestem DJ, koperty latają na właściwe stosy
- **Korzyść:** "-80% czasu obsługi korespondencji"
- **Bullets:** Automatyczna klasyfikacja i priorytetyzacja / Gotowe propozycje odpowiedzi / Przekazanie do właściwej osoby z kontekstem

### Scena 4 — 13:00 | Centrum kontroli / dział compliance
- **Lokacja:** Biuro z regałami pełnymi segregatorów, tablica z przepisami
- **Problem (chaos):** Inspektor w drodze, stos dokumentów do sprawdzenia, pracownik pot na czole
- **Rozwiązanie:** Wkracza **Gerwazy** z tabletem, skanuje dokumenty, pojawiają się zielone checkmarki
- **Korzyść:** "Gotowość na audyt w godziny, nie tygodnie"
- **Bullets:** Automatyczna ocena zgodności z NIS2, AI Act i innymi / Raport z lukami i rekomendacjami / 100% kontrola nad dokumentacją

### Scena 5 — 17:00 | Gabinet dyrektora
- **Lokacja:** Elegancki gabinet, panoramiczne okno na płytę lotniska
- **Zdarzenie:** Dyrektor dostaje od wszystkich 3 bohaterów gotowe raporty, siada spokojnie z kawą, lotnisko działa perfekcyjnie
- **Bohater:** Wszyscy 3 (celebracja, animacja win)
- **Przekaz:** "Zarządzanie bez chaosu"

### Scena 6 — 22:00 | Outro
- **Lokacja:** Lotnisko nocą, świecące okna, samoloty na pasie
- **Zdarzenie:** Fajerwerki pixel-art, 3 bohaterowie razem
- **Animowane liczby:** -70% czasu na protokoły / -80% obsługi korespondencji / 100% kontrola compliance
- **Stopka:** Logo + dane kontaktowe (placeholder)

---

## Mechanika scen

Każda scena (2–4) przebiega w 4 krokach:

1. **Akt chaos** (~3s animacja): problem narasta wizualnie
2. **Wejście bohatera**: efekt "swoosh", chiptune, chaos znika
3. **Panel korzyści**: karteczka wyjeżdża z boku z ikoną produktu, 1 zdaniem i 3 bullet-pointami
4. **Przycisk "Dalej →"**: slide do następnej sceny

---

## Nawigacja

- Strzałki ← → na klawiaturze
- Przyciski na ekranie
- Miniaturki scen na dole (klikalne, można skakać)
- Przycisk "Od początku" zawsze widoczny
- Autoplay po 10 sekundach bezczynności (wyłączalny)

---

## Techniczne

- **Zero zewnętrznych bibliotek JS** — czysty vanilla JS
- **Sprite'y**: CSS `box-shadow` pixel technique + CSS keyframe animations
- **Tła lokacji**: CSS gradients + geometryczne kształty SVG inline
- **Dźwięk**: Web Audio API (proceduralne chiptune, zero plików audio)
- **Responsywność**: Optymalizowany pod ekran 1920×1080 (prezentacja), działa też na laptopie
- **Tryb pełnoekranowy**: Przycisk F / ikona fullscreen
