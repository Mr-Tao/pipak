# Pípák Visual

Intervalový časovač pro iPhone a iPad napsaný v JavaScriptu pro [Scriptable](https://apps.apple.com/cz/app/scriptable/id1405459188). Bez předplatného, sideloadingu a externích zvukových souborů.

## Co umí

- Tabata 8 × 20/10 s, minutové série 5 × 60 s a vlastní intervaly
- Více sérií, pauzy, úvodní příprava a výstražná pípnutí
- Barevné fáze, velký odpočet, přehled kol a průběhu tréninku
- Nastavitelná hlasitost signálů, pozastavení a pokračování
- Pojmenované předvolby a ukládání nastavení (iCloud, případně lokálně)

## Instalace

1. Nainstaluj **Scriptable** z App Storu.
2. Otevři [Pipak.js](https://raw.githubusercontent.com/Mr-Tao/pipak/main/Pipak.js) a zkopíruj jeho obsah do nového skriptu v Scriptable.
3. Skript pojmenuj **Pipak** a spusť. Volitelně jej přidej na plochu přes akci Zkratek **Run Script** (s volbou **Run in App**).

Skripty se při zapnutém iCloud Drivu mohou synchronizovat mezi iPhonem a iPadem.

## Aktualizace

Pro aktualizace bez opakovaného kopírování kódu si v Scriptable vytvoř ještě skript **Update-Pipak** z [Update-Pipak.js](https://raw.githubusercontent.com/Mr-Tao/pipak/main/Update-Pipak.js).

Při jeho spuštění se stáhne aktuální `Pipak.js` z GitHubu. Pokud se obsah změnil, updater se zeptá na potvrzení, uloží zálohu `Pipak.js.bak` a nahradí původní soubor. Aktualizace je **ruční**, vyžaduje internet a nic neinstaluje bez souhlasu.

Updater očekává název skriptu **Pipak** (soubor `Pipak.js`). Pokud jej máš v Scriptable pojmenovaný jinak, nejprve ho přejmenuj. V případě více kopií v iCloudu a lokálním úložišti se updater zeptá, kterou upravit.

Osobní konfiguraci `Pipak-settings.json` updater nemění. Při synchronizaci přes iCloud se aktualizace může projevit i na dalších zařízeních přihlášených ke stejnému účtu.

## Poznámky

Vizuální režim je určen pro **rozsvícený displej**. Pokud WebView přejde na pozadí, časovač se při detekci události pozastaví. Spolehlivost zvuků na pozadí nelze zaručit.

Zdrojový kód je v [Pipak.js](Pipak.js). Projekt používá čistý JavaScript bez runtime závislostí.
