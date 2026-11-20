# Pípák Visual

Intervalový časovač pro iPhone a iPad napsaný v JavaScriptu pro [Scriptable](https://apps.apple.com/cz/app/scriptable/id1405459188). Bez předplatného, sideloadingu a externích zvukových souborů.

## Funkce

- Tabata 8 × 20/10 s, minutové série 5 × 60 s a vlastní intervaly
- Více sérií, pauzy, úvodní příprava a výstražná pípnutí
- Barevné fáze, odpočet, přehled kol a průběhu tréninku
- Nastavitelná hlasitost signálů, pozastavení a pokračování
- Vlastní předvolby a ukládání nastavení (iCloud, případně lokálně)

## Instalace

1. Nainstaluj **Scriptable** z App Storu.
2. Zkopíruj obsah [Pipak.js](https://raw.githubusercontent.com/Mr-Tao/pipak/main/Pipak.js) do nového skriptu v Scriptable.
3. Pojmenuj jej **Pípák** (s diakritikou) a spusť.

Volitelně vytvoř ve Zkratkách akci **Run Script** s nastavením **Run in App** a přidej ji na plochu. Pokud přejmenováváš dřívější skript `Pipak`, zkontroluj ve Zkratkách, že se stále spouští správný skript.

## Automatické aktualizace

Při spuštění Pípák maximálně jednou za 24 hodin vyhledá novější **stabilní vydání** na [GitHub Releases](https://github.com/Mr-Tao/pipak/releases). Pokud je dostupné, stáhne jeho `Pipak.js`, ověří verzi, zazálohuje dosavadní skript jako `Pípák.js.bak` (nebo `Pipak.js.bak` u staršího názvu) a nahradí jej. Nová verze se použije až při dalším spuštění.

Kontrola je tichá, nevyžaduje potvrzení a nemění nastavení tréninků. Při výpadku internetu nebo chybě aktualizace pokračuje původní verze. Pro běžné cvičení není připojení k internetu potřeba. Při neúspěšné kontrole se pokus zopakuje nejdříve po hodině.

Automatické aktualizace začnou fungovat až po zveřejnění prvního stabilního vydání; samotné změny na větvi `main` se na zařízení automaticky neinstalují.

## Obnova

Pokud Pípák po aktualizaci nepůjde spustit, můžeš použít zálohu nebo samostatný [Update-Pipak.js](https://raw.githubusercontent.com/Mr-Tao/pipak/main/Update-Pipak.js). Obnovovací skript umí pracovat s názvy `Pípák` i `Pipak` a na rozdíl od automatické aktualizace stahuje aktuální kód z `main`.

## Poznámky

Vizuální režim je určen pro **rozsvícený displej**. Při přechodu WebView na pozadí se časovač při detekci události pozastaví. Spolehlivost zvuků na pozadí nelze zaručit.

Projekt používá čistý JavaScript bez runtime závislostí.
