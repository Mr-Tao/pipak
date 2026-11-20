// Pípák Visual v0.1
// Scriptable / iOS / iPadOS

const defaults = {
  work: 20,
  rest: 10,
  rounds: 8,
  countdown: 3,
  preparation: 10,
};

const supplied = args.shortcutParameter;

for (const key of Object.keys(defaults)) {
  if (supplied && supplied[key] != null) {
    const n = Number(supplied[key]);
    if (Number.isSafeInteger(n)) defaults[key] = n;
  }
}

function main(defaults) {
  const $ = (id) => document.getElementById(id);

  const presets = {
    tabata: {
      work: 20,
      rest: 10,
      rounds: 8,
      countdown: 3,
      preparation: 10,
    },
    minute: {
      work: 60,
      rest: 0,
      rounds: 5,
      countdown: 0,
      preparation: 10,
    },
  };

  const colors = {
    preparation: "#334b79",
    work: "#176448",
    rest: "#205987",
    warning: "#a34820",
    paused: "#4b5563",
    finished: "#234b36",
    idle: "#182332",
  };

  const labels = {
    preparation: "PŘÍPRAVA",
    work: "CVIČENÍ",
    rest: "ODPOČINEK",
  };

  let config = {};
  let phases = [];
  let total = 0;
  let origin = 0;
  let elapsed = 0;
  let phaseIndex = -1;
  let lastSecond = -1;
  let state = "idle";
  let audio = null;
  let wakeLock = null;

  // Audio

  function unlockAudio() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;

      if (!audio) audio = new Audio();
      audio.resume().catch(console.log);
    } catch (e) {
      $("note").textContent = "Zvuk se nepodařilo inicializovat.";
    }
  }

  function beep(frequency, duration, delay = 0) {
    if (!audio) return;

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const t = audio.currentTime + delay;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.005);
    gain.gain.setValueAtTime(0.35, t + duration - 0.015);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start(t);
    oscillator.stop(t + duration);
  }

  function finishSound() {
    beep(1200, 0.2, 0);
    beep(1200, 0.2, 0.3);
    beep(1500, 0.5, 0.6);
  }

  // Screen wake lock

  async function keepAwake() {
    if (!navigator.wakeLock || wakeLock) return;

    try {
      const lock = await navigator.wakeLock.request("screen");
      if (state !== "running") {
        await lock.release();
        return;
      }
      wakeLock = lock;
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
      });
    } catch (e) {
      console.log(e);
    }
  }

  function releaseScreen() {
    if (wakeLock) {
      wakeLock.release().catch(console.log);
      wakeLock = null;
    }
  }

  // Configuration

  function applyPreset(preset) {
    for (const key of Object.keys(preset)) {
      $(key).value = preset[key];
    }
  }

  function readConfig() {
    const result = {};

    for (const key of Object.keys(defaults)) {
      const value = Number($(key).value);

      if ($(key).value === "" || !Number.isInteger(value) || value < 0) {
        throw new Error("Zadej celá nezáporná čísla.");
      }

      result[key] = value;
    }

    if (result.work < 1 || result.rounds < 1) {
      throw new Error("Cvičení a počet kol musí být větší než nula.");
    }

    if (result.rounds > 1000) {
      throw new Error("Maximum je 1000 kol.");
    }

    return result;
  }

  // Absolute phase deadlines

  function addPhase(type, seconds, round) {
    if (seconds <= 0) return;

    const duration = seconds * 1000;

    phases.push({
      type,
      duration,
      round,
      start: total,
      end: total + duration,
    });

    total += duration;
  }

  function buildTimeline() {
    phases = [];
    total = 0;

    addPhase("preparation", config.preparation, 0);

    for (let round = 1; round <= config.rounds; round++) {
      addPhase("work", config.work, round);
      addPhase("rest", config.rest, round);
    }
  }

  // Display

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function update() {
    if (state !== "running") return;

    elapsed = performance.now() - origin;

    if (elapsed >= total) {
      finish();
      return;
    }

    const index = phases.findIndex((p) => elapsed < p.end);
    const p = phases[index];
    const remaining = Math.ceil((p.end - elapsed) / 1000);

    const warning =
      p.type !== "preparation" &&
      remaining <= Math.min(config.countdown, p.duration / 1000 - 1);

    if (phaseIndex !== index) {
      phaseIndex = index;
      lastSecond = -1;

      if (p.type === "work") beep(1200, 0.25);
      if (p.type === "rest") beep(650, 0.25);
    } else if (warning && remaining !== lastSecond) {
      beep(900, 0.08);
    }

    lastSecond = remaining;

    document.body.style.background = colors[warning ? "warning" : p.type];

    $("phase").textContent = labels[p.type];
    $("time").textContent =
      remaining >= 60
        ? formatTime(remaining)
        : String(remaining).padStart(2, "0");

    $("round").textContent =
      p.round === 0 ? "Připrav se" : "Kolo " + p.round + " / " + config.rounds;

    $("total").textContent =
      "Zbývá celkem " + formatTime(Math.ceil((total - elapsed) / 1000));

    $("progress").style.width = ((p.end - elapsed) / p.duration) * 100 + "%";
  }

  // Training control

  function start() {
    try {
      config = readConfig();
    } catch (e) {
      alert(e.message);
      return;
    }

    unlockAudio();
    buildTimeline();

    elapsed = 0;
    phaseIndex = -1;
    lastSecond = -1;

    $("setup").hidden = true;
    $("controls").hidden = false;
    $("pause").hidden = false;
    $("pause").textContent = "Pozastavit";

    state = "running";
    origin = performance.now();

    keepAwake();
    update();
  }

  function pause() {
    if (state !== "running") return;

    elapsed = performance.now() - origin;
    state = "paused";

    releaseScreen();

    document.body.style.background = colors.paused;
    $("phase").textContent = "POZASTAVENO";
    $("pause").textContent = "Pokračovat";
  }

  function resume() {
    if (state !== "paused") return;

    unlockAudio();

    origin = performance.now() - elapsed;
    state = "running";

    $("pause").textContent = "Pozastavit";

    keepAwake();
    update();
  }

  function finish() {
    state = "finished";
    releaseScreen();
    finishSound();

    document.body.style.background = colors.finished;

    $("phase").textContent = "HOTOVO";
    $("time").textContent = "00";
    $("round").textContent = config.rounds + " kol dokončeno";
    $("total").textContent = "Trénink dokončen";
    $("progress").style.width = "0%";
    $("pause").hidden = true;
  }

  function reset() {
    state = "idle";
    releaseScreen();

    document.body.style.background = colors.idle;
    $("phase").textContent = "PÍPÁK";
    $("time").textContent = "--";
    $("round").textContent = "";
    $("total").textContent = "";
    $("progress").style.width = "100%";

    $("setup").hidden = false;
    $("controls").hidden = true;
  }

  $("tabata").onclick = () => applyPreset(presets.tabata);
  $("minute").onclick = () => applyPreset(presets.minute);
  $("start").onclick = start;
  $("reset").onclick = reset;

  $("pause").onclick = () => {
    if (state === "running") pause();
    else if (state === "paused") resume();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") pause();
  });

  applyPreset(defaults);
  reset();

  setInterval(update, 50);
}

