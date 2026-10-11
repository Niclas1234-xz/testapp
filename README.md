# 🚗 Autoerkenner

Expo-App: Foto von einem Auto machen (oder aus der Galerie wählen). Die KI (Claude) sagt dir,
**welches Auto es ist** (Marke, Modell, Generation, Baujahre) und schätzt den **Preis in CHF**
(Neupreis und heutigen Gebrauchtwert).

## So funktioniert's

```
App (Kamera/Galerie) ──► Bild auf max. 1280 px verkleinern (JPEG)
                     ──► POST /api/recognize  (Expo Router API-Route, läuft auf dem Server)
                     ──► Claude analysiert das Bild und gibt strukturiertes JSON zurück
                     ◄── Anzeige: Modell, Sicherheit, Preise, Merkmale, Alternativen
```

- `src/app/index.tsx`: Scan-Screen (Kamera, Galerie, Ergebnis-Karte)
- `src/app/api/recognize+api.ts`: Server-Route, ruft die Claude API auf (`claude-opus-5-5`)
- `src/lib/car-schema.ts`: Schema der KI-Antwort (Zod, wird als Structured Output erzwungen)

Der API-Key bleibt auf dem Server und landet **nicht** in der App.

## Starten

```bash
npm install
cp .env.example .env      # ANTHROPIC_API_KEY eintragen (https://console.anthropic.com)
npx expo start
```

Dann den QR-Code mit **Expo Go** scannen (Handy und Rechner im selben WLAN). Im Entwicklungsmodus
leitet Expo die Anfragen an `/api/recognize` automatisch an den Dev-Server auf deinem Rechner weiter.

Im Browser testen: `npx expo start --web` (dort öffnet „Foto aufnehmen" den Datei-Dialog).

## Produktion

Für einen echten Build muss die API-Route irgendwo gehostet sein, z.B. mit EAS Hosting:

```bash
npx expo export --platform web
npx eas-cli@latest deploy
```

Danach in `app.json` beim `expo-router`-Plugin die `origin` auf die Deploy-URL setzen und
`ANTHROPIC_API_KEY` als Umgebungsvariable beim Hosting hinterlegen.

## Hinweise

- Die Preise sind KI-Schätzungen ohne Gewähr. Kilometerstand, Zustand und Ausstattung kann die
  KI auf einem Foto nicht sehen.
- Jede Erkennung ist ein API-Aufruf und kostet ein paar Rappen.
