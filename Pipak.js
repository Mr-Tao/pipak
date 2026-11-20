// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: stopwatch;
// Pípák Visual 0.2 — all code is local; no network requests.

const VERSION = "0.2";
const DEFAULTS = {
  work: 20, rest: 10, rounds: 8, sets: 1,
  setRest: 60, countdown: 3, preparation: 10, volume: 35
};
const LIMITS = {
  work: [1, 3600], rest: [0, 3600], rounds: [1, 200],
  sets: [1, 50], setRest: [0, 3600], countdown: [0, 60],
  preparation: [0, 3600], volume: [0, 100]
};
const PRESETS = {
  tabata: { ...DEFAULTS },
  minute: { ...DEFAULTS, work: 60, rest: 0, rounds: 5, countdown: 0 }
};

function normalize(raw, base, limits) {
  const result = { ...base };
  for (const k of Object.keys(limits)) {
    const x = raw && raw[k];
    if (x == null || x === "") continue;
    const n = Number(x);
    if (Number.isSafeInteger(n) && n >= limits[k][0] && n <= limits[k][1]) {
      result[k] = n;
    }
  }
  if (result.rounds * result.sets > 1000) {
    result.rounds = base.rounds;
    result.sets = base.sets;
  }
  return result;
}

function normalizeStore(raw, defaults, limits) {
  const presets = Object.create(null);
  const entries = raw && raw.presets && typeof raw.presets === "object"
    ? Object.entries(raw.presets) : [];
  for (const [key, value] of entries.slice(0, 30)) {
    const name = key.trim().slice(0, 60);
    if (name && value && typeof value === "object")
      presets[name] = normalize(value, defaults, limits);
  }
  return {
    schema: 1,
    updatedAt: Number(raw && raw.updatedAt) || 0,
    last: normalize(raw && raw.last, defaults, limits),
    presets
  };
}

// Pure function shared with the WebView. All phase deadlines are cumulative.
function buildTimeline(c) {
  const phases = [];
  let total = 0;
  function add(type, seconds, set, round) {
    if (!seconds) return;
    const duration = seconds * 1000;
    phases.push({ type, set, round, duration, start: total, end: total + duration });
    total += duration;
  }
  add("preparation", c.preparation, 0, 0);
  for (let set = 1; set <= c.sets; set++) {
    for (let round = 1; round <= c.rounds; round++) {
      add("work", c.work, set, round);
      if (round === c.rounds && set < c.sets) {
        add("setRest", c.setRest, set, round);
      } else {
        add("rest", c.rest, set, round);
      }
    }
  }
  return { phases, total };
}

// The storage bridge uses a local, intercepted URL, not an HTTP request.
const PREFIX = "pipak-save://save?data=";
const NAME = "Pipak-settings.json";
const local = FileManager.local();
let cloud = null;
try { cloud = FileManager.iCloud(); } catch (e) { console.log(String(e)); }
const localPath = local.joinPath(local.documentsDirectory(), NAME);
let cloudPath = null;
try { if (cloud) cloudPath = cloud.joinPath(cloud.documentsDirectory(), NAME); }
catch (e) { cloud = null; console.log(String(e)); }

async function readStore(fm, path, isCloud) {
  if (!fm || !path) return null;
  try {
    if (!fm.fileExists(path)) return null;
    if (isCloud) await fm.downloadFileFromiCloud(path);
    const raw = JSON.parse(fm.readString(path));
    if (!raw || raw.schema !== 1) return null;
    return normalizeStore(raw, DEFAULTS, LIMITS);
  } catch (e) { console.log(`Pípák read: ${String(e)}`); return null; }
}
const localState = await readStore(local, localPath, false);
const cloudState = await readStore(cloud, cloudPath, true);
let saved = [localState, cloudState].filter(Boolean)
  .sort((a,b) => b.updatedAt - a.updatedAt)[0] || normalizeStore(null, DEFAULTS, LIMITS);

let supplied = args.shortcutParameter;
if (typeof supplied === "string") {
  try { supplied = JSON.parse(supplied); } catch { supplied = null; }
}
const initial = normalize(supplied, saved.last, LIMITS);

