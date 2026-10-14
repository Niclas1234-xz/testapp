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

---

# ⛏️ Minecraft (Nachbau)

Im selben Projekt steckt ein spielbarer Minecraft-Nachbau – oben rechts auf **⛏️ Minecraft** tippen
(oder direkt `/minecraft` öffnen). Läuft in **Expo Go** (iOS/Android) und im Browser.

Alle Texturen, Icons und das Logo werden beim Start **prozedural im Code erzeugt** – es sind keine
Original-Dateien von Mojang enthalten. Sound gibt es (noch) nicht.

## Was alles funktioniert

- **Unendliche Welt** aus 16×16-Chunks (128 Blöcke hoch) mit Startwert (Seed): Ozeane, Strände, Ebenen,
  Wälder, Birkenwälder, Wüsten, verschneite Taiga und Berge; Höhlen, Erze (Kohle, Eisen, Gold,
  Diamant), Kies-/Erdadern, Eichen, Birken, Fichten, Kakteen, Blumen, Gras, Grundgestein
- **Licht wie im Original**: Himmels- und Blocklicht (0–15) mit Flood-Fill über Chunk-Grenzen,
  weiche Beleuchtung + Ambient Occlusion, Fackeln, leuchtender Ofen
- **Tag/Nacht-Zyklus** (20 Minuten): Sonne, Mond, Sterne, Sonnenauf-/untergang, Wolken, Nebel
- **Physik nach Minecraft-Formeln** (20 Ticks/s): Laufen, Sprinten, Schleichen (fällt nicht von
  Kanten), Springen, Schwimmen, Fallschaden, Kreativ-Fliegen (Doppelsprung)
- **Abbauen** mit echten Abbauzeiten (Härte, Werkzeug, Werkzeugstufe), Risse-Animation, Partikel,
  Drops, Werkzeug-Haltbarkeit; **Bauen** inkl. Fackeln an Wänden, Öfen/Truhen mit Blickrichtung
- **Inventar** (36 Slots + Hotbar), **Crafting** 2×2 und an der **Werkbank** 3×3 (Bretter, Stöcke,
  Werkbank, Ofen, Truhe, Fackeln, alle Werkzeuge aus Holz/Stein/Eisen/Gold/Diamant, Brot,
  Sandstein, Steinziegel, Eimer), **Ofen** mit Brennstoff und Schmelzen, **Truhen**
- **Überleben**: Leben, Hunger/Sättigung, Regeneration, Verhungern, Ertrinken (Luftblasen),
  Kaktusschaden, Tod mit Item-Drop und Wiederbeleben; **Essen** (Apfel, Brot, Fleisch roh/gebraten)
- **Mobs**: Schweine, Kühe, Schafe (Fleisch, Leder, Wolle), Zombies (verbrennen in der Sonne),
  Creeper (explodieren und sprengen Blöcke) – mit KI, Spawning bei Dunkelheit, Rückstoß, Kritische Treffer
- **Welt-Simulation**: fließendes Wasser (inkl. unendlicher Quellen), fallender Sand/Kies,
  Gras breitet sich aus, Laub zerfällt (Setzlinge/Äpfel), Setzlinge wachsen zu Bäumen,
  Ackerbau (Hacke, Weizenkörner, Weizen wächst in 8 Stufen), Eis/Schnee schmelzen an Fackeln
- **Spielmodi** Überleben/Kreativ (Kreativinventar mit allen Items), Schwierigkeitsgrade
- **Speichern**: mehrere Welten, Änderungen werden pro Chunk gespeichert (Browser: localStorage,
  Handy: Dateien via `expo-file-system`), automatisches Speichern
- Third-Person-Ansicht (F5), Optionen (Sichtweite, Sichtfeld, Grafik, Helligkeit …)

## Steuerung

| Aktion | Handy/Tablet | Tastatur & Maus (Browser) |
| --- | --- | --- |
| Laufen | Joystick links (ganz nach vorne = Sprinten) | W A S D (W doppelt / Strg = Sprinten) |
| Umsehen | Wischen | Maus (Klick ins Bild = Maus fangen) |
| Abbauen / Angreifen | Halten / auf Mob tippen | Linke Maustaste |
| Bauen / Benutzen | Tippen | Rechte Maustaste |
| Essen | Mit Essen in der Hand halten | Rechte Maustaste halten |
| Springen / Fliegen | ⇧ (Kreativ: 2× = Fliegen) | Leertaste |
| Schleichen | ● | Shift |
| Inventar | ••• neben der Hotbar | E |
| Item wegwerfen | Hotbar-Slot halten | Q |
| Slot wählen | Hotbar antippen | 1–9 / Mausrad |
| Kamera / Menü | F5 / II oben rechts | F5 / Esc, F3 = Debug |

Im Inventar: **Tippen** nimmt/legt einen Stapel, **Halten** teilt ihn bzw. legt ein einzelnes Item,
**Doppeltippen** (oder Shift-Klick) verschiebt ihn.

## Code-Aufbau

- `src/app/minecraft/` – Routen: Titelbildschirm/Weltauswahl (`index.tsx`), Spiel (`play.tsx`)
- `src/minecraft/world/` – Chunks, Weltgenerator, Licht-Engine, Block-Updates, Wasser, Ofen
- `src/minecraft/render/` – Mesher (Chunks → Vertexdaten) und WebGL-Renderer (`expo-gl`)
- `src/minecraft/entity/` – Kollision/Physik, Spieler, Mobs, Items
- `src/minecraft/game.ts` – Spiel-Loop, Interaktion, Spawning, Speichern
- `src/minecraft/textures/` – prozedurale Pixel-Texturen und Textur-Atlas
- `src/minecraft/ui/` – HUD, Touch-Steuerung, Inventare, Menüs

Hinweis: Es ist ein privater Fan-Nachbau. „Minecraft“ ist eine Marke von Mojang/Microsoft – für eine
Veröffentlichung im App Store müsste das Spiel umbenannt werden.
