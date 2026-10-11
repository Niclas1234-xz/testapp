# Lumen Gallery – 3D-Scroll-Showroom für Squarespace

Ein Vollbild-Showroom: Beim Scrollen fährt die Kamera durch mehrere 3D-Räume
(Schlafzimmer, Lounge, Küche). Augen-Hotspots öffnen Materialinfos, unten gibt
es ein Raum-Menü, einen Sprachwechsel (De/En) und einen Raumklang. Alles steckt
in **einer Datei**: `lumen-gallery.html`.

Die Räume werden im Browser mit Three.js berechnet. Es werden keine Bilder oder
Videos hochgeladen.

## Einbau in Squarespace

1. Neue, leere Seite anlegen, z. B. `/showroom`.
2. Seite bearbeiten → **Block hinzufügen → Code**.
3. Den kompletten Inhalt von `lumen-gallery.html` einfügen und
   **„Display Source“ ausschalten**.
4. Speichern und die Seite **live** öffnen (nicht im Editor).

Hinweise:

- JavaScript in Code-Blöcken läuft nur in Squarespace-Tarifen ab
  Business/Core. Im günstigsten Tarif bleibt der Block leer.
- Im Editor erscheint die Galerie als normaler Kasten, damit du die Seite
  weiter bearbeiten kannst. Erst auf der Live-Seite legt sie sich als Vollbild
  über alles.
- Notausgang: Wird die Seite mit `?nogallery` aufgerufen
  (z. B. `/showroom?nogallery`), bleibt die Galerie ein normaler Kasten.

## Anpassen

Alles Wichtige steht im `CONFIG`-Block am Anfang des `<script>`:

| Feld | Bedeutung |
| --- | --- |
| `brand`, `brandSub` | Name oben links, z. B. `'LUMEN'` + `'GALLERY'` |
| `homeHref` | Ziel beim Klick auf den Namen |
| `defaultLang` | `'de'` oder `'en'` |
| `links` | Navigation oben rechts (Text De/En + URL deiner Squarespace-Seiten) |
| `rooms` | Reihenfolge der Räume; `id` ist `bedroom`, `lounge` oder `kitchen` |
| `rooms[].hotspots` | Augen-Punkte: Position `[x, y, z]` in Metern, Titel, Daten, Text |

Die Materialtexte (z. B. „Marmo Sabbia“) sind Beispielinhalte. Ersetze sie
durch deine eigenen Produkte.

Farben und Abstände der Oberfläche stehen als CSS-Variablen oben im
`<style>`-Block (`--lg-ink`, `--lg-veil`, `--lg-chip` …).

## Bedienung

- Mausrad / Trackpad / Wischen: durch die Räume fahren
- Pfeiltasten, Bild↑/Bild↓: ein Raum vor oder zurück
- „Räume“ unten links: direkt zu einem Raum springen
- Esc: Infopanel oder Menü schließen
