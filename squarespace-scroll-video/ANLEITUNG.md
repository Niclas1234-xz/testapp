# Scroll-Video + Immobilien für Squarespace

Beim Scrollen fährt das Video durch die Villa: vom Haus aussen über den Eingang bis ins Schlafzimmer mit Pool.
Dazu erscheinen nacheinander drei Texte. Danach folgen die Bereiche **Häuser kaufen** (Objektkarten mit Filter
und Sortierung), **Leistungen** (Kaufen / Verkaufen / Bewerten) und ein **Kontakt**-Bereich.

## Was in diesem Ordner liegt

| Datei | Wozu |
|---|---|
| `squarespace-code-block.html` | Der Code, den Sie in Squarespace einfügen |
| `media/luxus-villa-desktop-1440p.mp4` | Video für Computer und Tablet (2560×1440, 10,5 MB) |
| `media/luxus-villa-mobile-hochformat.mp4` | Video fürs Handy im Hochformat (810×1440, 3,1 MB) |
| `media/luxus-villa-poster.jpg` | Standbild, das angezeigt wird, solange das Video lädt |
| `media/objekt-1.jpg` … `objekt-4.jpg` | Platzhalter-Bilder für die Objektkarten |
| `vorschau.html` | Lokale Vorschau (Doppelklick öffnet sie im Browser) |

## So wurde die Videoqualität verbessert

* **Original:** 640×360 Pixel, 24 Bilder pro Sekunde, 2,7 Sekunden lang.
* **KI-Hochskalierung (Real-ESRGAN)** auf 2560×1440: Das Bild ist schärfer, Kompressionsartefakte und Rauschen sind weg.
* **Doppelte Bildrate (48 fps):** Im ruhigen Aussenteil werden Zwischenbilder aus der Bewegung berechnet, im schnellen
  Innenteil weich überblendet. Dadurch ruckelt das Video auch bei langsamem Scrollen weniger.
* **Leicht mehr Kontrast und Farbe.**
* **Für Scrollen optimiert:** Jedes Bild ist ein Keyframe, deshalb springt das Video ohne Verzögerung zu jeder Scroll-Position.
  Die Tonspur ist entfernt.
* **Eigene Hochformat-Version fürs Handy:** Auf dem Handy erscheint sonst nur ein vergrösserter, unscharfer Ausschnitt
  des Querformat-Videos.

## Einbau in Squarespace

> **Voraussetzung:** Der **Core-Plan** oder höher (früher «Business»). Im Basic- bzw. Personal-Plan zeigt der
> Code-Block nur HTML und CSS an, ohne JavaScript. Das Scroll-Video funktioniert dort also nicht.

### 1. Dateien hochladen

Squarespace hat keinen klassischen Datei-Manager. Dateien bis **20 MB** lassen sich aber über den Link-Editor hochladen:

1. Eine Seite bearbeiten und in einem beliebigen Textblock ein Wort markieren. Dann auf das **Link**-Symbol klicken.
2. **Datei** (englisch «File») wählen, dann **Datei hochladen**. Nun `luxus-villa-desktop-1440p.mp4` hochladen.
3. Das Gleiche für alle Dateien aus `media/` wiederholen.
4. Den Link im Textblock wieder entfernen. Die hochgeladenen Dateien bleiben gespeichert.

Danach sind die Dateien unter `/s/dateiname` erreichbar, zum Beispiel `https://ihre-domain.ch/s/luxus-villa-desktop-1440p.mp4`.
**Lassen Sie die Dateinamen unverändert, dann stimmen die Links im Code bereits.** Zur Kontrolle können Sie
die Adresse im Browser öffnen. Das Video sollte dann abspielen.

### 2. Code-Block einfügen

1. Auf der gewünschten Seite eine **neue, leere Sektion** hinzufügen, am besten ganz oben.
2. **Block hinzufügen → Code** wählen.
3. Den **ganzen Inhalt** von `squarespace-code-block.html` einfügen. Den Modus auf **HTML** stellen und «Quelle anzeigen» ausschalten.
4. Speichern und die **Live-Seite** öffnen, am besten in einem privaten Fenster.

