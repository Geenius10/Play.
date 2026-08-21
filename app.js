(() => {
'use strict';
const D = window.PLAY_DATA;
const P = window.PLAY_PRACTICE || [];
const $app = document.getElementById('app');
const STORAGE = 'play_guitar_state_v2';
const LEGACY_STORAGE = 'play_guitar_state_v1';
const DAY = 86400000;
const levelOrder = D.levels.map(l => l.id);
const notesSharp = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const goalSkills = {
  allround: [], songs: ['Song','Chords','Chord Changes','Rhythm','Repertoire'],
  lead: ['Technique','Scales','Improvisation','Fretboard','Ear Training'],
  fingerstyle: ['Fingerstyle','Chords','Rhythm','Dynamics'],
  musicianship: ['Theory','Harmony','Fretboard','Ear Training','Musicianship','Composition']
};
const defaults = {
  schema: 2, tab: 'home', level: 'foundation', learnView: 'path', completed: {}, mastery: {}, bpm: {},
  history: [], sessions: [], activeSession: null, onboarding: false,
  profile: {instrument:'electric', level:'foundation', minutes:20, goal:'allround', theme:'system', tuning:'standard'},
  customExercises: [], bestChanges: {}, fretStats:{correct:0,total:0}, earStats:{correct:0,total:0},
  practiceFav:{}, practiceBpm:{}, practiceCategory:'Warm-up', legacyMinutes:0, legacySessions:0
};
let state = loadState();
let deferredInstallPrompt = null;
let audioCtx = null;
let metro = null;
let tunerStream = null;
let tunerFrame = null;
let practiceTimer = null;
let songTicker = null;
let activePractice = null;
let activePracticeTick = null;

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function loadState(){
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch {}
  if (!raw) {
    try { raw = JSON.parse(localStorage.getItem(LEGACY_STORAGE) || 'null'); } catch {}
    if (raw) raw = migrateV1(raw);
  }
  const s = {...clone(defaults), ...(raw || {})};
  s.profile = {...clone(defaults.profile), ...(raw?.profile || {})};
  s.completed = {...(raw?.completed || {})};
  s.mastery = {...(raw?.mastery || {})};
  s.bpm = {...(raw?.bpm || {})};
  s.history = Array.isArray(raw?.history) ? raw.history : [];
  s.sessions = Array.isArray(raw?.sessions) ? raw.sessions : [];
  s.customExercises = Array.isArray(raw?.customExercises) ? raw.customExercises : [];
  s.bestChanges = {...(raw?.bestChanges || {})};
  s.fretStats = {...clone(defaults.fretStats), ...(raw?.fretStats || {})};
  s.earStats = {...clone(defaults.earStats), ...(raw?.earStats || {})};
  s.practiceFav = {...(raw?.practiceFav || {})}; s.practiceBpm = {...(raw?.practiceBpm || {})}; s.practiceCategory = raw?.practiceCategory || 'Warm-up';
  if(s.activeSession?.items?.some(i=>!P.some(x=>x.id===i.id))) s.activeSession=null;
  if (!levelOrder.includes(s.level)) s.level = 'foundation';
  return s;
}
function migrateV1(v){
  const s = clone(defaults);
  s.tab = v.tab || 'home'; s.level = v.level || 'foundation'; s.onboarding = !!v.onboarding;
  s.profile = {...s.profile, ...(v.profile || {})}; s.completed = {...(v.completed || {})}; s.bpm = {...(v.bpm || {})};
  s.customExercises = Array.isArray(v.customExercises) ? v.customExercises.map((x,i)=>({...x,id:x.id||`custom-${Date.now()}-${i}`})) : [];
  s.legacyMinutes = Number(v.totalMin || 0); s.legacySessions = Number(v.sessions || 0);
  Object.keys(s.completed).forEach(id => { s.mastery[id] = {score:45, attempts:1, lastAt:Date.now(), nextReview:Date.now()}; });
  Object.entries(v.ratings || {}).forEach(([id,r]) => {
    const base = s.mastery[id] || {score:25,attempts:0};
    base.score = Math.max(base.score, r==='easy'?70:r==='good'?55:35); base.lastRating=r; base.nextReview=Date.now(); s.mastery[id]=base;
  });
  return s;
}
function save(){
  state.schema = 2;
  if (state.history.length > 5000) state.history = state.history.slice(-5000);
  if (state.sessions.length > 1000) state.sessions = state.sessions.slice(-1000);
  localStorage.setItem(STORAGE, JSON.stringify(state));
}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function localDateKey(ts=Date.now()){ const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function startOfWeek(ts=Date.now()){ const d=new Date(ts); d.setHours(0,0,0,0); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.getTime(); }

function fmtSecs(sec=0){ sec=Math.max(0,Math.round(sec)); const m=Math.floor(sec/60), s=sec%60; return `${m}:${String(s).padStart(2,'0')}`; }
function practiceSeconds(h){ return Number.isFinite(+h.seconds) ? +h.seconds : Math.round(Number(h.minutes||0)*60); }
function actualPracticeHistory(){ return state.history.filter(h=>h.type==='practice'&&Number.isFinite(+h.seconds)); }
function categorySeconds(since=0){ const out={}; actualPracticeHistory().filter(h=>(h.at||0)>=since).forEach(h=>{const k=h.skill||'Sonstiges';out[k]=(out[k]||0)+practiceSeconds(h);}); return out; }
function sessionActualSeconds(id){ return actualPracticeHistory().filter(h=>h.sessionId===id).reduce((a,h)=>a+practiceSeconds(h),0); }
function trackerElapsed(){ if(!activePractice)return 0; return activePractice.accumulatedMs+(activePractice.running?performance.now()-activePractice.perfStarted:0); }
function paintTracker(){ const el=document.querySelector('[data-active-time]');if(el)el.textContent=fmtSecs(trackerElapsed()/1000);const btn=document.querySelector('[data-track-toggle]');if(btn&&activePractice)btn.textContent=activePractice.running?'Ⅱ Pause':'▶ Weiter'; }
function trackerStart(meta){ trackerStop({saveEntry:true});activePractice={...meta,startedAt:Date.now(),perfStarted:performance.now(),accumulatedMs:0,running:true};clearInterval(activePracticeTick);activePracticeTick=setInterval(paintTracker,250);paintTracker(); }
function trackerPause(){ if(!activePractice?.running)return;activePractice.accumulatedMs+=performance.now()-activePractice.perfStarted;activePractice.running=false;paintTracker(); }
function trackerResume(){ if(!activePractice||activePractice.running)return;activePractice.perfStarted=performance.now();activePractice.running=true;paintTracker(); }
function trackerToggle(){ activePractice?.running?trackerPause():trackerResume(); }
function trackerStop({saveEntry=true,rating='neutral',bpm=null,completed=false}={}){ if(!activePractice)return 0;trackerPause();const p=activePractice,seconds=Math.max(0,Math.round(p.accumulatedMs/1000));clearInterval(activePracticeTick);activePracticeTick=null;activePractice=null;if(saveEntry&&seconds>=3){state.history.push({type:'practice',source:p.source||'practice',practiceId:p.practiceId||null,lessonId:p.lessonId||null,customId:p.customId||null,sessionId:p.sessionId||null,title:p.title,skill:p.skill||'Sonstiges',seconds,minutes:seconds/60,rating,bpm:bpm||null,completed:!!completed,startedAt:p.startedAt,at:Date.now()});save();}return seconds; }
document.addEventListener('visibilitychange',()=>{if(document.hidden&&activePractice?.running)trackerPause();});

function allLessons(){ return D.levels.flatMap((l,li)=>l.modules.flatMap((m,mi)=>m.lessons.map((x,xi)=>({...x,levelId:l.id,levelTitle:l.title,moduleId:m.id,moduleTitle:m.title,order:[li,mi,xi]})))); }
const lessons = allLessons();
const lessonMap = new Map(lessons.map(l=>[l.id,l]));
function lessonById(id){ return lessonMap.get(id); }
function songById(id){ return D.songs.find(s=>s.id===id); }
function mastery(id){ return state.mastery[id] || {score:0,attempts:0,nextReview:0}; }
function pctLevel(level){ const ls=level.modules.flatMap(m=>m.lessons); return Math.round(ls.reduce((a,l)=>a+mastery(l.id).score,0)/(ls.length||1)); }
function levelUnlocked(id){ const idx=levelOrder.indexOf(id); if(idx<=0) return true; return pctLevel(D.levels[idx-1])>=45 || state.level===id || levelOrder.indexOf(state.level)>=idx; }
function stats(){
  const now=Date.now(),week=startOfWeek(now),practices=actualPracticeHistory();
  const actualTotalSec=practices.reduce((a,h)=>a+practiceSeconds(h),0),weekSec=practices.filter(h=>(h.at||0)>=week).reduce((a,h)=>a+practiceSeconds(h),0);
  const totalSec=Math.round((state.legacyMinutes||0)*60)+actualTotalSec,dates=[...new Set(practices.filter(h=>practiceSeconds(h)>0).map(h=>localDateKey(h.at)))].sort().reverse();
  let streak=0,cursor=new Date();cursor.setHours(0,0,0,0);const today=localDateKey(cursor.getTime()),yesterday=localDateKey(cursor.getTime()-DAY);
  if(dates.includes(today)||dates.includes(yesterday)){if(!dates.includes(today))cursor.setDate(cursor.getDate()-1);while(dates.includes(localDateKey(cursor.getTime()))){streak++;cursor.setDate(cursor.getDate()-1);}}
  return {totalSec,weekSec,total:Math.round(totalSec/60),weekMin:Math.round(weekSec/60),streak,sessions:state.legacySessions+state.sessions.length,practices};
}
function dueLessons(){ const now=Date.now(); return lessons.filter(l=>state.completed[l.id] && mastery(l.id).nextReview && mastery(l.id).nextReview<=now); }
function nextLesson(){
  const level=D.levels.find(l=>l.id===state.level)||D.levels[0];
  const ls=level.modules.flatMap(m=>m.lessons);
  return ls.find(x=>!state.completed[x.id]) || lessons.find(x=>!state.completed[x.id] && levelUnlocked(x.levelId)) || ls[0];
}
function goalMatch(l){ const wanted=goalSkills[state.profile.goal]||[]; return wanted.includes(l.skill); }

function practiceFocusCategories(){
  const goal=state.profile.goal;
  if(goal==='lead')return ['Warm-up','Alternate Picking','Scales','Scale Sequences','Pentatonic','Legato','Speed'];
  if(goal==='fingerstyle')return ['Warm-up','Fingerstyle','Chord Changes','Arpeggios','Rhythm'];
  if(goal==='songs')return ['Warm-up','Chord Changes','Rhythm','Style · Rock','Style · Pop / Indie','Style · Blues'];
  if(goal==='musicianship')return ['Warm-up','Scales','Arpeggios','Rhythm','Chord Changes','String Skipping'];
  return ['Warm-up','Alternate Picking','Chord Changes','Rhythm','Scales','Pentatonic','Fingerstyle','Style · Blues','Style · Rock'];
}
function practiceRecommendations(){
  const spent=categorySeconds(startOfWeek()),focus=practiceFocusCategories(),recent=actualPracticeHistory().slice(-80);
  return focus.map((cat,idx)=>{const sec=spent[cat]||0,hard=recent.filter(h=>h.skill===cat&&h.rating==='hard').length,easy=recent.filter(h=>h.skill===cat&&h.rating==='easy').length;return {cat,sec,score:(idx===0?900:0)+hard*180-easy*20-sec/4};}).sort((a,b)=>b.score-a.score);
}
function buildSession(){
  const target=Number(state.profile.minutes||20),recs=practiceRecommendations(),items=[];let planned=0;
  const maxItems=target<=15?3:target<=30?5:target<=45?7:9,recentIds=new Set(actualPracticeHistory().slice(-30).map(h=>h.practiceId).filter(Boolean));
  for(const r of recs){const pool=P.filter(x=>x.category===r.cat);if(!pool.length)continue;const sorted=[...pool].sort((a,b)=>(recentIds.has(a.id)?1:0)-(recentIds.has(b.id)?1:0)||Math.abs((a.minutes||3)-4)-Math.abs((b.minutes||3)-4)||a.id.localeCompare(b.id));const x=sorted[0];if(!x||items.some(i=>i.id===x.id))continue;if(items.length&&planned+(x.minutes||3)>target+3)continue;items.push(x);planned+=x.minutes||3;if(items.length>=maxItems||planned>=target-1)break;}
  return items.length?items:P.slice(0,Math.min(4,P.length));
}
function sessionTipText(){
  const recs=practiceRecommendations(),spent=categorySeconds(startOfWeek());
  if(!actualPracticeHistory().length)return 'Noch keine echte Übungszeit erfasst. Die erste Session startet ausgewogen und lernt danach aus deinem tatsächlichen Verhalten.';
  const top=recs[0];return `${top.cat} bekommt heute etwas mehr Raum: diese Woche ${fmtSecs(spent[top.cat]||0)} aktive Zeit. Empfehlungen basieren auf echter Spielzeit und deinen Bewertungen.`;
}

function nav(){
  const items=[['home','⌂','Heute'],['learn','◫','Lernen'],['practice','▶','Practice'],['tools','⌘','Tools'],['progress','↗','Fortschritt']];
  return `<nav class="bottomnav" aria-label="Hauptnavigation">${items.map(([id,ic,tx])=>`<button class="navbtn ${state.tab===id?'active':''}" data-tab="${id}" aria-label="${tx}"><b aria-hidden="true">${ic}</b>${tx}</button>`).join('')}</nav>`;
}
function top(title='PLAY.',sub='Practice less randomly.'){
  return `<div class="topbar"><div><div class="brand">${esc(title)}</div><div class="tagline">${esc(sub)}</div></div><button class="iconbtn" data-action="settings" aria-label="Einstellungen">⚙︎</button></div>`;
}
function applyTheme(){
  const t=state.profile.theme||'system'; document.documentElement.dataset.theme=t;
  const dark=t==='dark'||(t==='system'&&matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#111111':'#151515');
}
function render(){
  applyTheme(); let body='';
  if(state.tab==='home') body=home(); else if(state.tab==='learn') body=learn(); else if(state.tab==='practice') body=practice(); else if(state.tab==='tools') body=tools(); else body=progress();
  $app.innerHTML=`<main class="shell">${body}</main>${nav()}`; bind();
  if(!state.onboarding && !document.querySelector('.sheet')) openOnboarding();
}
function lessonCard(l,num=''){
  const done=!!state.completed[l.id], m=mastery(l.id), due=done&&m.nextReview&&m.nextReview<=Date.now();
  return `<button class="card lessoncard ${done?'done':''}" data-lesson="${l.id}"><div class="cardrow"><div class="cardicon">${due?'↻':done?'✓':num||'♪'}</div><div class="grow left"><div class="title">${esc(l.title)}</div><div class="sub">${esc(l.skill)} · ${l.minutes} min${l.bpm?` · ${state.bpm[l.id]||l.bpm} BPM`:''}</div></div><div class="scorepill">${m.score||0}%</div><div class="chev">›</div></div></button>`;
}
function home(){
  const st=stats(),s=buildSession(),resume=state.activeSession?.items?.length,sessionActual=resume?sessionActualSeconds(state.activeSession.id):0;
  return `${top()}<section class="hero"><div class="eyebrow">${resume?'Session gespeichert':`Empfehlung · ca. ${state.profile.minutes} min`}</div><h1>${resume?'Weitermachen.':'Heute gezielt üben.'}</h1><p>${resume?`Bisher tatsächlich gespielt: ${fmtSecs(sessionActual)}.`:esc(sessionTipText())}</p><button class="primary" data-action="session">▶ ${resume?'Session fortsetzen':'Session starten'}</button></section>
  <div class="stats"><div class="stat"><strong>${st.streak}🔥</strong><span>Tage Streak</span></div><div class="stat"><strong>${fmtSecs(st.weekSec)}</strong><span>aktive Zeit diese Woche</span></div><div class="stat"><strong>${s.length}</strong><span>heute empfohlen</span></div></div>
  <div class="sectionhead"><h2>Heute sinnvoll</h2><button data-tab="practice">Alle Übungen</button></div><div class="cards">${s.slice(0,5).map(practiceCard).join('')}</div>
  <div class="card coachnote"><b>Warum diese Auswahl?</b><span>${esc(sessionTipText())}</span></div>
  <div class="sectionhead"><h2>Dein Lernpfad</h2><button data-tab="learn">Öffnen</button></div><div class="cards twocol">${D.levels.map(l=>`<button class="card levelcard ${!levelUnlocked(l.id)?'locked':''}" data-level="${l.id}"><div class="cardrow"><div class="levelno">${l.accent}</div><div class="grow left"><div class="title">${l.title}</div><div class="sub">${l.subtitle}</div></div><div class="chev">›</div></div><div class="progress"><i style="width:${pctLevel(l)}%"></i></div></button>`).join('')}</div>`;
}
function learn(){
  const view=state.learnView||'path';
  return `${top('PLAY. lernen','Pfad, Songs und Skills in einem System.')}<div class="viewtabs"><button class="${view==='path'?'active':''}" data-learnview="path">Lernpfad</button><button class="${view==='songs'?'active':''}" data-learnview="songs">Songs</button><button class="${view==='skills'?'active':''}" data-learnview="skills">Skills</button></div>${view==='path'?learnPath():view==='songs'?songsView():skillsView()}`;
}
function learnPath(){
  return `<div class="chiprow levelchips">${D.levels.map(l=>`<button class="chip ${state.level===l.id?'active':''}" data-level="${l.id}">${l.title}</button>`).join('')}</div><div class="searchwrap"><input class="input" id="lessonSearch" type="search" placeholder="Lektionen durchsuchen …" autocomplete="off"></div>${D.levels.map(level=>`<section class="card level" data-levelsection="${level.id}" ${state.level!==level.id?'hidden':''}><div class="levelhead"><div class="levelno">${level.accent}</div><div class="grow"><div class="leveltitle">${level.title}</div><div class="sub">${level.subtitle} · ${pctLevel(level)}% Mastery</div></div></div>${level.modules.map((m,i)=>`<details class="module" ${i===0?'open':''}><summary>${esc(m.title)}<span>${m.lessons.filter(x=>state.completed[x.id]).length}/${m.lessons.length} ▾</span></summary>${m.lessons.map(l=>`<button class="lesson ${state.completed[l.id]?'done':''}" data-lesson="${l.id}" data-search="${esc((l.title+' '+l.skill+' '+l.goal).toLowerCase())}"><div class="lessonbadge">${state.completed[l.id]?'✓':'▶'}</div><div class="grow left"><div class="title">${esc(l.title)}</div><div class="sub">${esc(l.skill)} · ${l.minutes} min · ${mastery(l.id).score||0}%</div></div><span class="chev">›</span></button>`).join('')}</details>`).join('')}</section>`).join('')}`;
}
function songsView(){
  return `<p class="leadcopy">Alle Stücke sind eigene Practice-Songs und damit offline nutzbar. Schwierige Abschnitte kannst du loopen und langsamer spielen.</p><div class="cards songgrid">${D.songs.map(s=>`<button class="card songcard" data-song="${s.id}"><div class="songart">${s.meter}</div><div class="grow left"><div class="title">${esc(s.title)}</div><div class="sub">${esc(s.style)} · ${s.key} · ${s.bpm} BPM</div><div class="tiny">${D.levels.find(l=>l.id===s.level)?.title||s.level}</div></div><span class="chev">›</span></button>`).join('')}</div>`;
}
function skillsView(){
  return `<p class="leadcopy">Mastery steigt durch wiederholtes Üben. Ein einmal abgeschlossenes Kapitel ist deshalb noch nicht automatisch „beherrscht“.</p><div class="card">${skillRows(true)}</div>`;
}
function skillRows(showDescriptions=false){
  return D.skills.map(s=>{
    const ls=lessons.filter(l=>l.skill===s.id), p=ls.length?Math.round(ls.reduce((a,l)=>a+mastery(l.id).score,0)/ls.length):0;
    return `<div class="skillrow"><div class="skilltop"><span>${esc(s.id)}</span><span>${p}%</span></div>${showDescriptions?`<div class="tiny">${esc(s.description)}</div>`:''}<div class="progress"><i style="width:${p}%"></i></div></div>`;
  }).join('');
}
function practice(){
  const cats=[...new Set(P.map(x=>x.category))], cat=state.practiceCategory||'Warm-up';
  const favCount=Object.values(state.practiceFav||{}).filter(Boolean).length;
  const list=cat==='Favoriten'?P.filter(x=>state.practiceFav[x.id]):P.filter(x=>x.category===cat);
  return `${top('PLAY. practice','Üben statt lesen. TAB auf, Metronom an, spielen.')}<div class="hero practicehero"><div class="eyebrow">${P.length} geprüfte Practice-Drills</div><h1>Gitarre in die Hand.</h1><p>Warm-up, Technik, Skalen, Picking, Rhythmus und mehr. Jede Übung hat TAB und ein eigenes Arbeitstempo.</p><div class="herobuttons"><button class="primary" data-randompractice>▶ Zufällige Übung</button><button class="secondary" data-warmupset>5-Min-Warm-up</button></div></div>
  <div class="chiprow practicecats"><button class="chip ${cat==='Favoriten'?'active':''}" data-practicecat="Favoriten">★ Favoriten · ${favCount}</button>${cats.map(c=>`<button class="chip ${cat===c?'active':''}" data-practicecat="${esc(c)}">${esc(c)} · ${P.filter(x=>x.category===c).length}</button>`).join('')}</div>
  <div class="searchwrap"><input class="input" id="practiceSearch" type="search" placeholder="Übung, Tonart, Technik durchsuchen …" autocomplete="off"></div>
  <div class="sectionhead"><h2>${esc(cat)}</h2><span>${list.length} Übungen</span></div><div class="cards practicegrid" id="practiceGrid">${list.length?list.map(practiceCard).join(''):'<div class="card empty">Noch keine Favoriten. Öffne eine Übung und tippe auf ★.</div>'}</div>`;
}
function practiceCard(x){
 const fav=!!state.practiceFav[x.id], bpm=state.practiceBpm[x.id]||x.bpm;
 return `<button class="card practicecard" data-practiceexercise="${x.id}" data-practicesearch="${esc((x.title+' '+x.category+' '+x.difficulty+' '+(x.tags||[]).join(' ')).toLowerCase())}"><div class="cardrow"><div class="cardicon">${fav?'★':'♩'}</div><div class="grow left"><div class="title">${esc(x.title)}</div><div class="sub">${esc(x.difficulty)} · ${bpm} BPM · Richtwert ${x.minutes} min</div></div><div class="chev">›</div></div></button>`;
}
function filterPractice(q){q=q.trim().toLowerCase();document.querySelectorAll('[data-practicesearch]').forEach(x=>x.hidden=q&&!x.dataset.practicesearch.includes(q));}
function openPracticeExercise(id,opts={}){
 const x=P.find(v=>v.id===id);if(!x)return;let bpm=state.practiceBpm[id]||x.bpm,rating=null,started=false;const fav=()=>!!state.practiceFav[id];
 const s=sheet(`<div class="sheethead"><div><div class="biglabel">${esc(x.category)} · ${esc(x.difficulty)}</div><h2>${esc(x.title)}</h2></div><button class="close" data-close>×</button></div>
 <p class="goal">${esc(x.goal)}</p>${x.detail?`<div class="coachnote"><b>So übst du</b><span>${esc(x.detail)}</span></div>`:''}
 <div class="card livepractice"><div class="tiny">ECHTE AKTIVE ZEIT</div><div class="bpm timerdisplay" data-active-time>0:00</div><button class="primary dark full" data-track-toggle>▶ Übung starten</button><div class="tiny">Im Hintergrund pausiert die Messung automatisch.</div></div>
 <div class="card toolbox"><div class="tiny">ARBEITSTEMPO</div><div class="bpm" id="plibBpm">${bpm}</div><div class="controls"><button class="roundbtn" data-pbpm="-5">−5</button><button class="primary dark" data-pmetro>♩ Metronom</button><button class="roundbtn" data-pbpm="5">+5</button></div></div>
 <div class="teachvisual"><div class="visualtitle">TAB</div><div class="tabscroll"><pre class="tab practicetab">${esc(x.tab)}</pre></div><div class="tiny">Von links nach rechts. e = dünnste Saite oben, E = dickste Saite unten. x = gedämpft.</div></div>
 <div class="practiceactions"><button class="secondary" data-pfav>${fav()?'★ Favorit':'☆ Favorit'}</button><button class="secondary" data-presetbpm>Tempo zurücksetzen</button></div>
 <div class="rating"><button class="hard" data-prate="hard">Zu schwer</button><button class="good" data-prate="good">Sauber</button><button class="easy" data-prate="easy">Zu leicht</button></div>
 <button class="primary dark full" data-psave disabled>Durchgang speichern</button>`);
 s.querySelector('[data-track-toggle]').onclick=()=>{if(!started){started=true;trackerStart({source:'library',practiceId:id,sessionId:opts.sessionId||null,title:x.title,skill:x.category});s.querySelector('[data-psave]').disabled=false;}else trackerToggle();paintTracker();};
 s.querySelectorAll('[data-pbpm]').forEach(b=>b.onclick=()=>{bpm=Math.max(30,Math.min(260,bpm+Number(b.dataset.pbpm)));state.practiceBpm[id]=bpm;save();s.querySelector('#plibBpm').textContent=bpm;if(metro)startMetronome({bpm,beats:4,subdivision:1});});
 s.querySelector('[data-pmetro]').onclick=e=>toggleSimpleMetro(bpm,e.currentTarget);
 s.querySelector('[data-pfav]').onclick=e=>{state.practiceFav[id]=!fav();save();e.currentTarget.textContent=fav()?'★ Favorit':'☆ Favorit';};
 s.querySelector('[data-presetbpm]').onclick=()=>{bpm=x.bpm;state.practiceBpm[id]=bpm;save();s.querySelector('#plibBpm').textContent=bpm;if(metro)startMetronome({bpm,beats:4,subdivision:1});};
 s.querySelectorAll('[data-prate]').forEach(b=>b.onclick=()=>{rating=b.dataset.prate;s.querySelectorAll('[data-prate]').forEach(y=>y.classList.toggle('selected',y===b));});
 s.querySelector('[data-psave]').onclick=()=>{if(rating==='easy')state.practiceBpm[id]=Math.min(260,bpm+5);else if(rating==='hard')state.practiceBpm[id]=Math.max(30,bpm-5);else state.practiceBpm[id]=bpm;const sec=trackerStop({saveEntry:true,rating:rating||'neutral',bpm,completed:true});if(opts.sessionId&&state.activeSession?.id===opts.sessionId){const item=state.activeSession.items.find(i=>i.id===id);if(item){item.done=true;item.actualSec=(item.actualSec||0)+sec;item.rating=rating||'neutral';item.doneAt=Date.now();}save();opts.parentSheet&&updateSessionSheet(opts.parentSheet);}closeSheet(s);render();};
 s._practiceOnClose=()=>{if(activePractice?.practiceId===id)trackerStop({saveEntry:true,rating:rating||'neutral',bpm,completed:false});};
}
function openRandomPractice(){const pool=P.filter(x=>(state.practiceCategory==='Favoriten'?state.practiceFav[x.id]:x.category===state.practiceCategory));const x=pool[Math.floor(Math.random()*pool.length)]||P[Math.floor(Math.random()*P.length)];if(x)openPracticeExercise(x.id);}
function openWarmupSet(){const pool=P.filter(x=>x.category==='Warm-up');const picks=[];for(let i=0;i<3;i++){const x=pool[Math.floor(Math.random()*pool.length)];if(x&&!picks.includes(x))picks.push(x);}const s=sheet(`<div class="sheethead"><div><div class="biglabel">5-Minuten Warm-up</div><h2>Locker anfangen.</h2></div><button class="close" data-close>×</button></div><p class="goal">Drei kurze Drills. Kein Maximalkraft-Test: langsam, sauber, schmerzfrei.</p><div class="cards">${picks.map((x,i)=>`<button class="card lesson" data-warmexercise="${x.id}"><div class="lessonbadge">${i+1}</div><div class="grow left"><div class="title">${esc(x.title)}</div><div class="sub">${state.practiceBpm[x.id]||x.bpm} BPM</div></div><span>›</span></button>`).join('')}</div>`);s.querySelectorAll('[data-warmexercise]').forEach(b=>b.onclick=()=>openPracticeExercise(b.dataset.warmexercise));}

function tools(){ const icons={tuner:'⌁',metronome:'♩',tempo:'↗',chords:'◇',scales:'⌁',fretboard:'⌗',changes:'⇄',ear:'◉',timer:'◷',jam:'♫'};
  return `${top('PLAY. tools','Alle Kernwerkzeuge funktionieren offline.')}<div class="toolgrid">${D.tools.map(t=>`<button class="card toolcard" data-tool="${t.id}"><div class="emoji">${icons[t.id]||'•'}</div><div class="left"><div class="title">${esc(t.title)}</div><div class="sub">${esc(t.subtitle)}</div></div></button>`).join('')}</div>`;
}
function progress(){
 const st=stats(),weekCats=categorySeconds(startOfWeek()),cats=Object.entries(weekCats).sort((a,b)=>b[1]-a[1]),recent=actualPracticeHistory().slice(-12).reverse();
 return `${top('PLAY. progress','Gemessen wird echte aktive Übungszeit.')}<div class="stats"><div class="stat"><strong>${st.sessions}</strong><span>Sessions</span></div><div class="stat"><strong>${fmtSecs(st.totalSec)}</strong><span>aktive Gesamtzeit</span></div><div class="stat"><strong>${fmtSecs(st.weekSec)}</strong><span>diese Woche</span></div></div><div class="sectionhead"><h2>Zeit nach Bereich · diese Woche</h2></div><div class="card">${cats.length?cats.map(([k,v])=>`<div class="historyrow"><span>${esc(k)}</span><strong>${fmtSecs(v)}</strong></div>`).join(''):'<div class="tiny">Noch keine aktive Practice-Zeit erfasst.</div>'}</div><div class="sectionhead"><h2>Session-Empfehlung</h2></div><div class="card coachnote"><b>Auf Basis deiner echten Zeit</b><span>${esc(sessionTipText())}</span></div><div class="sectionhead"><h2>Letzte Practice</h2></div><div class="card">${recent.length?recent.map(h=>`<div class="historyrow"><span><b>${esc(h.title||h.skill)}</b><small>${esc(h.skill||'')} · ${new Date(h.at).toLocaleDateString('de-DE')}</small></span><strong>${fmtSecs(practiceSeconds(h))}</strong></div>`).join(''):'<div class="tiny">Noch kein Verlauf.</div>'}</div><div class="sectionhead"><h2>Skill Map</h2></div><div class="card">${skillRows(false)}</div>`;
}
function ratingLabel(r){ return r==='hard'?'Schwer':r==='easy'?'Leicht':r==='good'?'Gut':'Neutral'; }
function bind(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
 const target=b.dataset.tab, same=state.tab===target; state.tab=target; save();
 if(same){closeAllSheets(); render();} else render();
 requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
});
  document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{ if(!levelUnlocked(b.dataset.level)) return; state.level=b.dataset.level; state.profile.level=state.level; state.tab=b.closest('.bottomnav')?state.tab:'learn'; state.learnView='path'; save();render(); });
  document.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>openLesson(b.dataset.lesson));
  document.querySelectorAll('[data-song]').forEach(b=>b.onclick=()=>openSong(b.dataset.song));
  document.querySelectorAll('[data-custom]').forEach(b=>b.onclick=()=>openCustom(b.dataset.custom));
  document.querySelectorAll('[data-editcustom]').forEach(b=>b.onclick=()=>editCustom(b.dataset.editcustom));
  document.querySelector('[data-action="settings"]')?.addEventListener('click',openSettings);
  document.querySelectorAll('[data-action="session"]').forEach(b=>b.onclick=openSession);
  document.querySelector('[data-action="addcustom"]')?.addEventListener('click',()=>editCustom(null));
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>openTool(b.dataset.tool));
  document.querySelectorAll('[data-practiceexercise]').forEach(b=>b.onclick=()=>openPracticeExercise(b.dataset.practiceexercise));
  document.querySelectorAll('[data-practicecat]').forEach(b=>b.onclick=()=>{state.practiceCategory=b.dataset.practicecat;save();render();requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));});
  document.querySelector('[data-randompractice]')?.addEventListener('click',openRandomPractice);
  document.querySelector('[data-warmupset]')?.addEventListener('click',openWarmupSet);
  const ps=document.querySelector('#practiceSearch');if(ps)ps.oninput=()=>filterPractice(ps.value);
  document.querySelectorAll('[data-learnview]').forEach(b=>b.onclick=()=>{state.learnView=b.dataset.learnview;save();render();});
  const search=document.querySelector('#lessonSearch'); if(search) search.oninput=()=>filterLessons(search.value);
}
function filterLessons(q){
  q=q.trim().toLowerCase(); document.querySelectorAll('.lesson[data-search]').forEach(x=>x.hidden=q&&!x.dataset.search.includes(q));
  document.querySelectorAll('.module').forEach(m=>{ const visible=[...m.querySelectorAll('.lesson')].some(x=>!x.hidden); m.hidden=!visible; if(q&&visible)m.open=true; });
}
function sheet(content,{className=''}={}){
  const d=document.createElement('div'); d.className=`sheet ${className}`; d.innerHTML=`<div class="sheetpanel"><div class="handle"></div>${content}</div>`;
  d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]')) closeSheet(d);}); document.body.appendChild(d); return d;
}
function closeSheet(d){try{d?._practiceOnClose?.();}catch{}cleanupAudio();d?.remove();}
function closeAllSheets(){document.querySelectorAll('.sheet').forEach(x=>{try{x._practiceOnClose?.();}catch{}x.remove();});cleanupAudio();}
function nextReviewAt(rating,score){ let days=rating==='hard'?1:rating==='easy'?7:rating==='good'?3:2; if(score>=70)days*=2;if(score>=90)days*=2; return Date.now()+days*DAY; }
function recordPractice(l,rating,bpm,source='lesson',seconds=0,sessionId=null){
  const old=mastery(l.id), inc=rating==='easy'?20:rating==='good'?14:rating==='hard'?7:10, score=Math.min(100,Math.max(old.score||0,0)+inc);
  const m={...old,score,attempts:(old.attempts||0)+1,lastRating:rating||'neutral',lastAt:Date.now(),nextReview:nextReviewAt(rating,score)};
  if(bpm && ['good','easy'].includes(rating)) m.bestBpm=Math.max(old.bestBpm||0,bpm);
  state.mastery[l.id]=m; if(!state.completed[l.id]) state.completed[l.id]=Date.now();
  if(l.bpm){ const cur=bpm||state.bpm[l.id]||l.bpm; state.bpm[l.id]=rating==='easy'?Math.min(260,cur+5):rating==='hard'?Math.max(30,cur-5):cur; }
  if(seconds>=3)state.history.push({type:'practice',source,lessonId:l.id,sessionId,title:l.title,skill:l.skill,seconds,minutes:seconds/60,rating:rating||'neutral',bpm:bpm||null,completed:true,at:Date.now()});save();
}

