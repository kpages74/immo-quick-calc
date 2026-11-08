# Immo Quick-Calc (Web)

Web-Version der iOS-App „Immo Quick-Calc“: Schnellkalkulation für den maximalen Einkaufspreis,
die Marge und die Gesamtinvestition bei Immobilien. Reines HTML, CSS und JavaScript, ohne Server,
ohne externe Bibliotheken und ohne Build-Schritt.

## Lokal starten

```sh
cd immo-quick-calc-web
python3 -m http.server 8765
```

Dann im Browser `http://localhost:8765` öffnen. Die Seite funktioniert nur über einen Webserver,
nicht per Doppelklick auf `index.html`, weil die Dateien als ES-Module geladen werden.

## Tests

```sh
node --test tests/calc.test.mjs
```

Die Tests prüfen die Rechenlogik in `calc.js` gegen die Sollwerte der iOS-App.

## Auf dem iPhone installieren

Die Seite unter Safari öffnen, dann „Teilen“ → „Zum Home-Bildschirm“. Die App startet danach
ohne Browserleiste und ist auch offline nutzbar (Service Worker).

## Dateien

- `index.html`, `styles.css`: Oberfläche
- `calc.js`: Rechenlogik, Formatierung und Zahlenparser (ohne DOM)
- `app.js`: Bedienoberfläche und Speicherung (localStorage)
- `sw.js`, `manifest.webmanifest`, `icons/`: Offline-Nutzung und Home-Bildschirm
- `tests/calc.test.mjs`: Tests der Rechenlogik

## Hinweise

- Alle Pfade sind relativ, die Seite läuft also auch unter `https://<nutzer>.github.io/immo-quick-calc/`.
- Die Daten bleiben im Browser (localStorage) und werden nirgends übertragen.
- Ändert sich eine Datei, die vom Service Worker zwischengespeichert wird, die Version `CACHE_VERSION` in `sw.js` erhöhen.