Wichtig: Der Code-Block muss **allein** in seiner Sektion stehen. Auf der Live-Seite löst er sich dann automatisch aus dem
Squarespace-Raster und wird bildschirmbreit. Die leere Sektion wird ausgeblendet. Im Editor zeigt Squarespace den Effekt nur
eingeschränkt an. Prüfen Sie deshalb immer auf der Live-Seite.

### 3. Anpassen

Fast alles stellen Sie oben im Code im Block `window.LX_CONFIG` ein.

**Objekte** (`objekte: [...]`): Die sechs Einträge sind **Beispieldaten**. Ersetzen Sie sie durch Ihre echten Objekte.

| Feld | Beispiel | Hinweis |
|---|---|---|
| `titel` | `"Moderne Villa mit Pool"` | |
| `ort` | `"Küsnacht ZH"` | |
| `typ` | `"Villa"` | Daraus entstehen die Filter (Villen / Häuser / Wohnungen …) |
| `preis` | `8900000` | Ohne Apostroph. `null` zeigt «Preis auf Anfrage» an |
| `zimmer` | `7.5` | Wird als «7½ Zimmer» angezeigt |
| `wohnflaeche`, `grundstueck` | `420`, `1250` | In m². `null` blendet das Feld aus |
| `bild` | `"/s/villa-kuesnacht.jpg"` | Bild genauso wie das Video hochladen |
| `badge` | `"Neu"`, `"Exklusiv"`, `"Reserviert"` | `""` zeigt kein Badge an |
| `link` | `"/objekte/villa-kuesnacht"` | Leer lassen, dann führt die Karte zur Kontaktseite (mit Objektname) |

Weitere Einstellungen:

* **Scroll-Länge:** Mit `scrollLaengeDesktop` und `scrollLaengeMobile` legen Sie fest, wie weit man scrollt, bis das Video zu Ende ist.
  Die Angabe ist in Prozent der Bildschirmhöhe. Höhere Werte machen das Video langsamer.
* **Button-Links:** `kontaktLink`, `verkaufenLink` und `bewertenLink`.
* **Texte im Video:** Sie stehen direkt im HTML (`<div class="lx-cap" …>`). Mit `data-in` und `data-out` legen Sie fest,
  wann ein Text erscheint und wieder verschwindet. `0` ist der Anfang des Scrollwegs, `1` das Ende.
* **Farben und Schriften:** Sie stehen als Variablen ganz oben im `<style>`-Teil (`--lx-bronze`, `--lx-ivory`, `--lx-serif` …).

### 4. Tipps

* Stellen Sie den **Header auf transparent**. Dann läuft das Video hinter dem Menü durch und wirkt edler.
* Auf dem Handy wird automatisch das kleine Hochformat-Video geladen, auf Computer und Tablet das 1440p-Video.
* Ist im Betriebssystem «Bewegung reduzieren» eingeschaltet, erscheinen nur das Standbild und ein Button. So bleibt die Seite barrierefrei.
* Wenn Ihr Video nicht von Squarespace kommt (Vimeo-Links oder YouTube funktionieren für Scroll-Videos **nicht**):
  Es braucht eine direkte MP4-Datei (H.264), am besten mit einem Keyframe pro Bild. Mit ffmpeg geht das so:
  `ffmpeg -i video.mov -an -c:v libx264 -crf 18 -x264-params keyint=1 -movflags +faststart video.mp4`

## Lokale Vorschau

`vorschau.html` per Doppelklick in Chrome oder Safari öffnen. Die Datei bildet eine Squarespace-Seite nach.
Nach Änderungen am Code-Block die Vorschau neu erzeugen:

```bash
cd squarespace-scroll-video
python3 tools/vorschau-erzeugen.py .
```