const html = `
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport"
      content="width=device-width, initial-scale=1">
<style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    body {
        background: #182332;
        color: white;
        font-family: -apple-system, system-ui, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 150ms;
        padding: 20px;
    }

    main {
        width: 100%;
        max-width: 850px;
        text-align: center;
    }

    #phase {
        font-size: clamp(22px, 5vw, 42px);
        font-weight: 700;
        letter-spacing: .08em;
    }

    #time {
        font-size: clamp(80px, min(28vw, 32vh), 260px);
        font-weight: 800;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
    }

    #round {
        font-size: clamp(20px, 4vw, 32px);
        margin-top: 18px;
    }

    #total {
        opacity: .75;
        margin-top: 8px;
        font-size: 18px;
    }

    .track {
        height: 9px;
        border-radius: 9px;
        background: #ffffff30;
        overflow: hidden;
        margin: 24px 0;
    }

    #progress {
        width: 100%;
        height: 100%;
        background: white;
        border-radius: 9px;
    }

    button {
        border: none;
        border-radius: 14px;
        padding: 15px 20px;
        margin: 5px;
        background: #ffffff25;
        color: white;
        font-size: 17px;
        font-weight: 600;
    }

    #start {
        background: white;
        color: #182332;
        width: 95%;
        margin-top: 20px;
    }

    .fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 15px;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        text-align: left;
        font-size: 14px;
    }

    input {
        width: 100%;
        border: none;
        border-radius: 10px;
        padding: 12px;
        background: #ffffff20;
        color: white;
        font-size: 20px;
    }

    #note {
        margin-top: 20px;
        font-size: 12px;
        opacity: .65;
    }
</style>
</head>
<body>
<main>
    <div id="phase">PÍPÁK</div>
    <div id="time">--</div>

    <div class="track">
        <div id="progress"></div>
    </div>

    <div id="round"></div>
    <div id="total"></div>

    <section id="setup">
        <button id="tabata">Tabata</button>
        <button id="minute">Minutové série</button>

        <div class="fields">
            <label>Cvičení (s)
                <input id="work" type="number" min="1">
            </label>
            <label>Odpočinek (s)
                <input id="rest" type="number" min="0">
            </label>
            <label>Počet kol
                <input id="rounds" type="number" min="1">
            </label>
            <label>Odpočet (s)
                <input id="countdown" type="number" min="0">
            </label>
            <label>Příprava (s)
                <input id="preparation" type="number" min="0">
            </label>
        </div>

        <button id="start">Spustit trénink</button>
    </section>

    <section id="controls" hidden>
        <button id="pause">Pozastavit</button>
        <button id="reset">Reset</button>
    </section>

    <div id="note">Pípák Visual · v0.1</div>
</main>

<script>
    (${main.toString()})(${JSON.stringify(defaults)});
</script>
</body>
</html>
`;

const webView = new WebView();
await webView.loadHTML(html);
await webView.present(true);

Script.complete();