function saveStore(raw) {
  const clean = normalizeStore(raw, DEFAULTS, LIMITS);
  // Increasing stamp even if the wall clock is adjusted backwards.
  clean.updatedAt = Math.max(Date.now(), saved.updatedAt + 1);
  const text = JSON.stringify(clean, null, 2);
  let localOK = false, cloudOK = false;
  try { local.writeString(localPath, text); localOK = true; }
  catch (e) { console.log(`Pípák local write: ${String(e)}`); }
  try { if (cloud && cloudPath) { cloud.writeString(cloudPath, text); cloudOK = true; } }
  catch (e) { console.log(`Pípák iCloud write: ${String(e)}`); }
  if (localOK || cloudOK) saved = clean;
  return cloudOK ? "Uloženo na iCloud" : localOK ? "Uloženo lokálně (bez iCloudu)" : "Nastavení se nepodařilo uložit";
}

function main(limits, builtins, initial, store, prefix, version) {
  const $ = id => document.getElementById(id);
  const keys = Object.keys(limits);
  const labels = { preparation: "PŘÍPRAVA", work: "CVIČENÍ", rest: "ODPOČINEK", setRest: "PAUZA MEZI SÉRIEMI" };
  const colors = { preparation: "#344e7a", work: "#176448", rest: "#205987", setRest: "#51417d", paused: "#475569", finished: "#234b36", idle: "#182332", warning: "#a34820" };
  let cfg = { ...initial }, custom = Object.assign(Object.create(null), store.presets);
  let phases = [], total = 0, origin = 0, elapsed = 0, index = -1, lastSecond = -1;
  let state = "idle", audio = null, wakeLock = null, wakePending = false;
  let saveTimer = null, saveRevision = 0, acknowledged = 0;
  const activeOscillators = new Set();

  function time(s) {
    const m = Math.floor(s / 60), r = String(s % 60).padStart(2, "0");
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${r}` : `${m}:${r}`;
  }
  function durationLabel(s) { return s >= 60 ? time(s) : `${s} s`; }
  function read() {
    const c = {};
    for (const k of keys) {
      const v = $(k).value, n = Number(v), [min,max] = limits[k];
      if (!v.trim() || !Number.isSafeInteger(n) || n < min || n > max)
        throw new Error(`${$(k).getAttribute("aria-label")}: zadej celé číslo ${min}–${max}.`);
      c[k] = n;
    }
    if (c.rounds * c.sets > 1000) throw new Error("Maximum je 1000 kol celkem.");
    return c;
  }
  function refreshSummary() {
    $("volumeText").textContent = `${$("volume").value} %`;
    try {
      const c = read(), t = buildTimeline(c).total / 1000;
      $("summary").textContent = `${c.sets} × ${c.rounds} kol · ${time(t)} celkem`;
      $("error").textContent = "";
      return true;
    } catch (e) { $("error").textContent = e.message; $("summary").textContent = "—"; return false; }
  }
  function apply(c) {
    for (const k of keys) $(k).value = c[k];
    refreshSummary();
  }
  function snapshot() {
    return { schema: 1, updatedAt: Date.now(), last: read(), presets: custom };
  }
  window.pipakSnapshot = () => { try { return JSON.stringify(snapshot()); } catch { return null; } };
  window.pipakStorageAck = (revision, message) => {
    if (revision < acknowledged) return;
    acknowledged = revision;
    $("storage").textContent = message;
  };
  function queueSave(immediate = false) {
    clearTimeout(saveTimer);
    if (!refreshSummary()) return;
    $("storage").textContent = "Ukládám…";
    const send = () => {
      try {
        const data = JSON.stringify({ revision: ++saveRevision, store: snapshot() });
        window.location.href = `${prefix}${encodeURIComponent(data)}`;
      } catch (e) { $("storage").textContent = `Uložení selhalo: ${e.message}`; }
    };
    if (immediate) send(); else saveTimer = setTimeout(send, 300);
  }
  function updatePresets(selected = "") {
    const select = $("presets");
    select.textContent = "";
    const empty = document.createElement("option");
    empty.value = ""; empty.textContent = "Vlastní předvolby…"; select.appendChild(empty);
    for (const name of Object.keys(custom).sort((a,b) => a.localeCompare(b,"cs"))) {
      const opt = document.createElement("option"); opt.value = name; opt.textContent = name; select.appendChild(opt);
    }
    select.value = selected;
    $("deletePreset").disabled = !select.value;
  }
  function savePreset() {
    if (!refreshSummary()) return;
    const name = $("presetName").value.trim().slice(0, 60);
    if (!name) { $("error").textContent = "Nejprve zadej název předvolby."; return; }
    if (!(name in custom) && Object.keys(custom).length >= 30) {
      $("error").textContent = "Maximum je 30 vlastních předvoleb."; return;
    }
    custom[name] = read();
    updatePresets(name); $("presetName").value = name;
    queueSave(true);
  }
  function unlockAudio() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!audio) audio = new Context();
      audio.resume().catch(e => { $("note").textContent = `Zvuk: ${e.message}`; });
    } catch (e) { $("note").textContent = `Zvuk nelze inicializovat: ${e.message}`; }
  }
  function beep(frequency, duration, delay = 0, volume = cfg.volume) {
    if (!audio || !volume) return;
    try {
      const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + delay;
      osc.type = "sine"; osc.frequency.value = frequency;
      const v = volume / 100;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(v, t + 0.005);
      gain.gain.setValueAtTime(v, t + duration - 0.015);
      gain.gain.linearRampToValueAtTime(0, t + duration);
      osc.connect(gain); gain.connect(audio.destination); activeOscillators.add(osc);
      osc.onended = () => { activeOscillators.delete(osc); osc.disconnect(); gain.disconnect(); };
      osc.start(t); osc.stop(t + duration);
    } catch(e) { $("note").textContent = `Zvuk: ${e.message}`; }
  }
  function silence() { for (const osc of activeOscillators) { try { osc.stop(); } catch {} } }
  function finishSound() { beep(1200,.2); beep(1200,.2,.3); beep(1500,.5,.6); }
  async function keepAwake() {
    if (!navigator.wakeLock || wakeLock || wakePending || document.hidden || state !== "running") return;
    wakePending = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (state !== "running" || document.hidden) { await lock.release(); return; }
      wakeLock = lock;
      lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
    } catch { /* Older WebKit may not support this. */ }
    finally { wakePending = false; }
  }
  function releaseScreen() { if (wakeLock) { const lock = wakeLock; wakeLock = null; lock.release().catch(()=>{}); } }
  function setColor(color) { document.body.style.background = color; }
  function buildSegments() {
    const root = $("segments"); root.textContent = "";
    // Aggregate by series for long workouts, otherwise show each work interval.
    const count = cfg.rounds * cfg.sets;
    const compact = count > 48;
    for (let n = 0; n < (compact ? cfg.sets : count); n++) root.appendChild(document.createElement("span"));
    root.dataset.compact = compact ? "1" : "0";
  }
  function renderSegments(p, finished = false) {
    const root = $("segments"), compact = root.dataset.compact === "1";
    const n = compact ? p.set : (p.set - 1) * cfg.rounds + p.round;
    let completed = p.set === 0 ? 0 : Math.max(0,n-1);
    if (!compact && (p.type === "rest" || p.type === "setRest")) completed = n;
    if (compact && p.type === "setRest") completed = n;
    for (let j = 0; j < root.children.length; j++) root.children[j].className = finished || j < completed ? "done" : (p.set && j === completed && p.type !== "setRest" ? "current" : "");
  }
  function render(p, remaining, warning) {
    setColor(colors[state === "paused" ? "paused" : warning ? "warning" : p.type]);
    $("phase").textContent = state === "paused" ? `POZASTAVENO · ${labels[p.type]}` : labels[p.type];
    $("time").textContent = remaining >= 60 ? time(remaining) : String(remaining).padStart(2,"0");
    $("time").classList.toggle("long", remaining >= 60);
    $("round").textContent = p.set === 0 ? "Připrav se" : `Série ${p.set} / ${cfg.sets} · Kolo ${p.round} / ${cfg.rounds}`;
    $("remaining").textContent = `Zbývá celkem ${time(Math.ceil((total-elapsed)/1000))}`;
    $("phaseProgress").style.width = `${Math.max(0,(p.end-elapsed)/p.duration*100)}%`;
    $("totalProgress").style.width = `${Math.min(100,elapsed/total*100)}%`;
    $("percent").textContent = `${Math.floor(elapsed/total*100)} %`;
    const next = phases[phases.indexOf(p)+1];
    $("next").textContent = next ? `Následuje: ${labels[next.type].toLocaleLowerCase("cs")} · ${durationLabel(next.duration/1000)}` : "Následuje: konec tréninku";
    renderSegments(p);
  }
  function update() {
    if (state !== "running") return;
    elapsed = Math.max(0, performance.now() - origin);
    if (elapsed >= total) { finish(); return; }
    const i = phases.findIndex(p => elapsed < p.end), p = phases[i];
    const r = Math.ceil((p.end - elapsed)/1000);
    const warning = r <= Math.min(cfg.countdown, p.duration/1000 - 1);
    if (i !== index) {
      index = i; lastSecond = -1;
      if (p.type === "work") beep(1200,.25);
      if (p.type === "rest") beep(650,.25);
      if (p.type === "setRest") { beep(650,.18); beep(650,.18,.25); }
      // If a phase is entered late, do not double-play the transition and a tick.
    } else if (warning && r !== lastSecond) beep(900,.08);
    lastSecond = r;
    render(p,r,warning);
  }
  function start() {
    if (!refreshSummary()) return;
    cfg = read(); unlockAudio(); silence(); queueSave(true);
    ({ phases, total } = buildTimeline(cfg));
    elapsed = 0; index = -1; lastSecond = -1;
    $("setup").hidden = true; $("training").hidden = false;
    $("pause").hidden = false; $("pause").textContent = "Pozastavit"; $("reset").textContent = "Ukončit";
    buildSegments(); state = "running"; origin = performance.now();
    keepAwake(); update(); window.scrollTo(0,0);
  }
  function pause() {
    if (state !== "running") return;
    elapsed = Math.min(total,Math.max(0,performance.now()-origin));
    if (elapsed >= total) { finish(); return; }
    state = "paused"; silence(); releaseScreen();
    const i = phases.findIndex(p => elapsed < p.end), p = phases[i];
    // Keep index unchanged if we paused right on a phase boundary; resume can play it.
    render(p,Math.ceil((p.end-elapsed)/1000),false);
    $("pause").textContent = "Pokračovat";
  }
  function resume() {
    if (state !== "paused") return;
    unlockAudio(); origin = performance.now() - elapsed; state = "running";
    $("pause").textContent = "Pozastavit"; keepAwake(); update();
  }
  function finish() {
    if (state === "finished") return;
    state = "finished"; elapsed = total; silence(); releaseScreen(); finishSound();
    setColor(colors.finished); $("phase").textContent = "HOTOVO"; $("time").textContent = "00"; $("time").classList.remove("long");
    $("round").textContent = `${cfg.sets} × ${cfg.rounds} kol dokončeno`;
    $("remaining").textContent = "Trénink dokončen"; $("next").textContent = "";
    $("phaseProgress").style.width = "0%"; $("totalProgress").style.width = "100%"; $("percent").textContent = "100 %";
    renderSegments(phases[phases.length-1],true); $("pause").hidden = true; $("reset").textContent = "Nový trénink";
  }
  function reset() {
    state = "idle"; silence(); releaseScreen(); setColor(colors.idle);
    $("training").hidden = true; $("setup").hidden = false; refreshSummary();
  }
  for (const k of keys) {
    $(k).addEventListener("input", refreshSummary);
    $(k).addEventListener("change", () => queueSave());
  }
  $("tabata").onclick = () => { apply({...builtins.tabata,volume:Number($("volume").value)}); $("presets").value=""; $("deletePreset").disabled=true; $("presetName").value=""; queueSave(true); };
  $("minute").onclick = () => { apply({...builtins.minute,volume:Number($("volume").value)}); $("presets").value=""; $("deletePreset").disabled=true; $("presetName").value=""; queueSave(true); };
  $("presets").onchange = () => { const name=$("presets").value; $("deletePreset").disabled=!name; if(name && custom[name]) { apply(custom[name]); $("presetName").value=name; queueSave(true); } };
  $("savePreset").onclick = savePreset;
  $("deletePreset").onclick = () => { const name=$("presets").value; if(!name) return; delete custom[name]; $("presetName").value=""; updatePresets(); queueSave(true); };
  $("testSound").onclick = () => { unlockAudio(); silence(); beep(1200,.25,0,Number($("volume").value)); };
  $("start").onclick = start;
  $("pause").onclick = () => state === "running" ? pause() : resume();
  $("reset").onclick = reset;
  document.addEventListener("visibilitychange", () => { if (document.hidden && state === "running") pause(); });
  apply(initial); updatePresets(); reset();
  $("note").textContent = `Pípák Visual · v${version}`;
  setInterval(update,50);
}

function safeJSON(value) { return JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029"); }

const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
*{box-sizing:border-box} [hidden]{display:none!important}
:root{color-scheme:dark;font-family:-apple-system,system-ui,sans-serif;color:white}
body{margin:0;background:#182332;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;padding-top:max(16px,env(safe-area-inset-top));padding-bottom:max(16px,env(safe-area-inset-bottom));transition:background .15s}
main{width:100%;max-width:850px;text-align:center} h1{font-size:28px;margin:0 0 12px} h2{font-size:17px;margin:12px 0 8px;text-align:left}
button,input,select{font:inherit;color:white;border:0;border-radius:12px;background:#ffffff22;padding:11px 13px;min-width:0} button{font-weight:600;min-height:44px;cursor:pointer} button:disabled{opacity:.4} input,select{width:100%} select option{background:#182332;color:white} input[type=range]{padding:4px;accent-color:#a6e6d2} .primary{background:white;color:#182332;width:100%;margin-top:10px;font-size:18px}
.row{display:flex;gap:8px;align-items:center;margin:6px 0}.row>*{flex:1}.row .small{flex:0 0 auto}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px} label{display:flex;flex-direction:column;text-align:left;gap:4px;font-size:13px;color:#e4e9f0}.fields input{font-size:19px}.section{padding:12px;border:1px solid #ffffff24;border-radius:16px;margin-top:10px} .volume-row{display:flex;align-items:center;gap:10px}.volume-row input{flex:1}.volume-row output{width:54px;text-align:right;white-space:nowrap}
#summary{font-size:18px;font-weight:600;margin-top:12px} #error{color:#ffceaa;font-size:13px;min-height:16px} #storage,#note{font-size:12px;opacity:.75;margin-top:6px}
#phase{font-size:clamp(19px,4.5vw,44px);font-weight:750;letter-spacing:.065em} #time{font-size:clamp(96px,min(36vw,37vh),300px);font-weight:800;line-height:1.04;font-variant-numeric:tabular-nums;letter-spacing:-.05em} #time.long{font-size:clamp(65px,min(22vw,31vh),235px)}
#round{font-size:clamp(18px,3.4vw,30px);font-weight:650} #next{font-size:clamp(16px,3vw,23px);margin-top:12px;min-height:1.4em} .track{height:9px;border-radius:9px;background:#ffffff35;overflow:hidden;margin:13px 0}.track.small{height:6px;margin:7px 0}.bar{height:100%;background:white;border-radius:9px;width:0%} #segments{display:flex;gap:3px;margin-top:15px} #segments span{height:8px;flex:1;min-width:0;background:#ffffff28;border-radius:2px} #segments span.done{background:#ffffffa0} #segments span.current{background:white} .meta{display:flex;justify-content:space-between;gap:10px;font-size:14px;opacity:.85} .controls{display:flex;justify-content:center;gap:10px;margin-top:18px}.controls button{min-width:115px} #training{padding:10px 0}
@media(min-width:650px){.fields{grid-template-columns:repeat(4,minmax(0,1fr))} .section{padding:16px}} @media(max-height:500px) and (orientation:landscape){body{align-items:flex-start;padding-top:8px} #training{padding:0} #time{font-size:clamp(65px,29vh,160px)}#time.long{font-size:clamp(55px,26vh,145px)}#phase{font-size:20px}#round,#next{font-size:16px} #next{margin-top:5px} .track{margin:6px 0} #segments{margin-top:7px}.controls{margin-top:7px}}
</style></head><body><main>
<section id="setup"><h1>Pípák</h1><div class="row"><button id="tabata">Tabata</button><button id="minute">Minutové série</button></div>
<div class="section"><div class="row"><select id="presets" aria-label="Vlastní předvolby"></select><button class="small" id="deletePreset" aria-label="Smazat vybranou předvolbu">Smazat</button></div><div class="row"><input id="presetName" type="text" placeholder="Název předvolby" maxlength="60" aria-label="Název předvolby"><button id="savePreset" class="small">Uložit</button></div></div>
<div class="section"><h2>Intervaly</h2><div class="fields">
${[["work","Cvičení (s)"],["rest","Odpočinek (s)"],["rounds","Kol v sérii"],["sets","Počet sérií"],["setRest","Pauza sérií (s)"],["countdown","Odpočet (s)"],["preparation","Příprava (s)"]].map(([k,l])=>`<label>${l}<input id="${k}" aria-label="${l}" type="number" inputmode="numeric" min="${LIMITS[k][0]}" max="${LIMITS[k][1]}" step="1"></label>`).join("")}</div>
<h2>Zvuk</h2><div class="volume-row"><input type="range" id="volume" aria-label="Hlasitost" min="0" max="100" step="1"><output id="volumeText"></output><button id="testSound" class="small">Test</button></div></div>
<div id="summary"></div><div id="error" role="alert"></div><button class="primary" id="start">Spustit trénink</button><div id="storage" role="status">Nastavení se ukládá automaticky</div></section>
<section id="training" hidden><div id="phase"></div><div id="time"></div><div class="track"><div class="bar" id="phaseProgress"></div></div><div id="round"></div><div id="next"></div><div id="segments"></div><div class="track small"><div class="bar" id="totalProgress"></div></div><div class="meta"><span id="percent"></span><span id="remaining"></span></div><div class="controls"><button id="pause">Pozastavit</button><button id="reset">Ukončit</button></div></section><div id="note"></div>
</main><script>
${buildTimeline.toString()}
(${main.toString()})(${[LIMITS,PRESETS,initial,saved,PREFIX,VERSION].map(safeJSON).join(",")});
</script></body></html>`;

const webView = new WebView();
webView.shouldAllowRequest = req => {
  const url = req.url;
  if (!url.startsWith(PREFIX)) return true;
  try {
    const payload = JSON.parse(decodeURIComponent(url.slice(PREFIX.length)));
    const message = saveStore(payload.store);
    webView.evaluateJavaScript(`window.pipakStorageAck(${Number(payload.revision)},${safeJSON(message)})`).catch(e => console.log(String(e)));
  } catch (e) { console.log(`Pípák bridge: ${String(e)}`); }
  return false;
};
await webView.loadHTML(html);
await webView.present(true);
// Best-effort final snapshot also covers a field edited immediately before dismissal.
try {
  const result = await webView.evaluateJavaScript("window.pipakSnapshot()");
  if (result) {
    const raw = normalizeStore(JSON.parse(result), DEFAULTS, LIMITS);
    if (JSON.stringify(raw.last) !== JSON.stringify(saved.last) || JSON.stringify(raw.presets) !== JSON.stringify(saved.presets)) saveStore(raw);
  }
} catch (e) { console.log(`Pípák final save: ${String(e)}`); }
Script.complete();
