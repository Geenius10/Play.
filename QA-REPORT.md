# QA – PLAY. Guitar Teacher v3

Stand: 21.08.2026

## Automatische Runtime-Tests
Getestet mit Chromium-Rendering und Touch-/Mobile-Viewports.

- iPhone-Viewport 390×844: Hauptnavigation ohne horizontales Seiten-Overflow
- iPad-Viewport 820×1180: Hauptnavigation ohne horizontales Seiten-Overflow
- Alle 5 Haupttabs öffnen und springen auf Scrollposition 0
- Zweiter Tap auf aktiven Tab setzt Seite zurück und scrollt nach oben
- 134/134 Lektionen öffnen
- 134/134 Lektionen enthalten alle 5 Teaching-Phasen und jede Phase lässt sich aktivieren
- 12/12 Practice-Songs öffnen
- 10/10 Tools öffnen und schließen
- Foundation-Test: Gitarren-Anatomie/Saiten-Audio vorhanden
- Em/E-Test: 2 Akkorddiagramme werden korrekt erzeugt
- keine JavaScript-Laufzeitfehler in den UI-Tests
- kein horizontales Dokument-Overflow in den getesteten Viewports

## Statische Checks
- app.js: `node --check` bestanden
- data.js: `node --check` bestanden
- sw.js: `node --check` bestanden
- Manifest gültiges JSON

## Physischer Gerätetest
Ein echter iOS/iPadOS-Gerätetest bleibt für Mikrofonberechtigung, Safari-Audio-Latenz, Add-to-Home-Screen und Betriebssystem-spezifische Gesten erforderlich. Die UI-/Navigationslogik wurde browserseitig getestet.