function chordFrets(name){ return D.chords?.[name]||null; }
const STRING_LABELS=['E','A','D','G','B','e'];
const STRING_FREQS=[82.41,110,146.83,196,246.94,329.63];
const FINGER_NAMES=['','Zeigefinger','Mittelfinger','Ringfinger','kleiner Finger'];
const TEACH={
  hold:{
    why:'Bevor du Akkorde lernst, muss die Gitarre stabil liegen. Wenn du sie mit der Greifhand festhalten musst, können sich die Finger nicht frei bewegen.',
    explain:['Setz dich auf die vordere Hälfte eines stabilen Stuhls. Beide Füße stehen am Boden.','Der Korpus liegt am Körper. Die Gitarre bleibt stehen, auch wenn du die Greifhand kurz vom Hals nimmst.','Der Hals zeigt leicht nach oben. Zieh die Schulter der Greifhand nicht hoch.','Die sechs Saiten heißen von dick nach dünn: E – A – D – G – B – e.'],
    mistakes:[['Die Gitarre rutscht','Rücke den Korpus näher an den Körper und stütze ihn mit Unterarm/Oberschenkel – nicht mit der Greifhand.'],['Du siehst nur auf das Griffbrett','Kippe die Gitarre nicht stark zu dir. Kurze Blicke sind okay; dauerhaftes Verdrehen belastet Nacken und Handgelenk.'],['Die Schulter wird fest','Lass beide Schultern bewusst sinken. Der Ellbogen der Greifhand hängt locker.']],
    apply:'Stimme danach jede Saite mit dem Tuner. Sprich beim Anschlagen den Saitennamen laut mit.'
  },
  'pick-posture':{
    why:'Ein lockerer, reproduzierbarer Anschlag spart Kraft und ist die Grundlage für Rhythmus und späteres schnelles Picking.',
    explain:['Lege das Plektrum seitlich auf den Zeigefinger und den Daumen darüber.','Nur etwa 3–5 mm Spitze sollen herausstehen.','Halte es sicher, aber nicht so fest, dass Daumen oder Unterarm verkrampfen.','Schlage zunächst nur eine Saite an. Die Bewegung ist klein; das Plektrum darf leicht über die Saite gleiten.'],
    mistakes:[['Plektrum dreht sich ständig','Etwas weniger Spitze herausstehen lassen und Daumen flacher auflegen.'],['Sehr lautes Kratzen','Plektrum minimal schräg zur Saite stellen statt völlig senkrecht hindurchzudrücken.'],['Unterarm wird hart','Tempo reduzieren und zwischen zwei Anschlägen prüfen, ob Hand und Schulter locker sind.']],
    apply:'20 einzelne Downstrokes auf der tiefen E-Saite. Jeder Ton soll ähnlich laut klingen.'
  },
  firstnotes:{
    why:'Ein sauberer gegriffener Ton zeigt dir sofort, ob Fingerposition und Druck stimmen. Mehr Kraft ist fast nie die erste Lösung.',
    explain:['Setze die Fingerspitze knapp hinter das Bundstäbchen – auf der Seite Richtung Gitarrenkopf.','Drücke nur so stark, bis der Ton sauber klingt.','Der Finger steht möglichst auf der Spitze, damit Nachbarsaiten frei bleiben.','Spiele 0–1–3–1–0 auf der hohen e-Saite sehr langsam.'],
    mistakes:[['Ton schnarrt','Finger näher ans nächste Bundstäbchen setzen und erst dann minimal mehr Druck geben.'],['Ton ist dumpf','Prüfen, ob ein anderer Finger oder die Fingerfläche die Saite berührt.'],['Hand tut schnell weh','Daumen nicht gegen den Hals pressen. Kurz ausschütteln und mit weniger Kraft neu ansetzen.']],
    apply:'Spiele das TAB erst ohne Metronom dreimal sauber, dann bei 60 BPM.'
  },
  readingtab:{
    why:'TAB ist eine Landkarte für das Griffbrett: Sie zeigt dir Saite und Bund. Sie ersetzt das Hören nicht, macht neue Riffs aber schnell lesbar.',
    explain:['Die sechs Linien entsprechen den sechs Saiten. Die hohe e-Saite steht oben, die tiefe E-Saite unten.','Eine 0 bedeutet: Saite leer anschlagen. Eine 3 bedeutet: im 3. Bund greifen.','Lies von links nach rechts. Zahlen übereinander werden gleichzeitig gespielt.','Rhythmus steht in einfacher TAB oft nicht vollständig dabei – deshalb zuerst langsam hören/zählen.'],
    mistakes:[['Du spielst die falsche Saite','Merksatz: TAB schaust du an, als läge die Gitarre auf deinem Schoß – hohe Saite oben.'],['Du greifst auf dem Bundstäbchen','Die Zahl benennt den Bundraum; Finger knapp hinter das Metallstäbchen.']],
    apply:'Lies die Mini-TAB und sage vor jedem Ton erst Saite und Bund, dann spiele ihn.'
  },
  'count-quarters':{
    why:'Rhythmus beginnt mit einem gleichmäßigen Puls. Wenn der Puls stabil ist, werden Akkordwechsel und Strumming viel leichter.',
    explain:['Stell das Metronom auf 60 BPM. Jeder Klick ist eine Viertelnote.','Zähle laut: 1 – 2 – 3 – 4.','Schlage auf jedem Klick einmal nach unten.','Wenn du einen Fehler machst, nicht schneller werden – sofort wieder beim nächsten Klick einsteigen.'],
    mistakes:[['Du jagst dem Klick hinterher','Nur mitzählen, noch nicht spielen. Erst wenn das Zählen ruhig ist, die Hand dazunehmen.'],['Anschläge werden ungleich','Bewegung kleiner machen und jeden Downstroke aus derselben Ausgangshöhe beginnen.']],
    apply:'60 Sekunden ohne Unterbrechung bei 60 BPM.'
  },
  emin:{
    why:'Em und E sind ideale erste Akkorde: gleiche Grundform, kleine Änderung. Du lernst dabei direkt, Saiten einzeln auf Sauberkeit zu prüfen.',
    explain:['Em: Mittelfinger auf A-Saite, 2. Bund; Ringfinger auf D-Saite, 2. Bund. Alle sechs Saiten spielen.','E-Dur: Lass diese zwei Finger liegen und setze den Zeigefinger auf G-Saite, 1. Bund.','Greife zuerst, dann spiele jede Saite einzeln von tief E bis hoch e.','Erst wenn jede Saite klar klingt, den ganzen Akkord anschlagen.'],
    mistakes:[['G- oder hohe Saiten klingen dumpf','Finger auf A/D stärker auf die Fingerspitzen stellen.'],['A- oder D-Saite schnarrt','Finger näher ans Bundstäbchen, nicht automatisch fester drücken.'],['Wechsel zu E dauert lange','Em liegen lassen und nur den Zeigefinger ergänzen – keine Hand komplett neu bauen.']],
    apply:'5 saubere Em, 5 saubere E, dann 10 langsame Wechsel Em ↔ E.'
  },
  amin:{
    why:'Am und A trainieren einen kompakten Dreifinger-Griff und bereiten viele häufige Akkordwechsel vor.',
    explain:['Am: Zeigefinger B-Saite 1. Bund, Mittel D-Saite 2. Bund, Ring G-Saite 2. Bund. Ab A-Saite anschlagen.','A-Dur: drei Töne im 2. Bund auf D-, G- und B-Saite. Die tiefe E-Saite nicht anschlagen.','Prüfe bei beiden Akkorden jede Saite einzeln.','Vergleiche den Klang: Am wirkt dunkler; A-Dur heller/stabiler.'],
    mistakes:[['Hohe e-Saite ist stumm','Finger auf der B-Saite stärker aufrichten.'],['Tiefe E-Saite klingt mit','Anschlag bewusst an der A-Saite beginnen.']],
    apply:'Je 5 klare Akkorde. Danach Am ↔ A ohne Hast wechseln.'
  },
  dmajor:{
    why:'D-Dur bringt dir bei, gezielt nur einen Teil der Saiten anzuschlagen und die Finger eng zu platzieren.',
    explain:['Zeigefinger G-Saite 2. Bund, Ringfinger B-Saite 3. Bund, Mittelfinger hohe e-Saite 2. Bund.','Die D-Saite bleibt leer und ist der tiefste Ton. A- und tiefe E-Saite nicht anschlagen.','Finger wie ein kleines Dreieck aufstellen.','D, G, B, e einzeln prüfen, dann zusammen anschlagen.'],
    mistakes:[['Hohe e-Saite schnarrt','Mittelfinger näher an das Bundstäbchen.'],['B-Saite klingt dumpf','Ringfinger steiler stellen; nicht auf der hohen e-Saite liegen lassen.'],['Zu viele tiefe Saiten','Mit kleinerer Schlagbewegung bewusst auf der D-Saite starten.']],
    apply:'5 D-Dur-Akkorde, bei denen alle vier vorgesehenen Saiten klar klingen.'
  },
  'c-g':{
    why:'C und G öffnen dir sehr viele Songs. Sie sind weiter auseinander als Em/E – deshalb zählt hier ein ruhiger, geplanter Wechsel mehr als Geschwindigkeit.',
    explain:['C: Ringfinger A3, Mittelfinger D2, Zeigefinger B1; ab A-Saite spielen.','G: Mittelfinger tiefe E3, Zeigefinger A2, Ringfinger hohe e3 (später sind Varianten möglich).','Baue jeden Akkord einzeln sauber auf.','Beim Wechsel Finger gleichzeitig lösen und als Form zum Ziel bewegen – nicht Finger für Finger hektisch suchen.'],
    mistakes:[['C: hohe e-Saite dumpf','Zeigefinger auf B1 auf die Spitze stellen.'],['G: A-Saite dumpf','Zeigefinger A2 darf die D-Saite nicht berühren.'],['Wechsel stockt','Tempo komplett herausnehmen: greifen → prüfen → lösen → Zielbild vorstellen → greifen.']],
    apply:'Je 5 klare Akkorde. Danach 10 kontrollierte Wechsel C ↔ G.'
  },
  'chord-clean':{
    why:'Akkorde werden nicht durch stärkeres Drücken sauber, sondern durch Diagnose. Du lernst, die fehlerhafte Saite zu finden und gezielt zu korrigieren.',
    explain:['Akkord greifen.','Saiten einzeln von tief nach hoch anschlagen.','Bei der ersten unsauberen Saite stoppen.','Prüfen: Finger zu weit vom Bund? Nachbarfinger berührt die Saite? Falsche Saite angeschlagen?','Nur eine Sache verändern und erneut prüfen.'],
    mistakes:[['Alles klingt gleichzeitig schlecht','Akkord komplett lösen, Hand ausschütteln und langsam neu aufbauen.'],['Du weißt nicht, welcher Finger stört','Genau die dumpfe Saite beobachten: Welcher Finger berührt sie seitlich?']],
    apply:'Diagnostiziere Em, Am, D und C. Notiere mental bei jedem Akkord die häufigste Fehlerstelle.'
  }
};
function chordNamesFromLesson(l){
  const pool=Object.keys(D.chords||{}).sort((a,b)=>b.length-a.length);
  const txt=`${l.title||''} ${(l.goal||'')} ${(l.progression||[]).join(' ')}`;
  const fromText=pool.filter(n=>new RegExp(`(^|[^A-Za-z0-9#])${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^A-Za-z0-9#])`).test(txt));
  return [...new Set([...(l.progression||[]),...fromText])].slice(0,6);
}
function chordDiagramHTML(name){
  const f=chordFrets(name); if(!f)return '';
  const nums=f.filter(x=>typeof x==='number'&&x>0), base=nums.length?Math.max(1,Math.min(...nums)):1, max=Math.max(...nums,1);
  const start=max>4?base:1, rows=4;
  let dots='';
  f.forEach((v,string)=>{ if(typeof v==='number'&&v>0){const row=v-start+1;if(row>=1&&row<=rows)dots+=`<i class="cdot" style="--s:${string+1};--r:${row}">${v}</i>`;} });
  return `<div class="teachvisual chordteach"><div class="visualtitle">${esc(name)} greifen</div><div class="chordmini" role="img" aria-label="Akkorddiagramm ${esc(name)}"><div class="cmarks">${f.map(v=>`<span>${v==='x'?'×':v===0?'○':''}</span>`).join('')}</div><div class="cgrid">${Array.from({length:24},()=>'<span></span>').join('')}${dots}</div>${start>1?`<b class="basefret">${start}. Bund</b>`:''}</div><div class="tiny">${f.map((v,i)=>`${STRING_LABELS[i]}: ${v==='x'?'nicht spielen':v===0?'leer':v+'. Bund'}`).join(' · ')}</div></div>`;
}
function guitarAnatomy(){return `<div class="teachvisual"><div class="visualtitle">Orientierung an der Gitarre</div><svg class="guitar-svg" viewBox="0 0 620 220" role="img" aria-label="Vereinfachte Gitarre mit beschrifteten Teilen"><g fill="none" stroke="currentColor" stroke-width="4"><ellipse cx="440" cy="110" rx="95" ry="86"/><ellipse cx="505" cy="110" rx="72" ry="74"/><rect x="140" y="92" width="290" height="36" rx="12"/><path d="M40 75h100v70H40c-20-10-20-60 0-70z"/><circle cx="466" cy="110" r="25"/></g><g class="svglabel"><text x="28" y="55">Kopf</text><text x="180" y="72">Hals / Bünde</text><text x="425" y="30">Korpus</text><text x="450" y="158">Schallloch</text><text x="535" y="185">Steg</text></g></svg><div class="stringruler">${STRING_LABELS.map((x,i)=>`<button data-stringtone="${i}"><b>${x}</b><span>${i===0?'dick / tief':i===5?'dünn / hoch':''}</span></button>`).join('')}</div></div>`}
function pickVisual(){return `<div class="teachvisual"><div class="visualtitle">Plektrum: nur wenig Spitze</div><div class="pickdemo"><div class="thumb">Daumen</div><div class="pickshape">▲</div><div class="finger">Zeigefinger</div></div><div class="tiny">Etwa 3–5 mm Spitze reichen. Die Hand bleibt weich – das Plektrum wird gehalten, nicht zerquetscht.</div></div>`}
function fingerVisual(){return `<div class="teachvisual"><div class="visualtitle">Fingerposition im Bund</div><div class="fingerpos"><div class="badpos"><i></i><span>zu weit hinten → schnarrt leichter</span></div><div class="goodpos"><i></i><span>knapp hinter dem Bundstäbchen ✓</span></div></div></div>`}
function tabVisual(l){if(!l.tab)return '';return `<div class="teachvisual"><div class="visualtitle">TAB – von links nach rechts</div><pre class="tab">${esc(l.tab)}</pre><div class="tablegend"><span><b>0</b> leer</span><span><b>1</b> 1. Bund</span><span><b>3</b> 3. Bund</span></div></div>`}
function rhythmVisual(l){
 const title=(l.title+' '+l.goal).toLowerCase(); let patt='↓ ↓ ↓ ↓', count='1 2 3 4';
 if(title.includes('achtel')){patt='↓ ↑ ↓ ↑ ↓ ↑ ↓ ↑';count='1 + 2 + 3 + 4 +'}
 if(title.includes('d d u u d u')||title.includes('pattern')){patt='↓ ↓ ↑ · ↑ ↓ ↑';count='1 2 + 3 + 4 +'}
 return `<div class="teachvisual"><div class="visualtitle">Rhythmusbild</div><div class="rhythmcount">${count.split(' ').map(x=>`<span>${x}</span>`).join('')}</div><div class="rhythmarrows">${patt.split(' ').map(x=>`<span>${x}</span>`).join('')}</div><button class="secondary full" data-countdemo>▶ Puls hören</button></div>`;
}
function genericTeaching(l){
 const names=chordNamesFromLesson(l), skill=l.skill;
 let why=`Diese Einheit trainiert ${skill}. Entscheidend ist nicht, sie einmal abzuhaken, sondern die Bewegung kontrolliert und reproduzierbar auszuführen.`;
 let explain=[l.goal,`Starte deutlich langsamer als dein Maximaltempo. Qualität geht vor Geschwindigkeit.`,l.success];
 let mistakes=[['Du musst während der Übung ständig stoppen','Tempo oder Schwierigkeit reduzieren, bis mehrere Wiederholungen ohne Unterbrechung möglich sind.'],['Du wirst mit jedem Versuch verspannter','Kurz lösen, Hände ausschütteln und mit kleinerer Bewegung neu starten.'],['Es klappt einmal, danach nicht mehr','Noch nicht steigern. Erst mehrere reproduzierbare Durchgänge zählen als beherrscht.']];
 if(skill==='Chords') {why='Du lernst die Form nicht als Bild allein, sondern als Kombination aus Fingerposition, sauberen Einzelsaiten und effizienter Bewegung.'; explain=[l.goal,'Akkord langsam aufbauen und jede Saite einzeln prüfen.','Erst den ganzen Akkord anschlagen, wenn die Einzeltöne sauber sind.',l.success];}
 if(skill==='Chord Changes') {why='Schnelle Akkordwechsel entstehen aus kleinen, gleichzeitig geplanten Bewegungen – nicht aus hektischem Finger-für-Finger-Suchen.';explain=[l.goal,'Beide Formen zuerst einzeln sauber können.','Wechsel extrem langsam: lösen → Handform bewegen → gemeinsam aufsetzen.','Erst messen, wenn die Qualität stabil bleibt.',l.success];}
 if(skill==='Rhythm'||skill==='Groove') {why='Rhythmus ist kontinuierliche Bewegung über einem stabilen Puls. Ausgelassene Anschläge sind Pausen in der Bewegung, nicht ein Stopp der Hand.'; explain=[l.goal,'Pattern zunächst auf gedämpften Saiten spielen.','Laut mitzählen, dann Akkorde ergänzen.',l.success];}
 if(skill==='Scales'||skill==='Technique') {why='Technik wird besser, wenn Bewegung klein, locker und gleichmäßig bleibt. Tempo ist erst der letzte Schritt.';explain=[l.goal,'Bewegung langsam beobachten.','Nur so schnell spielen, dass jeder Ton kontrolliert klingt.',l.success];}
 if(skill==='Improvisation') {why='Improvisation ist nicht möglichst viele Noten spielen. Du lernst, kurze Ideen zu hören, zu wiederholen und gezielt zu verändern.';explain=[l.goal,'Mit 2–4 Noten beginnen.','Eine Phrase spielen, dann bewusst Luft lassen.','Motiv wiederholen und nur ein Detail verändern.',l.success];}
 if(skill==='Ear Training') {why='Gehörtraining verbindet das, was du hörst, mit dem Griffbrett. Erst hören und singen, dann suchen.';explain=[l.goal,'Ton oder Phrase mehrfach anhören.','Vor dem Greifen nachsingen oder summen.','Auf einer Saite suchen und Treffer direkt vergleichen.',l.success];}
 return {why,explain,mistakes,apply:l.success,names};
}
function teachingFor(l){ const sp=TEACH[l.id], g=genericTeaching(l); return sp?{...g,...sp,names:g.names}:g; }
function lessonVisuals(l){
 let out=''; const names=chordNamesFromLesson(l);
 if(l.id==='hold')out+=guitarAnatomy();
 if(l.id==='pick-posture')out+=pickVisual();
 if(l.id==='firstnotes'||l.skill==='Chords')out+=fingerVisual();
 if(names.length)out+=`<div class="visualstrip">${names.map(chordDiagramHTML).join('')}</div>`;
 out+=tabVisual(l);
 if(l.skill==='Rhythm'||l.skill==='Groove'||/strum|rhythm|viertel|achtel|6\/8|3\/4/i.test(l.title+' '+l.goal))out+=rhythmVisual(l);
 return out;
}
function lessonCourseMarkup(l,workBpm){ const t=teachingFor(l);
 return `<div class="teachnav" role="tablist"><button class="active" data-phase="understand">1 Verstehen</button><button data-phase="see">2 Sehen</button><button data-phase="do">3 Machen</button><button data-phase="fix">4 Fehlerhilfe</button><button data-phase="test">5 Test</button></div>
 <section class="teachphase active" data-phasepanel="understand"><div class="phaseeyebrow">WARUM DAS WICHTIG IST</div><p class="teachlead">${esc(t.why)}</p><div class="coachnote"><b>Dein Ziel</b><span>${esc(l.goal)}</span></div><button class="primary dark full" data-nextphase="see">Weiter: zeigen</button></section>
 <section class="teachphase" data-phasepanel="see"><div class="phaseeyebrow">ANSCHAUEN & HÖREN</div>${lessonVisuals(l)}<div class="stepstack">${t.explain.map((x,i)=>`<div class="teachstep"><b>${i+1}</b><span>${esc(x)}</span></div>`).join('')}</div>${l.bpm?`<div class="card toolbox"><div class="sub">Arbeits-Tempo</div><div class="bpm" id="lessonBpm">${workBpm}</div><div class="controls"><button class="roundbtn" data-bpm="-5">−5</button><button class="primary dark" data-mini-metro>♩ Start</button><button class="roundbtn" data-bpm="5">+5</button></div></div>`:''}<button class="primary dark full" data-nextphase="do">Jetzt nachmachen</button></section>
 <section class="teachphase" data-phasepanel="do"><div class="phaseeyebrow">GEFÜHRTE ÜBUNG</div><div class="card livepractice"><div class="tiny">ECHTE AKTIVE ZEIT</div><div class="bpm timerdisplay" data-active-time>0:00</div><button class="primary dark full" data-track-toggle>▶ Übung starten</button></div><div class="practicecheck">${t.explain.map((x,i)=>`<label><input type="checkbox" data-checkstep><span><b>${i+1}.</b> ${esc(x)}</span></label>`).join('')}</div><div class="coachnote"><b>Anwendung</b><span>${esc(t.apply||l.success)}</span></div>${(t.names||[]).length?`<button class="secondary full" data-arpeggio="${esc(t.names[0])}">🔊 ${esc(t.names[0])} langsam anhören</button>`:''}<button class="primary dark full" data-nextphase="fix">Wenn etwas nicht klappt → Fehlerhilfe</button></section>
 <section class="teachphase" data-phasepanel="fix"><div class="phaseeyebrow">FEHLER SELBST BEHEBEN</div><div class="diagnostics">${t.mistakes.map(([a,b])=>`<details><summary>${esc(a)}</summary><p>${esc(b)}</p></details>`).join('')}</div><div class="coachnote"><b>Regel</b><span>Ändere immer nur eine Sache und höre danach erneut. So weißt du, was tatsächlich geholfen hat.</span></div><button class="primary dark full" data-nextphase="test">Weiter zum Test</button></section>
 <section class="teachphase" data-phasepanel="test"><div class="phaseeyebrow">KANN ICH ES WIRKLICH?</div><div class="success"><strong>Bestehens-Kriterium</strong><div class="goal">${esc(l.success)}</div></div><div class="selftest"><label><input type="checkbox" data-testcheck><span>Ich kann erklären, was ich tun soll.</span></label><label><input type="checkbox" data-testcheck><span>Ich kann es ohne die Schritt-für-Schritt-Liste ausführen.</span></label><label><input type="checkbox" data-testcheck><span>Ich erkenne mindestens einen typischen Fehler und weiß, wie ich ihn korrigiere.</span></label></div><div class="ratinglabel">Wie sicher war dieser Durchgang?</div><div class="rating"><button class="hard" data-rate="hard">Schwer</button><button class="good" data-rate="good">Gut</button><button class="easy" data-rate="easy">Sicher</button></div><button class="primary dark full finishbtn" data-complete disabled>Durchgang abschließen</button><div class="tiny testhint">Zum Abschließen: drei Selbstchecks markieren und eine Bewertung wählen.</div></section>`;
}
function bindTeaching(s,l,id,opts,getBpm,setBpm,getRating,setRating){
 const show=phase=>{s.querySelectorAll('[data-phasepanel]').forEach(x=>x.classList.toggle('active',x.dataset.phasepanel===phase));s.querySelectorAll('[data-phase]').forEach(x=>x.classList.toggle('active',x.dataset.phase===phase));s.querySelector('.sheetpanel')?.scrollTo({top:0,behavior:'smooth'});};
 s.querySelectorAll('[data-phase],[data-nextphase]').forEach(b=>b.onclick=()=>show(b.dataset.phase||b.dataset.nextphase));
 s.querySelector('[data-track-toggle]')?.addEventListener('click',()=>{if(!activePractice)trackerStart({source:opts.sessionId?'session':'lesson',lessonId:id,sessionId:opts.sessionId||null,title:l.title,skill:l.skill});else trackerToggle();paintTracker();});
 s.querySelectorAll('[data-stringtone]').forEach(b=>b.onclick=()=>playTone(STRING_FREQS[+b.dataset.stringtone],.8));
 s.querySelector('[data-countdemo]')?.addEventListener('click',e=>{let n=0;const btn=e.currentTarget;btn.disabled=true;const ctx=ensureAudio();const tick=()=>{scheduleClick(ctx.currentTime,n===0);n++;if(n<8)setTimeout(tick,500);else setTimeout(()=>btn.disabled=false,500)};tick();});
 s.querySelector('[data-arpeggio]')?.addEventListener('click',e=>playChordArpeggio(e.currentTarget.dataset.arpeggio));
 s.querySelectorAll('[data-bpm]').forEach(b=>b.onclick=()=>{let bpm=Math.max(30,Math.min(260,getBpm()+Number(b.dataset.bpm)));setBpm(bpm);state.bpm[id]=bpm;save();s.querySelector('#lessonBpm').textContent=bpm;if(metro)startMetronome({bpm,beats:4,subdivision:1});});
 s.querySelector('[data-mini-metro]')?.addEventListener('click',e=>toggleSimpleMetro(getBpm(),e.currentTarget));
 const updateFinish=()=>{const tests=[...s.querySelectorAll('[data-testcheck]')],ok=tests.length&&tests.every(x=>x.checked)&&!!getRating();s.querySelector('[data-complete]').disabled=!ok;};
 s.querySelectorAll('[data-testcheck]').forEach(x=>x.onchange=updateFinish);
 s.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>{setRating(b.dataset.rate);s.querySelectorAll('[data-rate]').forEach(x=>x.classList.toggle('selected',x===b));updateFinish();});
}
function playChordArpeggio(name){const f=chordFrets(name);if(!f)return;const openMidi=[40,45,50,55,59,64],ctx=ensureAudio();let delay=0;f.forEach((v,i)=>{if(typeof v==='number'){const midi=openMidi[i]+v,freq=440*Math.pow(2,(midi-69)/12);setTimeout(()=>playTone(freq,.75),delay);delay+=330;}});}
function openLesson(id,opts={}){
  const l=lessonById(id); if(!l)return; let workBpm=state.bpm[id]||l.bpm||60, selectedRating=null;
  const s=sheet(`<div class="sheethead"><div><div class="biglabel">${esc(l.levelTitle)} · ${esc(l.skill)} · ${l.minutes} min</div><h2>${esc(l.title)}</h2></div><button class="close" data-close aria-label="Schließen">×</button></div><div class="lessonview">${lessonCourseMarkup(l,workBpm)}</div>`);
  bindTeaching(s,l,id,opts,()=>workBpm,v=>workBpm=v,()=>selectedRating,v=>selectedRating=v);s._practiceOnClose=()=>{if(activePractice?.lessonId===id)trackerStop({saveEntry:true,rating:selectedRating||'neutral',bpm:workBpm,completed:false});};
  s.querySelector('[data-complete]').onclick=()=>{
    if(!selectedRating)return;const actualSec=(activePractice?.lessonId===id)?trackerStop({saveEntry:false}):0;recordPractice(l,selectedRating,workBpm,opts.sessionId?'session':'lesson',actualSec,opts.sessionId||null);
    if(opts.sessionId && state.activeSession?.id===opts.sessionId){ const item=state.activeSession.items.find(x=>x.id===id); if(item){item.done=true;item.rating=selectedRating||'neutral';item.doneAt=Date.now();} save(); opts.parentSheet && updateSessionSheet(opts.parentSheet); }
    closeSheet(s); render();
  };
}

