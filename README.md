# 🪺 The Wellnest

Expo-App für [thewellnest.ch](https://www.thewellnest.ch): Startseite, Kursübersicht und ein
Buchungssystem im Stil der Webseite (Creme, Bronze, Oliv, Montserrat). Es ist ein **Klick-Prototyp**:
Buchungen und Login funktionieren nur lokal in der App und gehen beim Neuladen verloren.

## Screens

| Tab | Datei | Inhalt |
| --- | --- | --- |
| Home | `src/app/(tabs)/index.tsx` | Hero mit „Book a class", deine nächste Buchung, die nächsten drei Kurse, Kursarten |
| Book | `src/app/(tabs)/book.tsx` | Woche und Tag wählen, Kursart-Chips, Filter (Instructor, Location) im Sheet, Kursliste |
| Classes | `src/app/(tabs)/classes.tsx` | Signature Class (Sculpt), Classic Pilates, Yoga mit Beschreibung und „See times" |
| Nest | `src/app/(tabs)/profile.tsx` | Demo-Login, Mitgliedskarte mit Credits, „My bookings", Newsletter, Einstellungen |

Dazu zwei Modals: `src/app/session/[id].tsx` (Checkout: Kurs-Ticket mit Datum, Zeit, Ort und
Trainer, Zahlung mit Credits oder Kreditkarte, Bestätigung, Stornieren, Warteliste) und
`src/app/instructor/[id].tsx` (Bio und nächste Kurse der Trainerin oder des Trainers).

- `src/lib/schedule.ts`: Kursarten, Instructors, Standorte und der generierte Stundenplan (4 Wochen ab heute)
- `src/lib/nest-store.tsx`: Buchungen und Login (nur im Speicher)
- `src/lib/theme.ts`: Farben und Schriften
- `src/components/`: Icons (SVG-Linien wie auf der Webseite), Buttons, Chips, Kurskarte
- `src/components/motion.tsx`: Animationen (Federn beim Drücken, weiche Farbwechsel)
- `src/components/intro.tsx`: Startanimation (Ringe zeichnen sich, Logo blendet ein; Tippen überspringt)

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
