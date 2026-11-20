# Pípák Visual

Intervalový časovač pro iPhone a iPad. Běží jako samostatný JavaScript ve [Scriptable](https://apps.apple.com/cz/app/scriptable/id1405459188); bez kompilace, sideloadingu, serveru či externích zvukových souborů.

## Instalace

1. Nainstaluj Scriptable z App Storu.
2. Vytvoř nový skript a zkopíruj do něj obsah `Pipak.js`.
3. Spusť skript v aplikaci. Volitelně vytvoř zkratku Scriptable → Run Script s volbou Run in App a přidej ji na plochu.

## Funkce verze 0.2

- Tabata 8 × 20/10 s, minutové série 5 × 60 s, vlastní tréninky.
- Více sérií, příprava, odpočinky, výstražná pípnutí.
- Barevné fáze, odpočet, následující fáze, celkový průběh, pauza a reset.
- Syntetické tóny s vlastní regulací amplitudy.
- Pojmenované předvolby a poslední konfigurace v iCloudu s lokální zálohou.

Pauza mezi sériemi nahrazuje poslední krátký odpočinek dané série. Po poslední sérii se běžný odpočinek zachovává.

## Kompatibilita

Verze 0.1 byla ověřena na iOS 18 a iPadOS 15.8.8; na iPadu fungovala i při přehrávání Apple Music a displej zůstal během tabaty aktivní. Verzi 0.2 je třeba ověřit zejména při ukládání a synchronizaci. Při přechodu na pozadí se vizuální časovač při detekci této události pozastaví. Souběžné změny konfigurace na více zařízeních se neslučují; rozhoduje poslední uložená verze.

## Vývoj

`Pipak.js` je jediný distribuovaný soubor. HTML a funkce pro WebView jsou vloženy přímo do skriptu. Nativní vrstva Scriptable zajišťuje uložení konfigurace.

```sh
biome lint .
biome check --write .
node --test tests/*.test.mjs
node --input-type=module --check < Pipak.js
```

Biome není součástí runtime; pro lokální vývoj lze využít existující instalaci. Testy používají standardní knihovnu Node.js a nepotřebují další balíčky. Neprověřují skutečný WebView ani iCloud.
