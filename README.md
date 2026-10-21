# 🪺 The Wellnest

Expo-App für [thewellnest.ch](https://www.thewellnest.ch): Startseite, Kursübersicht und ein
Buchungssystem im Stil der Webseite (Creme, Bronze, Oliv, Montserrat). Es ist ein **Klick-Prototyp**:
Buchungen und Login funktionieren nur lokal in der App und gehen beim Neuladen verloren.

## Screens

| Tab | Datei | Inhalt |
| --- | --- | --- |
| Home | `src/app/(tabs)/index.tsx` | Hero, Laufband „THE NOW · THE NATURE …", nächste Kurse, About, Presence/Ease/Connection, Kurse, Newsletter |
| Book | `src/app/(tabs)/book.tsx` | Woche wählen, Tagesleiste, „Show all"/„Today", Filter nach Instructor und Location, Kursart-Tabs, Kurskarten |
| Classes | `src/app/(tabs)/classes.tsx` | Signature Class (Sculpt), Classic Pilates, Yoga mit Beschreibung und „Book now" |
| Nest | `src/app/(tabs)/profile.tsx` | Demo-Login, Mitgliedskarte mit Credits, „My bookings", Einstellungen |

Dazu zwei Sheets: `src/app/session/[id].tsx` (Kursdetails, buchen, stornieren, Warteliste) und
`src/app/instructor/[id].tsx` (Bio und nächste Kurse der Trainerin oder des Trainers).

- `src/lib/schedule.ts`: Kursarten, Instructors, Standorte und der generierte Stundenplan (4 Wochen ab heute)
- `src/lib/nest-store.tsx`: Buchungen und Login (nur im Speicher)
- `src/lib/theme.ts`: Farben und Schriften
- `src/components/`: Icons (SVG-Linien wie auf der Webseite), Buttons, Kurskarte, Laufband

## Starten

```bash
npm install
npx expo start
```

Dann den QR-Code mit **Expo Go** scannen (Handy und Rechner im selben WLAN).
Im Browser geht es mit `npx expo start --web`.

## Nächste Schritte

- Echte Kursdaten und Buchungen anbinden (z.B. das Buchungstool der Webseite oder eine eigene API)
- Echtes Login und Bezahlung (Credits, Abos)
- App-Icon und Splash-Screen mit dem Wellnest-Logo ersetzen (`assets/images/`)
