// Variables used by Scriptable.
// icon-color: blue; icon-glyph: download;
// Pípák Visual — manual updater for Scriptable.

const SOURCE_URL = "https://raw.githubusercontent.com/Mr-Tao/pipak/main/Pipak.js";
// Support installations with or without diacritics.
const SCRIPT_NAMES = ["Pípák.js", "Pipak.js"];

async function notify(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("OK");
  await alert.presentAlert();
}

function storageLocations() {
  const stores = [];

  try {
    const fm = FileManager.iCloud();
    stores.push({ name: "iCloud", fm });
  } catch (error) {
    console.log(`iCloud není dostupný: ${String(error)}`);
  }

  stores.push({ name: "Lokální úložiště", fm: FileManager.local() });
  return stores.flatMap(({ name, fm }) => SCRIPT_NAMES.map(file => ({
    name: `${name} — ${file}`,
    fm,
    path: fm.joinPath(fm.documentsDirectory(), file),
  })));
}

async function selectDestination() {
  const locations = storageLocations();
  const found = locations.filter(({ fm, path }) => fm.fileExists(path));
  if (found.length === 1) return found[0];
  if (found.length === 0) return locations[0];

  const alert = new Alert();
  alert.title = "Kam nainstalovat Pípák?";
  alert.message = "Našel jsem více verzí. Vyber soubor pro obnovu.";
  for (const { name } of found) alert.addAction(name);
  alert.addCancelAction("Zrušit");
  const index = await alert.presentAlert();
  return index < 0 ? null : found[index];
}

function versionOf(source) {
  return source.match(/^const VERSION = ["']([^"']+)["'];/m)?.[1] ?? "?";
}

async function update() {
  const target = await selectDestination();
  if (!target) return;

  const request = new Request(SOURCE_URL);
  request.timeoutInterval = 20;
  const latest = await request.loadString();
  if (request.response?.statusCode !== 200) {
    throw new Error(`GitHub vrátil HTTP ${request.response?.statusCode ?? "?"}.`);
  }

  if (
    latest.length < 5000 ||
    !latest.includes("Pípák Visual") ||
    !latest.includes("function buildTimeline(")
  ) {
    throw new Error("Stažený obsah nevypadá jako platný Pípák.");
  }

  const { fm, path } = target;
  const exists = fm.fileExists(path);
  let previous = null;
  if (exists) {
    await fm.downloadFileFromiCloud(path);
    previous = fm.readString(path);
    if (latest === previous) {
      await notify("Pípák je aktuální", `Verze ${versionOf(latest)} už je nainstalovaná.`);
      return;
    }
  }

  const alert = new Alert();
  alert.title = exists ? "Aktualizovat Pípák?" : "Nainstalovat Pípák?";
  alert.message =
    `Nová verze: ${versionOf(latest)}\nUmístění: ${target.name}\n` +
    (exists
      ? `Současná verze: ${versionOf(previous)}\nPůvodní soubor se zazálohuje.`
      : "Pipak.js ještě není v tomto úložišti.");
  alert.addAction(exists ? "Aktualizovat" : "Nainstalovat");
  alert.addCancelAction("Zrušit");
  if ((await alert.presentAlert()) !== 0) return;

  if (exists) {
    const backup = `${path}.bak`;
    fm.writeString(backup, previous);
  }
  fm.writeString(path, latest);

  await notify(
    "Hotovo",
    `Pípák ${versionOf(latest)} byl uložen (${target.name}).\n` +
      "Ukonči případný běžící trénink a spusť skript znovu.",
  );
}

try {
  await update();
} catch (error) {
  console.error(error);
  await notify("Aktualizace selhala", String(error));
} finally {
  Script.complete();
}
