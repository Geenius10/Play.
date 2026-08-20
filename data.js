window.PLAY_DATA = {
  levels: [
    {
      id: 'foundation', title: 'Foundation', subtitle: 'Von null zu sicherem Rhythmus', accent: '01',
      modules: [
        { id:'start', title:'Startklar', lessons:[
          {id:'hold', title:'Gitarre halten & stimmen', type:'lesson', minutes:6, skill:'Basics', goal:'Instrument sicher halten, Saitennamen kennen und stimmen.', steps:['Sitz- und Standposition einrichten','E–A–D–G–B–e benennen','Mit dem Tuner jede Saite auf ±5 Cent stimmen'], success:'Alle 6 Saiten stimmen und Namen ohne Hilfe nennen.'},
          {id:'firstnotes', title:'Erste saubere Töne', type:'practice', minutes:8, skill:'Technique', bpm:60, goal:'Vier Töne ohne Schnarren spielen.', tab:'e|--0--1--3--1--0--\nB|----------------\nG|----------------\nD|----------------\nA|----------------\nE|----------------', success:'3 Durchgänge sauber bei 60 BPM.'},
          {id:'readingtab', title:'Tabulatur lesen', type:'lesson', minutes:7, skill:'Reading', goal:'Saite, Bund, Reihenfolge und Rhythmuszeichen verstehen.', success:'Eine 1-taktige TAB selbstständig lesen.'}
        ]},
        { id:'openchords1', title:'Offene Akkorde I', lessons:[
          {id:'emin', title:'Em & E', type:'practice', minutes:8, skill:'Chords', goal:'Em und E klar greifen.', success:'Je Akkord 5 saubere Anschläge.'},
          {id:'amin', title:'Am & A', type:'practice', minutes:8, skill:'Chords', goal:'Am und A klar greifen.', success:'Je Akkord 5 saubere Anschläge.'},
          {id:'changes1', title:'Erste Akkordwechsel', type:'trainer', minutes:10, skill:'Chord Changes', target:20, goal:'Em↔Am gleichmäßig wechseln.', success:'20 saubere Wechsel pro Minute.'},
          {id:'strumquarters', title:'Viertel anschlagen', type:'practice', minutes:8, skill:'Rhythm', bpm:70, goal:'Vier gleichmäßige Downstrokes pro Takt.', success:'60 Sekunden ohne Tempoverlust.'}
        ]},
        { id:'openchords2', title:'Offene Akkorde II', lessons:[
          {id:'cgd', title:'C, G & D', type:'practice', minutes:12, skill:'Chords', goal:'C, G und D sauber greifen.', success:'Je Akkord 5 klare Anschläge.'},
          {id:'changes2', title:'G–C–D Wechsel', type:'trainer', minutes:10, skill:'Chord Changes', target:30, goal:'Drei Grundakkorde flüssig verbinden.', success:'30 Wechsel pro Minute.'},
          {id:'eighths', title:'Achtelrhythmus', type:'practice', minutes:10, skill:'Rhythm', bpm:70, goal:'Down-Up-Bewegung kontinuierlich halten.', success:'90 Sekunden sauber bei 70 BPM.'},
          {id:'song1', title:'Practice Song: Open Road', type:'song', minutes:12, skill:'Song', bpm:76, progression:['G','D','Em','C'], goal:'Vier-Akkord-Folge musikalisch spielen.', success:'3 komplette Runden ohne Stopp.'}
        ]}
      ]
    },
    {
      id:'beginner', title:'Beginner', subtitle:'Akkorde, Rhythmus & erste Songs', accent:'02',
      modules:[
        {id:'rhythm', title:'Rhythmus festigen', lessons:[
          {id:'strum1', title:'Pop Pattern 1', type:'practice', minutes:10, skill:'Rhythm', bpm:80, goal:'D D U U D U gleichmäßig spielen.', success:'4×8 Takte ohne Stopp.'},
          {id:'accent', title:'Akzente auf 2 & 4', type:'practice', minutes:8, skill:'Rhythm', bpm:84, goal:'Backbeat hörbar akzentuieren.', success:'2 Minuten stabil.'},
          {id:'rests', title:'Pausen & Ghost Strums', type:'lesson', minutes:8, skill:'Rhythm', goal:'Schlaghand bewegt sich weiter, auch wenn kein Ton erklingt.', success:'Pattern mit Pausen ohne Timing-Verlust.'}
        ]},
        {id:'power', title:'Power Chords', lessons:[
          {id:'pcshape', title:'5er-Shape', type:'practice', minutes:10, skill:'Chords', bpm:72, goal:'Power-Chord-Shape auf E- und A-Saite.', success:'Sauber auf 4 Positionen.'},
          {id:'palm', title:'Palm Muting', type:'practice', minutes:10, skill:'Technique', bpm:90, goal:'Gedämpfte Achtel kontrollieren.', success:'60 Sekunden gleichmäßig.'},
          {id:'rockriff', title:'Practice Riff: Engine Room', type:'song', minutes:12, skill:'Song', bpm:96, tab:'e|----------------|\nB|----------------|\nG|----------------|\nD|--2-2---5-5-7---|\nA|--2-2---5-5-7---|\nE|--0-0---3-3-5---|', goal:'Power Chords im Kontext.', success:'4 saubere Durchgänge.'}
        ]},
        {id:'minor-pent', title:'Minor Pentatonic', lessons:[
          {id:'penta1', title:'Position 1', type:'practice', minutes:12, skill:'Scales', bpm:70, goal:'A-Moll-Pentatonik Position 1 auswendig.', tab:'e|----------------5-8-|\nB|------------5-8-----|\nG|--------5-7---------|\nD|----5-7-------------|\nA|-5-7----------------|\nE|-5-8----------------|', success:'Auf und ab bei 70 BPM.'},
          {id:'altpick', title:'Alternate Picking', type:'trainer', minutes:10, skill:'Technique', bpm:70, goal:'Konsequentes Down-Up durch die Skala.', success:'3 saubere Durchgänge.'},
          {id:'improv1', title:'Erste Improvisation', type:'jam', minutes:10, skill:'Improvisation', bpm:70, goal:'Mit 3–4 Tönen bewusst Phrasen bilden.', success:'2 Minuten spielen und Pausen zulassen.'}
        ]}
      ]
    },
    {
      id:'intermediate', title:'Intermediate', subtitle:'Fretboard, Lead & musikalische Kontrolle', accent:'03',
      modules:[
        {id:'barre', title:'Barre & CAGED', lessons:[
          {id:'fbarre', title:'F-Dur Barre', type:'practice', minutes:12, skill:'Chords', goal:'E-Shape-Barre sauber aufbauen.', success:'Alle 6 Saiten klingen.'},
          {id:'caged', title:'CAGED Überblick', type:'lesson', minutes:10, skill:'Fretboard', goal:'Fünf Akkordformen als Griffbrett-System verstehen.', success:'Gleichen Dur-Akkord an 3 Positionen finden.'},
          {id:'triads', title:'Dur-Triads auf 1–3', type:'practice', minutes:12, skill:'Fretboard', goal:'Root-, 1. und 2. Umkehrung verbinden.', success:'In G, C und D finden.'}
        ]},
        {id:'lead', title:'Lead Technique', lessons:[
          {id:'hammer', title:'Hammer-ons & Pull-offs', type:'practice', minutes:10, skill:'Technique', bpm:80, goal:'Legato gleich laut spielen.', success:'8 Takte stabil.'},
          {id:'bend', title:'Bending in tune', type:'practice', minutes:12, skill:'Technique', goal:'Ganzton-Bend exakt zur Zielnote.', success:'8 von 10 Bends treffen.'},
          {id:'vibrato', title:'Kontrolliertes Vibrato', type:'practice', minutes:10, skill:'Technique', goal:'Gleichmäßige Tonhöhenbewegung.', success:'5 lange Töne kontrolliert.'},
          {id:'phrasing', title:'Call & Response', type:'jam', minutes:12, skill:'Improvisation', bpm:74, goal:'Zwei-Takt-Phrasen mit Antwort bauen.', success:'4 musikalische Frage-Antwort-Paare.'}
        ]},
        {id:'theory', title:'Theorie am Griffbrett', lessons:[
          {id:'intervals', title:'Intervalle sehen', type:'trainer', minutes:10, skill:'Theory', goal:'1, b3, 3, 4, 5, b7 relativ zur Root finden.', success:'80% korrekt.'},
          {id:'major', title:'Durtonleiter', type:'practice', minutes:12, skill:'Scales', bpm:72, goal:'Eine 3-notes-per-string-Position sauber spielen.', success:'Auf/ab bei 72 BPM.'},
          {id:'chordtones', title:'Chord Tones treffen', type:'jam', minutes:12, skill:'Improvisation', goal:'Beim Akkordwechsel Grundton oder Terz anvisieren.', success:'In 8 von 12 Wechseln bewusst landen.'}
        ]}
      ]
    },
    {
      id:'advanced', title:'Advanced', subtitle:'Timing, Ausdruck & Eigenständigkeit', accent:'04',
      modules:[
        {id:'timing', title:'Advanced Timing', lessons:[
          {id:'sixteenth', title:'16tel Grid', type:'practice', minutes:12, skill:'Rhythm', bpm:80, goal:'Akzente auf unterschiedlichen 16tel-Positionen.', success:'Je Position 8 Takte stabil.'},
          {id:'metrogap', title:'Gap Click', type:'trainer', minutes:12, skill:'Timing', bpm:90, goal:'Metronom nur auf 2 und 4 bzw. jeden zweiten Takt denken.', success:'2 Minuten ohne Drift.'},
          {id:'syncop', title:'Synkopation', type:'practice', minutes:12, skill:'Rhythm', bpm:86, goal:'Offbeats präzise platzieren.', success:'16 Takte stabil.'}
        ]},
        {id:'harmony', title:'Harmony & Voice Leading', lessons:[
          {id:'sevenths', title:'7th Chord Triads', type:'lesson', minutes:12, skill:'Theory', goal:'Maj7, m7, 7 und m7b5 funktional verstehen.', success:'In C-Dur harmonisieren.'},
          {id:'voice', title:'Voice Leading', type:'practice', minutes:14, skill:'Fretboard', goal:'Akkordtöne mit minimaler Bewegung verbinden.', success:'ii–V–I in 3 Lagen.'},
          {id:'arpeggio', title:'Arpeggio Mapping', type:'practice', minutes:14, skill:'Scales', bpm:76, goal:'Arpeggios über Akkordwechsel verbinden.', success:'ii–V–I ohne Pause.'}
        ]},
        {id:'musician', title:'Musician Mode', lessons:[
          {id:'transcribe', title:'Transkribieren', type:'ear', minutes:15, skill:'Ear Training', goal:'Kurze Phrase nach Gehör finden.', success:'4–6 Töne korrekt übertragen.'},
          {id:'compose', title:'Eigene 8 Takte', type:'creative', minutes:15, skill:'Creativity', goal:'Motiv entwickeln, variieren und abschließen.', success:'8 Takte aufnehmen oder notieren.'},
          {id:'performance', title:'Performance Run', type:'song', minutes:15, skill:'Performance', goal:'Ein komplettes Stück ohne Unterbrechung spielen.', success:'Ein Take ohne Neustart.'}
        ]}
      ]
    }
  ],
  tools: [
    {id:'tuner', title:'Tuner', subtitle:'Chromatisch · Mikrofon'},
    {id:'metronome', title:'Metronom', subtitle:'40–220 BPM · Akzente'},
    {id:'tempo', title:'Tempo Trainer', subtitle:'Automatisch steigern'},
    {id:'chords', title:'Chord Library', subtitle:'Offen · Barre · Power'},
    {id:'fretboard', title:'Fretboard', subtitle:'Noten · Intervalle'},
    {id:'timer', title:'Practice Timer', subtitle:'Fokus ohne Ablenkung'}
  ],
  chords: {
    C:['x','3','2','0','1','0'], G:['3','2','0','0','0','3'], D:['x','x','0','2','3','2'], A:['x','0','2','2','2','0'], E:['0','2','2','1','0','0'],
    Am:['x','0','2','2','1','0'], Em:['0','2','2','0','0','0'], Dm:['x','x','0','2','3','1'], F:['1','3','3','2','1','1'], 'B7':['x','2','1','2','0','2']
  }
};
