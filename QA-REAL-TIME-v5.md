# PLAY. Guitar Practice PWA v5 – Real-Time QA

- 696 Practice-Übungen / 20 Bereiche aus v4 erhalten.
- JavaScript-Syntax: app.js, data.js, practice_data.js, sw.js geprüft.
- Neue tatsächliche Zeitstatistik nutzt ausschließlich Einträge mit `seconds`; alte Sollzeit-Einträge fließen nicht in neue Istzeit-Empfehlungen ein.
- Übungs-Timer: Start/Pause/Weiter; beim App-Wechsel wird automatisch pausiert.
- Practice-Bibliothek, eigene Übungen, Lernübungen und Song-Loops können echte Aktivzeit speichern.
- Session-Richtwert und tatsächlich gemessene Zeit sind getrennt.
- Session-Empfehlungen basieren auf Wochenzeit pro Practice-Bereich und letzten Bewertungen.
- Alte v4-Session-IDs werden beim Laden verworfen, damit nach dem Wechsel auf Practice-Session-IDs kein inkompatibler Zustand bleibt.
- Browser-Automation konnte in dieser Ausführungsumgebung wegen lokaler URL-Sperre nicht ausgeführt werden; daher keine Behauptung eines physischen iOS-Gerätetests.