function createSession(){const xs=buildSession();return {id:`session-${Date.now()}`,startedAt:Date.now(),items:xs.map(x=>({id:x.id,done:false}))};}
function openSession(){if(!state.activeSession?.items?.length){state.activeSession=createSession();save();}const as=state.activeSession,s=sheet(sessionMarkup(as));bindSessionSheet(s);}
function sessionMarkup(as){const done=as.items.filter(x=>x.done).length,planned=as.items.reduce((a,i)=>a+(P.find(x=>x.id===i.id)?.minutes||0),0),actual=sessionActualSeconds(as.id);return `<div class="sheethead"><div><div class="biglabel">Heute · tatsächlich ${fmtSecs(actual)}</div><h2>Deine Practice Session</h2><div class="sub">${done}/${as.items.length} abgeschlossen · Richtwert ca. ${planned} min</div></div><button class="close" data-close>×</button></div><div class="card coachnote"><b>Ist statt Soll</b><span>Nur aktive Zeit in gestarteten Übungen zählt. Hintergrundzeit wird automatisch pausiert.</span></div><div class="card sessionlist">${as.items.map((it,i)=>{const x=P.find(v=>v.id===it.id);return `<button class="sessionitem ${it.done?'done':''}" data-sessionpractice="${it.id}"><div class="num">${it.done?'✓':i+1}</div><div class="grow left"><div class="title">${esc(x?.title||it.id)}</div><div class="sub">${esc(x?.category||'')} · Richtwert ${x?.minutes||0} min${it.done?` · tatsächlich ${fmtSecs(it.actualSec||0)}`:''}</div></div><span>›</span></button>`}).join('')}</div><button class="primary dark full" data-finishsession>${done===as.items.length?'Session abschließen':`Session beenden (${done}/${as.items.length})`}</button><button class="secondary full dangertext" data-discardsession>Session verwerfen</button>`;}
function bindSessionSheet(s){s.querySelectorAll('[data-sessionpractice]').forEach(x=>x.onclick=()=>openPracticeExercise(x.dataset.sessionpractice,{sessionId:state.activeSession.id,parentSheet:s}));s.querySelector('[data-finishsession]').onclick=()=>finishSession(s);s.querySelector('[data-discardsession]').onclick=()=>{if(confirm('Angefangene Session wirklich verwerfen? Bereits gemessene Übungszeit bleibt im Verlauf erhalten.')){state.activeSession=null;save();closeSheet(s);render();}};}
function updateSessionSheet(s){if(!document.body.contains(s)||!state.activeSession)return;s.querySelector('.sheetpanel').innerHTML=`<div class="handle"></div>${sessionMarkup(state.activeSession)}`;bindSessionSheet(s);}
function finishSession(s){const as=state.activeSession;if(!as)return;const doneItems=as.items.filter(x=>x.done),seconds=sessionActualSeconds(as.id);if(seconds<3){alert('Starte mindestens eine Übung, damit echte Practice-Zeit erfasst wird.');return;}state.sessions.push({id:as.id,startedAt:as.startedAt,endedAt:Date.now(),plannedMinutes:as.items.reduce((a,i)=>a+(P.find(x=>x.id===i.id)?.minutes||0),0),completed:doneItems.length,seconds,minutes:seconds/60});state.activeSession=null;save();closeSheet(s);render();openSessionSummary(doneItems,seconds);}
function openSessionSummary(items,seconds){const cats={};items.forEach(i=>{const x=P.find(v=>v.id===i.id);if(x)cats[x.category]=(cats[x.category]||0)+(i.actualSec||0);});const detail=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="historyrow"><span>${esc(k)}</span><strong>${fmtSecs(v)}</strong></div>`).join('');sheet(`<div class="sheethead"><div><div class="biglabel">Session complete</div><h2>${fmtSecs(seconds)} tatsächlich gespielt.</h2></div><button class="close" data-close>×</button></div><div class="stats"><div class="stat"><strong>${items.length}</strong><span>Übungen</span></div><div class="stat"><strong>${fmtSecs(seconds)}</strong><span>aktive Zeit</span></div><div class="stat"><strong>${stats().streak}🔥</strong><span>Streak</span></div></div>${detail?`<div class="card">${detail}</div>`:''}<div class="card coachnote"><b>Nächste Session</b><span>${esc(sessionTipText())}</span></div>`);}

function openSettings(){
  const standalone=window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const s=sheet(`<div class="sheethead"><div><div class="biglabel">Profil & App</div><h2>Practice Setup</h2></div><button class="close" data-close>×</button></div>
  <div class="card formcard"><label>Instrument</label><div class="seg"><button data-inst="electric">E-Gitarre</button><button data-inst="acoustic">Akustik</button><button data-inst="both">Beides</button></div><label>Ziel</label><select class="input" id="goal"><option value="allround">Allround</option><option value="songs">Songs & Begleitung</option><option value="lead">Lead & Improvisation</option><option value="fingerstyle">Fingerstyle</option><option value="musicianship">Theorie & Musicianship</option></select><label>Übungszeit</label><select class="input" id="mins">${[10,15,20,30,45,60,90].map(v=>`<option>${v}</option>`).join('')}</select><label>Aktuelles Level</label><select class="input" id="level">${D.levels.map(l=>`<option value="${l.id}">${l.title}</option>`).join('')}</select><label>Standard-Stimmung</label><select class="input" id="tuning">${Object.entries(D.tunings).map(([k,v])=>`<option value="${k}">${v.title}</option>`).join('')}</select><label>Darstellung</label><select class="input" id="theme"><option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option></select><button class="primary dark full" data-save-settings>Speichern</button></div>
  <div class="card stack"><div class="title">Backup & Wiederherstellung</div><button class="secondary full" data-export>Backup exportieren</button><label class="secondary full filelabel">Backup importieren<input hidden type="file" accept="application/json,.json" data-import></label></div>
  <div class="card stack"><div class="title">Installation</div><div class="tiny">${standalone?'PLAY. läuft bereits als installierte Web-App.':'Auf iPhone/iPad: Teilen → „Zum Home-Bildschirm“. In unterstützten Browsern kann PLAY. auch direkt installiert werden.'}</div>${!standalone?`<button class="secondary full" data-install>App installieren</button>`:''}</div>
  <div class="card stack dangerzone"><div class="title">Daten</div><button class="secondary full" data-reset>Fortschritt zurücksetzen</button></div>`);
  s.querySelector('#mins').value=state.profile.minutes;s.querySelector('#level').value=state.level;s.querySelector('#goal').value=state.profile.goal;s.querySelector('#theme').value=state.profile.theme;s.querySelector('#tuning').value=state.profile.tuning;
  let tempInstrument=state.profile.instrument;
  s.querySelectorAll('[data-inst]').forEach(b=>{b.classList.toggle('active',b.dataset.inst===tempInstrument);b.onclick=()=>{tempInstrument=b.dataset.inst;s.querySelectorAll('[data-inst]').forEach(x=>x.classList.toggle('active',x===b));};});
  s.querySelector('[data-save-settings]').onclick=()=>{state.profile.instrument=tempInstrument;state.profile.minutes=+s.querySelector('#mins').value;state.level=s.querySelector('#level').value;state.profile.level=state.level;state.profile.goal=s.querySelector('#goal').value;state.profile.theme=s.querySelector('#theme').value;state.profile.tuning=s.querySelector('#tuning').value;save();closeSheet(s);render();};
  s.querySelector('[data-export]').onclick=exportBackup; s.querySelector('[data-import]').onchange=e=>importBackup(e.target.files?.[0],s);
  s.querySelector('[data-install]')?.addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;}else alert('Auf iPhone/iPad öffne das Teilen-Menü in Safari und wähle „Zum Home-Bildschirm“.');});
  s.querySelector('[data-reset]').onclick=()=>{if(confirm('Wirklich alle Fortschrittsdaten, eigenen Übungen und Sessions löschen?')){state={...clone(defaults),onboarding:true};save();closeSheet(s);render();}};
}
async function exportBackup(){
  const blob=new Blob([JSON.stringify({app:'PLAY. Guitar',version:2,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'}); const file=new File([blob],`PLAY-Guitar-Backup-${localDateKey()}.json`,{type:'application/json'});
  try{ if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'PLAY. Guitar Backup'});return;} }catch{}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
async function importBackup(file,sheetEl){ if(!file)return; try{const obj=JSON.parse(await file.text());let incoming=obj.state||obj;if(!incoming||typeof incoming!=='object'||!incoming.profile)throw new Error();if(incoming.schema!==2)incoming=migrateV1(incoming); if(!confirm('Backup importieren und aktuelle App-Daten ersetzen?'))return; localStorage.setItem(STORAGE,JSON.stringify(incoming));state=loadState();closeSheet(sheetEl);render();alert('Backup erfolgreich importiert.');}catch{alert('Diese Datei ist kein gültiges PLAY.-Backup.');} }
function openOnboarding(){
  const s=sheet(`<div class="sheethead"><div><div class="biglabel">Willkommen bei PLAY.</div><h2>Dein Gitarrenweg.</h2></div></div><p class="goal">Wähle kurz deinen Ausgangspunkt. Daraus entstehen Lernpfad und tägliche Sessions.</p><div class="card formcard"><label>Instrument</label><div class="seg"><button data-inst="electric" class="active">E-Gitarre</button><button data-inst="acoustic">Akustik</button><button data-inst="both">Beides</button></div><label>Erfahrung</label><select class="input" id="on-level"><option value="foundation">Noch ganz am Anfang</option><option value="beginner">Grundakkorde vorhanden</option><option value="intermediate">Schon sicherer Spieler</option><option value="advanced">Fortgeschritten</option><option value="mastery">Sehr erfahren</option></select><label>Hauptziel</label><select class="input" id="on-goal"><option value="allround">Allround spielen</option><option value="songs">Songs & Begleitung</option><option value="lead">Lead & Improvisation</option><option value="fingerstyle">Fingerstyle</option><option value="musicianship">Theorie & Musicianship</option></select><label>Zeit pro Session</label><select class="input" id="on-mins"><option>10</option><option>15</option><option selected>20</option><option>30</option><option>45</option><option>60</option></select><button class="primary dark full" data-start>PLAY.</button></div>`);
  s.querySelectorAll('[data-inst]').forEach(b=>b.onclick=()=>{state.profile.instrument=b.dataset.inst;s.querySelectorAll('[data-inst]').forEach(x=>x.classList.toggle('active',x===b));});
  s.querySelector('[data-start]').onclick=()=>{state.level=s.querySelector('#on-level').value;state.profile.level=state.level;state.profile.goal=s.querySelector('#on-goal').value;state.profile.minutes=+s.querySelector('#on-mins').value;state.onboarding=true;save();closeSheet(s);render();};
}
function editCustom(id){
  const existing=state.customExercises.find(x=>x.id===id); const s=sheet(`<div class="sheethead"><h2>${existing?'Übung bearbeiten':'Eigene Übung'}</h2><button class="close" data-close>×</button></div><div class="card formcard"><label>Name</label><input class="input" id="ct" placeholder="z. B. Solo Takt 17–20" value="${esc(existing?.title||'')}"><label>Skill</label><input class="input" id="cs" placeholder="z. B. Lead" value="${esc(existing?.skill||'Eigene Übung')}"><label>Dauer</label><select class="input" id="cm">${[5,10,15,20,30,45].map(v=>`<option ${existing?.minutes===v?'selected':''}>${v}</option>`).join('')}</select><label>BPM (optional)</label><input class="input" id="cb" type="number" min="30" max="260" placeholder="z. B. 80" value="${existing?.bpm||''}"><label>Notiz / Ziel</label><textarea class="input textarea" id="cn" placeholder="Was genau soll besser werden?">${esc(existing?.notes||'')}</textarea><button class="primary dark full" data-savecustom>Speichern</button>${existing?'<button class="secondary full dangertext" data-deletecustom>Löschen</button>':''}</div>`);
  s.querySelector('[data-savecustom]').onclick=()=>{const title=s.querySelector('#ct').value.trim();if(!title)return;const item={id:existing?.id||`custom-${Date.now()}`,title,skill:s.querySelector('#cs').value.trim()||'Eigene Übung',minutes:+s.querySelector('#cm').value,bpm:+s.querySelector('#cb').value||null,notes:s.querySelector('#cn').value.trim()};if(existing)Object.assign(existing,item);else state.customExercises.push(item);save();closeSheet(s);render();};
  s.querySelector('[data-deletecustom]')?.addEventListener('click',()=>{if(confirm('Übung löschen?')){state.customExercises=state.customExercises.filter(x=>x.id!==existing.id);save();closeSheet(s);render();}});
}
function openCustom(id){
 const x=state.customExercises.find(v=>v.id===id);if(!x)return;let rating=null,bpm=x.bpm||null,started=false;const s=sheet(`<div class="sheethead"><div><div class="biglabel">Eigene Übung</div><h2>${esc(x.title)}</h2></div><button class="close" data-close>×</button></div><p class="goal">${esc(x.notes||'Konzentriert üben und anschließend bewerten.')}</p><div class="card livepractice"><div class="tiny">ECHTE AKTIVE ZEIT</div><div class="bpm timerdisplay" data-active-time>0:00</div><button class="primary dark full" data-track-toggle>▶ Übung starten</button></div>${bpm?`<div class="card toolbox"><div class="bpm" id="custombpm">${bpm}</div><div class="controls"><button class="roundbtn" data-cbpm="-5">−5</button><button class="primary dark" data-custommetro>♩ Start</button><button class="roundbtn" data-cbpm="5">+5</button></div></div>`:''}<div class="rating"><button class="hard" data-rate="hard">Schwer</button><button class="good" data-rate="good">Gut</button><button class="easy" data-rate="easy">Leicht</button></div><button class="primary dark full" data-finishcustom disabled>Durchgang speichern</button>`);
 s.querySelector('[data-track-toggle]').onclick=()=>{if(!started){started=true;trackerStart({source:'custom',customId:x.id,title:x.title,skill:x.skill});s.querySelector('[data-finishcustom]').disabled=false;}else trackerToggle();paintTracker();};s.querySelectorAll('[data-cbpm]').forEach(b=>b.onclick=()=>{bpm=Math.max(30,Math.min(260,bpm+Number(b.dataset.cbpm)));s.querySelector('#custombpm').textContent=bpm;});s.querySelector('[data-custommetro]')?.addEventListener('click',e=>toggleSimpleMetro(bpm,e.currentTarget));s.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>{rating=b.dataset.rate;s.querySelectorAll('[data-rate]').forEach(y=>y.classList.toggle('selected',y===b));});s.querySelector('[data-finishcustom]').onclick=()=>{trackerStop({saveEntry:true,rating:rating||'neutral',bpm,completed:true});if(bpm&&rating==='easy')x.bpm=bpm+5;else if(bpm&&rating==='hard')x.bpm=Math.max(30,bpm-5);save();closeSheet(s);render();};s._practiceOnClose=()=>{if(activePractice?.customId===x.id)trackerStop({saveEntry:true,rating:rating||'neutral',bpm,completed:false});};
}
function openSong(id){
 const song=songById(id);if(!song)return;let bpm=song.bpm,section='all',running=false,chordIndex=0,started=false;const s=sheet(songMarkup(song,bpm,section));
 const rebind=()=>{s.querySelectorAll('[data-songbpm]').forEach(b=>b.onclick=()=>{bpm=Math.max(40,Math.min(220,bpm+Number(b.dataset.songbpm)));s.querySelector('#songbpm').textContent=bpm;if(running){stopSongLoop();start();}});s.querySelector('#songsection').onchange=e=>{section=e.target.value;chordIndex=0;};s.querySelector('[data-songplay]').onclick=e=>{running=!running;if(running){if(!started){started=true;trackerStart({source:'song',title:song.title,skill:'Song'});}else if(activePractice&&!activePractice.running)trackerResume();e.currentTarget.textContent='■ Stop';start();}else{e.currentTarget.textContent='▶ Loop starten';stopSongLoop();trackerPause();}};s.querySelector('[data-songpractice]').onclick=()=>{trackerStop({saveEntry:true,rating:'neutral',bpm,completed:true});save();closeSheet(s);render();};};
 function start(){const seq=getSongSequence(song,section);if(!seq.length)return;stopSongLoop();chordIndex=0;highlightChord();startMetronome({bpm,beats:Number(song.meter.split('/')[0])||4,subdivision:1});const beatMs=60000/bpm,beats=Number(song.meter.split('/')[0])||4;songTicker=setInterval(()=>{chordIndex=(chordIndex+1)%seq.length;highlightChord();},beatMs*beats);}
 function highlightChord(){const seq=getSongSequence(song,section);s.querySelector('#currentChord').textContent=seq[chordIndex]||'–';}
 s._practiceOnClose=()=>{if(activePractice?.source==='song'&&activePractice?.title===song.title)trackerStop({saveEntry:true,rating:'neutral',bpm,completed:false});};rebind();
}
function getSongSequence(song,section){ if(section==='all')return song.sections.flatMap(x=>x[1]); const sec=song.sections.find(x=>x[0]===section);return sec?sec[1]:song.progression; }
function songMarkup(song,bpm,section){ return `<div class="sheethead"><div><div class="biglabel">${esc(song.style)} · ${song.key} · ${song.meter}</div><h2>${esc(song.title)}</h2></div><button class="close" data-close>×</button></div><p class="goal">${esc(song.goal)}</p><div class="card songplayer"><div class="tiny">Aktueller Akkord</div><div class="currentchord" id="currentChord">${esc(song.progression[0])}</div><div class="bpm smallbpm" id="songbpm">${bpm}</div><div class="controls"><button class="roundbtn" data-songbpm="-5">−5</button><button class="primary dark" data-songplay>▶ Loop starten</button><button class="roundbtn" data-songbpm="5">+5</button></div><select class="input" id="songsection"><option value="all">Ganzes Stück</option>${song.sections.map(x=>`<option value="${esc(x[0])}">${esc(x[0])}</option>`).join('')}</select></div><div class="card">${song.sections.map(([name,chords])=>`<div class="songsection"><strong>${esc(name)}</strong><div class="chiprow">${chords.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}</div></div>`).join('')}</div><div class="card livepractice"><div class="tiny">ECHTE LOOP-ZEIT</div><div class="bpm timerdisplay" data-active-time>0:00</div></div><button class="primary dark full" data-songpractice>Practice speichern & schließen</button>`; }
function stopSongLoop(){ if(songTicker){clearInterval(songTicker);songTicker=null;}stopMetronome(); }
function openTool(id){ const map={metronome:metronomeTool,tuner:tunerTool,tempo:tempoTool,chords:chordsTool,scales:scalesTool,fretboard:fretboardTool,changes:changesTool,ear:earTool,timer:timerTool,jam:jamTool}; map[id]?.(); }
function ensureAudio(){ if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx; }
function scheduleClick(time,accent=false,sub=false){ const ctx=ensureAudio(),o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=accent?1350:sub?650:900;g.gain.setValueAtTime(accent ? .16 : .09,time);g.gain.exponentialRampToValueAtTime(.001,time+.045);o.connect(g);g.connect(ctx.destination);o.start(time);o.stop(time+.05); }
function startMetronome({bpm=80,beats=4,subdivision=1,pulse=null,beatDisplay=null,accent=true}={}){
  stopMetronome(); const ctx=ensureAudio(); metro={bpm,beats,subdivision,pulse,beatDisplay,accent,next:ctx.currentTime+.05,count:0,timer:null};
  const seconds=60/bpm/subdivision;
  const scheduler=()=>{if(!metro)return;while(metro.next<ctx.currentTime+.12){const fullBeat=metro.count%subdivision===0,beatNo=Math.floor(metro.count/subdivision)%beats,isAccent=accent&&fullBeat&&beatNo===0;scheduleClick(metro.next,isAccent,!fullBeat);const delay=Math.max(0,(metro.next-ctx.currentTime)*1000);setTimeout(()=>{if(!metro)return;if(fullBeat&&pulse){pulse.classList.add('flash');setTimeout(()=>pulse.classList.remove('flash'),70);}if(fullBeat&&beatDisplay)beatDisplay.textContent=String(beatNo+1);},delay);metro.next+=seconds;metro.count++;} }; scheduler();metro.timer=setInterval(scheduler,25);
}
function stopMetronome(){ if(metro?.timer)clearInterval(metro.timer);metro=null; }
function toggleSimpleMetro(bpm,btn){ if(metro){stopMetronome();btn.textContent='♩ Start';}else{startMetronome({bpm,beats:4});btn.textContent='■ Stop';} }
function metronomeTool(){
  let bpm=80,beats=4,sub=1,taps=[]; const s=sheet(`<div class="sheethead"><h2>Metronom</h2><button class="close" data-close>×</button></div><div class="card toolbox"><div class="pulse" id="pulse"><span id="beatNo">1</span></div><div class="bpm" id="bpm">80</div><div class="sub">BPM</div><div class="controls"><button class="roundbtn" data-m="-5">−5</button><button class="primary dark" id="mstart">Start</button><button class="roundbtn" data-m="5">+5</button></div><div class="metaset"><label>Takt<select class="input" id="beats">${[2,3,4,5,6,7,8,9,12].map(v=>`<option ${v===4?'selected':''}>${v}</option>`).join('')}</select></label><label>Unterteilung<select class="input" id="sub"><option value="1">Viertel</option><option value="2">Achtel</option><option value="3">Triolen</option><option value="4">16tel</option></select></label></div><button class="secondary full" id="tap">Tap Tempo</button></div>`);
  const restart=()=>{if(metro)startMetronome({bpm,beats,subdivision:sub,pulse:s.querySelector('#pulse'),beatDisplay:s.querySelector('#beatNo')});};
  s.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{bpm=Math.max(30,Math.min(260,bpm+Number(b.dataset.m)));s.querySelector('#bpm').textContent=bpm;restart();});s.querySelector('#beats').onchange=e=>{beats=+e.target.value;restart();};s.querySelector('#sub').onchange=e=>{sub=+e.target.value;restart();};s.querySelector('#mstart').onclick=e=>{if(metro){stopMetronome();e.currentTarget.textContent='Start';}else{startMetronome({bpm,beats,subdivision:sub,pulse:s.querySelector('#pulse'),beatDisplay:s.querySelector('#beatNo')});e.currentTarget.textContent='Stop';}};
  s.querySelector('#tap').onclick=()=>{const n=performance.now();taps=taps.filter(x=>n-x<2500);taps.push(n);if(taps.length>=2){const ds=taps.slice(1).map((x,i)=>x-taps[i]),avg=ds.reduce((a,x)=>a+x,0)/ds.length;bpm=Math.round(Math.max(30,Math.min(260,60000/avg)));s.querySelector('#bpm').textContent=bpm;restart();}};
}
function tempoTool(){
  let start=60,bpm=60,target=100,step=5,needed=3,clean=0,running=false; const s=sheet(`<div class="sheethead"><h2>Tempo Trainer</h2><button class="close" data-close>×</button></div><div class="card toolbox"><div class="tiny">Aktuell</div><div class="bpm" id="tbpm">60</div><div class="progress"><i id="tprog" style="width:0%"></i></div><div class="metaset"><label>Start<input class="input" id="tstartb" type="number" value="60" min="30" max="240"></label><label>Ziel<input class="input" id="ttarget" type="number" value="100" min="30" max="260"></label><label>Schritt<select class="input" id="tstep"><option>2</option><option selected>5</option><option>10</option></select></label><label>Saubere Runden<select class="input" id="tneeded"><option>1</option><option selected>3</option><option>5</option></select></label></div><div class="controls"><button class="primary dark" id="tmetro">♩ Start</button></div><button class="secondary full" id="clean">✓ Sauber · 0/3</button><button class="secondary full" id="miss">↶ Fehler · Zähler zurück</button></div>`);
  const draw=()=>{s.querySelector('#tbpm').textContent=bpm;s.querySelector('#clean').textContent=`✓ Sauber · ${clean}/${needed}`;s.querySelector('#tprog').style.width=`${Math.max(0,Math.min(100,(bpm-start)/Math.max(1,target-start)*100))}%`;};
  const sync=()=>{start=+s.querySelector('#tstartb').value||60;target=Math.max(start,+s.querySelector('#ttarget').value||100);step=+s.querySelector('#tstep').value;needed=+s.querySelector('#tneeded').value;if(!running)bpm=start;draw();};['#tstartb','#ttarget','#tstep','#tneeded'].forEach(q=>s.querySelector(q).onchange=sync);s.querySelector('#tmetro').onclick=e=>{running=!running;if(running){startMetronome({bpm,beats:4});e.currentTarget.textContent='■ Stop';}else{stopMetronome();e.currentTarget.textContent='♩ Start';}};s.querySelector('#clean').onclick=()=>{clean++;if(clean>=needed&&bpm<target){clean=0;bpm=Math.min(target,bpm+step);if(running)startMetronome({bpm,beats:4});}draw();};s.querySelector('#miss').onclick=()=>{clean=0;draw();};draw();
}
function chordDiagram(name){
  const f=D.chords[name]; if(!f)return '';
  const frets=f.filter(v=>typeof v==='number'&&v>0), max=Math.max(0,...frets), min=Math.min(...frets,1);
  const base=max>5?min:1, rel=v=>typeof v==='number'&&v>0?Math.max(1,Math.min(5,v-base+1)):null;
  const marks=f.map((v,i)=>`<div class="stringmark" style="grid-column:${i+1}">${v==='x'?'×':v===0?'○':`<span>${v}</span>`}</div>`).join('');
  return `<div class="chorddiagram">${base>1?`<div class="basefret">Bund ${base}</div>`:''}<div class="stringmarks">${marks}</div><div class="fretlines">${[1,2,3,4,5].map(r=>`<div class="fretline" style="grid-row:${r}"></div>`).join('')}${f.map((v,i)=>rel(v)?`<i class="dot" style="grid-column:${i+1};grid-row:${rel(v)}">${v}</i>`:'').join('')}</div><div class="strings">${[1,2,3,4,5,6].map(()=>'<i></i>').join('')}</div></div>`;
}
function chordsTool(){
  const names=Object.keys(D.chords);let current='C';const s=sheet(`<div class="sheethead"><h2>Chord Library</h2><button class="close" data-close>×</button></div><input class="input" id="chordsearch" type="search" placeholder="Akkord suchen …"><div class="chiprow chordchips">${names.map(n=>`<button class="chip ${n===current?'active':''}" data-chord="${esc(n)}">${esc(n)}</button>`).join('')}</div><div class="card toolbox" id="chordview"><div class="bpm smallbpm" id="cname">C</div>${chordDiagram('C')}<div class="tiny">Von tiefer E-Saite links bis hoher e-Saite rechts. × = nicht spielen, ○ = leer.</div></div>`);
  const bindCh=()=>s.querySelectorAll('[data-chord]').forEach(b=>b.onclick=()=>{current=b.dataset.chord;s.querySelectorAll('[data-chord]').forEach(x=>x.classList.toggle('active',x===b));s.querySelector('#cname').textContent=current;s.querySelector('.chorddiagram').outerHTML=chordDiagram(current);});bindCh();s.querySelector('#chordsearch').oninput=e=>{const q=e.target.value.toLowerCase();s.querySelectorAll('[data-chord]').forEach(x=>x.hidden=!x.dataset.chord.toLowerCase().includes(q));};
}
function noteIndex(n){return notesSharp.indexOf(n.replace('♭','b'));}
function fretboardHtml(root='C',scale=null,showAll=false){ const open=[4,9,2,7,11,4]; const rootIdx=notesSharp.indexOf(root), allowed=scale?new Set(scale.intervals.map(i=>(rootIdx+i)%12)):null; let cells=''; for(let si=0;si<6;si++){for(let f=0;f<=12;f++){const ni=(open[si]+f)%12,n=notesSharp[ni],on=!allowed||allowed.has(ni);cells+=`<div class="fretcell ${on?'on':''} ${ni===rootIdx?'root':''}" data-string="${si}" data-fret="${f}">${showAll||on?esc(n):''}</div>`;}}return `<div class="fretwrap"><div class="fretnums">${Array.from({length:13},(_,i)=>`<span>${i}</span>`).join('')}</div><div class="fretgrid">${cells}</div></div>`; }
function scalesTool(){
  let root='A',scale=D.scales[0];const s=sheet(`<div class="sheethead"><h2>Scale Explorer</h2><button class="close" data-close>×</button></div><div class="row"><select class="input" id="sroot">${notesSharp.map(n=>`<option ${n==='A'?'selected':''}>${n}</option>`).join('')}</select><select class="input" id="scale">${D.scales.map(x=>`<option value="${x.id}">${x.title}</option>`).join('')}</select></div><div class="card" style="margin-top:12px"><div class="title" id="sname">A ${scale.title}</div><div class="tiny" id="formula">${scale.formula}</div><div id="scaleboard">${fretboardHtml(root,scale)}</div></div>`);const draw=()=>{root=s.querySelector('#sroot').value;scale=D.scales.find(x=>x.id===s.querySelector('#scale').value);s.querySelector('#sname').textContent=`${root} ${scale.title}`;s.querySelector('#formula').textContent=scale.formula;s.querySelector('#scaleboard').innerHTML=fretboardHtml(root,scale);};s.querySelector('#sroot').onchange=draw;s.querySelector('#scale').onchange=draw;
}
function fretboardTool(){
  let q=null;const s=sheet(`<div class="sheethead"><h2>Fretboard Trainer</h2><button class="close" data-close>×</button></div><div class="card"><div class="sub">Notenübersicht · Bund 0–12</div>${fretboardHtml('C',null,true)}</div><div class="card quizcard"><div class="tiny">Welche Note liegt hier?</div><div class="quizprompt" id="fq">–</div><div class="notechoices">${notesSharp.map(n=>`<button class="chip" data-note="${n}">${n}</button>`).join('')}</div><div class="tiny" id="fscore">${state.fretStats.correct}/${state.fretStats.total} korrekt</div></div>`);const next=()=>{q={string:Math.floor(Math.random()*6),fret:Math.floor(Math.random()*13)};s.querySelector('#fq').textContent=`${['E','A','D','G','B','e'][q.string]}-Saite · Bund ${q.fret}`;s.querySelectorAll('[data-note]').forEach(x=>x.classList.remove('right','wrong'));};s.querySelectorAll('[data-note]').forEach(b=>b.onclick=()=>{const open=[4,9,2,7,11,4],ans=notesSharp[(open[q.string]+q.fret)%12];state.fretStats.total++;if(b.dataset.note===ans){state.fretStats.correct++;b.classList.add('right');}else{b.classList.add('wrong');s.querySelector(`[data-note="${CSS.escape(ans)}"]`)?.classList.add('right');}save();s.querySelector('#fscore').textContent=`${state.fretStats.correct}/${state.fretStats.total} korrekt`;setTimeout(next,700);});next();
}
function changesTool(){
  const names=['C','G','D','A','E','Am','Em','Dm','F','Bm','A7','D7','E7'];let seconds=60,count=0,timer=null;const s=sheet(`<div class="sheethead"><h2>Chord Changes</h2><button class="close" data-close>×</button></div><div class="row"><select class="input" id="ca">${names.map(n=>`<option>${n}</option>`).join('')}</select><span>↔</span><select class="input" id="cb">${names.map((n,i)=>`<option ${i===1?'selected':''}>${n}</option>`).join('')}</select></div><div class="card toolbox"><div class="bpm" id="ctime">60</div><div class="sub">Sekunden</div><div class="currentchord" id="ccount">0</div><div class="sub">saubere Wechsel</div><button class="primary dark full" id="cstart">Start</button><button class="secondary full" id="ctap" disabled>+ 1 sauberer Wechsel</button><div class="tiny" id="cbest"></div></div>`);const key=()=>[s.querySelector('#ca').value,s.querySelector('#cb').value].sort().join('-'),drawBest=()=>s.querySelector('#cbest').textContent=`Bestwert: ${state.bestChanges[key()]||0}/min`;s.querySelector('#ca').onchange=drawBest;s.querySelector('#cb').onchange=drawBest;s.querySelector('#cstart').onclick=e=>{if(timer){clearInterval(timer);timer=null;e.currentTarget.textContent='Start';s.querySelector('#ctap').disabled=true;return;}seconds=60;count=0;s.querySelector('#ctime').textContent=60;s.querySelector('#ccount').textContent=0;s.querySelector('#ctap').disabled=false;e.currentTarget.textContent='Stop';timer=setInterval(()=>{seconds--;s.querySelector('#ctime').textContent=seconds;if(seconds<=0){clearInterval(timer);timer=null;s.querySelector('#ctap').disabled=true;e.currentTarget.textContent='Start';state.bestChanges[key()]=Math.max(state.bestChanges[key()]||0,count);save();drawBest();clickEnd();}},1000);};s.querySelector('#ctap').onclick=()=>{count++;s.querySelector('#ccount').textContent=count;};drawBest();
}
function playTone(freq,time=.7){const ctx=ensureAudio(),o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.14,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+time);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+time+.02);}
function earTool(){
  const options=[['Prime',0],['m3',3],['M3',4],['4',5],['5',7],['Oktave',12]];let current=null;const s=sheet(`<div class="sheethead"><h2>Ear Trainer</h2><button class="close" data-close>×</button></div><div class="card toolbox"><div class="quizprompt">Intervall erkennen</div><button class="primary dark full" id="hear">▶ Neues Intervall</button><div class="notechoices">${options.map(([n,v])=>`<button class="chip" data-int="${v}">${n}</button>`).join('')}</div><div class="tiny" id="escore">${state.earStats.correct}/${state.earStats.total} korrekt</div></div>`);const play=()=>{const root=110*Math.pow(2,Math.floor(Math.random()*12)/12);current=options[Math.floor(Math.random()*options.length)][1];playTone(root,.55);setTimeout(()=>playTone(root*Math.pow(2,current/12),.7),650);s.querySelectorAll('[data-int]').forEach(x=>x.classList.remove('right','wrong'));};s.querySelector('#hear').onclick=play;s.querySelectorAll('[data-int]').forEach(b=>b.onclick=()=>{if(current===null)return;state.earStats.total++;if(+b.dataset.int===current){state.earStats.correct++;b.classList.add('right');}else{b.classList.add('wrong');s.querySelector(`[data-int="${current}"]`)?.classList.add('right');}save();s.querySelector('#escore').textContent=`${state.earStats.correct}/${state.earStats.total} korrekt`;setTimeout(play,900);});
}
function timerTool(){
  let total=300,secs=300,running=false;const s=sheet(`<div class="sheethead"><h2>Practice Timer</h2><button class="close" data-close>×</button></div><div class="card toolbox"><div class="bpm timerdisplay" id="time">05:00</div><div class="controls"><button class="roundbtn" data-time="-60">−1</button><button class="primary dark" id="pstart">Start</button><button class="roundbtn" data-time="60">+1</button></div><div class="chiprow timerpresets">${[5,10,15,20,30].map(v=>`<button class="chip" data-preset="${v}">${v} min</button>`).join('')}</div></div>`);const draw=()=>s.querySelector('#time').textContent=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;s.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{if(!running){secs=total=Math.max(60,Math.min(5400,secs+Number(b.dataset.time)));draw();}});s.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{if(!running){secs=total=+b.dataset.preset*60;draw();}});s.querySelector('#pstart').onclick=e=>{if(running){clearInterval(practiceTimer);practiceTimer=null;running=false;e.currentTarget.textContent='Start';}else{running=true;e.currentTarget.textContent='Pause';practiceTimer=setInterval(()=>{secs--;draw();if(secs<=0){clearInterval(practiceTimer);practiceTimer=null;running=false;e.currentTarget.textContent='Start';clickEnd();secs=total;setTimeout(draw,500);}},1000);}};draw();
}
function jamTool(){ const s=sheet(`<div class="sheethead"><h2>Jam Mode</h2><button class="close" data-close>×</button></div><p class="goal">Wähle eine eigene Progression. Der Loop zeigt dir die Akkorde und hält das Tempo – ohne externe Audiodateien.</p><div class="cards">${D.songs.filter(x=>['Blues','Funk','Rock','Minor Blues','Ambient','Progressive'].includes(x.style)).map(x=>`<button class="card songcard" data-jam="${x.id}"><div class="songart">${x.key}</div><div class="grow left"><div class="title">${esc(x.title)}</div><div class="sub">${esc(x.style)} · ${x.bpm} BPM</div></div><span>›</span></button>`).join('')}</div>`);s.querySelectorAll('[data-jam]').forEach(b=>b.onclick=()=>openSong(b.dataset.jam)); }
async function tunerTool(){
  let tuningKey=state.profile.tuning||'standard';const s=sheet(`<div class="sheethead"><h2>Tuner</h2><button class="close" data-close>×</button></div><div class="card toolbox"><select class="input" id="tuning">${Object.entries(D.tunings).map(([k,v])=>`<option value="${k}" ${k===tuningKey?'selected':''}>${v.title}</option>`).join('')}</select><div class="tuner-note" id="tnote">–</div><div class="cents" id="tcents">Mikrofon starten</div><div class="tiny" id="tstring"></div><div class="meter"><i class="centerMark"></i><i class="needle" id="needle"></i></div><button class="primary dark" id="tunestart">Mikrofon erlauben</button><p class="notice">Chromatischer Tuner. Zielbereich ±5 Cent. Mikrofon-Audio wird nicht gespeichert.</p></div>`);s.querySelector('#tuning').onchange=e=>{tuningKey=e.target.value;state.profile.tuning=tuningKey;save();};s.querySelector('#tunestart').onclick=async e=>{try{if(!navigator.mediaDevices?.getUserMedia)throw new Error();tunerStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});const ctx=ensureAudio(),src=ctx.createMediaStreamSource(tunerStream),an=ctx.createAnalyser();an.fftSize=4096;src.connect(an);e.currentTarget.textContent='Tuner aktiv';e.currentTarget.disabled=true;runTuner(an,s,()=>tuningKey);}catch{ s.querySelector('#tcents').textContent='Mikrofon nicht verfügbar. HTTPS und Berechtigung prüfen.'; }};
}
function runTuner(an,s,getTuning){ const buf=new Float32Array(an.fftSize);let last=0;const loop=t=>{if(!document.body.contains(s)||!tunerStream)return;if(t-last>75){last=t;an.getFloatTimeDomainData(buf);const freq=detectPitch(buf,ensureAudio().sampleRate);if(freq>0){const midi=69+12*Math.log2(freq/440),nearest=Math.round(midi),cents=Math.round((midi-nearest)*100),name=notesSharp[(nearest%12+12)%12],tuning=D.tunings[getTuning()],dist=tuning.freq.map((f,i)=>[Math.abs(1200*Math.log2(freq/f)),i]).sort((a,b)=>a[0]-b[0])[0];s.querySelector('#tnote').textContent=name;s.querySelector('#tcents').textContent=`${freq.toFixed(1)} Hz · ${cents>0?'+':''}${cents} Cent`;s.querySelector('#needle').style.left=`${Math.max(3,Math.min(97,50+cents*.85))}%`;s.querySelector('#tstring').textContent=dist[0]<100?`Nächste Saite: ${tuning.notes[dist[1]]}`:'Chromatisch';}}tunerFrame=requestAnimationFrame(loop);};tunerFrame=requestAnimationFrame(loop); }
function detectPitch(buf,sampleRate){ let rms=0;for(const v of buf)rms+=v*v;rms=Math.sqrt(rms/buf.length);if(rms<.008)return -1;const minLag=Math.floor(sampleRate/1400),maxLag=Math.min(Math.floor(sampleRate/55),buf.length-2);let bestLag=-1,best=0;for(let lag=minLag;lag<=maxLag;lag++){let sum=0,a=0,b=0;const end=Math.min(buf.length-lag,1800);for(let i=0;i<end;i++){const x=buf[i],y=buf[i+lag];sum+=x*y;a+=x*x;b+=y*y;}const corr=sum/Math.sqrt(a*b||1);if(corr>best){best=corr;bestLag=lag;}}if(best<.72||bestLag<=0)return -1;return sampleRate/bestLag; }
function clickEnd(){ try{const ctx=ensureAudio();scheduleClick(ctx.currentTime,true);setTimeout(()=>scheduleClick(ctx.currentTime,true),150);}catch{} if(navigator.vibrate)navigator.vibrate([80,70,80]); }
function cleanupAudio(){ stopMetronome();stopSongLoop();if(practiceTimer){clearInterval(practiceTimer);practiceTimer=null;}if(tunerFrame){cancelAnimationFrame(tunerFrame);tunerFrame=null;}if(tunerStream){tunerStream.getTracks().forEach(t=>t.stop());tunerStream=null;} }
window.addEventListener('beforeunload',cleanupAudio);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;});
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.profile.theme==='system')applyTheme();});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
const qs=new URLSearchParams(location.search);if(['home','learn','practice','tools','progress'].includes(qs.get('tab')))state.tab=qs.get('tab');
window.PLAY_TEST={lessonCount:lessons.length,songCount:D.songs.length,toolCount:D.tools.length,practiceCount:P.length,state:()=>state,buildSession,stats};
render();
})();
