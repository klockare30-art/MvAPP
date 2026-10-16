# Testa GoalieVision på iPaden

Det här är första gången appen körs på riktig hårdvara, och även första gången klippmodulens Swift-kod kompileras. Det är normalt att något behöver rättas. Fyll i resultatkolumnen och skicka tillbaka protokollet med ev. felmeddelanden eller skärmdumpar, så rättar jag.

## Förberedelser (en gång, på Windows)

Du behöver:
- **Apple Developer Program** (99 USD/år). Ett gratis Apple-ID räcker inte för att installera egna appar via EAS.
- ett gratis **Expo-konto** (expo.dev)
- **Node.js 22 LTS** och Git
- iPaden uppdaterad till senaste iPadOS, på samma Wi-Fi som datorn

```powershell
git clone https://github.com/klockare30-art/MvAPP.git
cd MvAPP
git checkout claude/peaceful-archimedes-y2apwt
npm install
```

1. **Bundle-id:** öppna `app.json` och byt `"bundleIdentifier": "com.goalievision.app"` till något du äger, t.ex. `se.klockare.goalievision`.
2. **Koppla projektet till ditt Expo-konto:** `npx eas-cli@latest login`, sedan `npx eas-cli@latest init`. Det skriver ett `projectId` i `app.json`; committa den ändringen.
3. **Registrera iPaden:** `npx eas-cli@latest device:create`. Öppna länken **i Safari på iPaden** och installera profilen.
4. **Bygg:** `npm run build:ios:dev`. Välj att logga in med ditt Apple-konto när EAS frågar; certifikat och profiler skapas automatiskt. Bygget tar ca 15–30 min i molnet.
5. **Installera:** öppna bygglänken eller QR-koden på iPaden och tryck *Installera*.
6. **Utvecklarläge:** Inställningar → Integritet och säkerhet → **Utvecklarläge** → på. iPaden startar om.
7. **Starta:** kör `npx expo start` på datorn och öppna GoalieVision på iPaden. Den hittar datorn via Wi-Fi.
   - Tillåt Node i Windows brandvägg om frågan kommer.
   - Fungerar det inte: `npx expo start --tunnel`.

> Felsökning av bygget: på expo.dev → ditt projekt → Builds finns hela loggen. Kopiera felet till mig.

För träning i ishallen utan dator: `npm run build:ios:preview` ger en fristående version som inte behöver utvecklingsservern.

## Testprotokoll

Gör testerna i **flygplansläge** utom avsnitt E. *Inställningar → Testdata → Skapa exempeldata* skapar laget och målvakterna.

### A. Grundflöde (acceptanstest fas 1)

| # | Gör så här | Förväntat | Resultat |
|---|---|---|---|
| A1 | Öppna appen | Liggande läge, mörkt tema, inga fel | |
| A2 | Träningar → Målvaktsträning U16 → STARTA TRÄNING | Behörighetsfråga för kamera och mikrofon (svenska texter) | |
| A3 | Tillåt | Kamerabild 16:9, målvakter och fokusområden syns, Scanning syns | |
| A4 | Välj Erik #30 och Förflyttningar → SPELA IN | Röd ram, timer räknar, "Spelar in: Erik #30 · Förflyttningar" | |
| A5 | Försök trycka på William under inspelning | Går inte, meddelande om att stoppa först | |
| A6 | Efter ca 2 min: STOPPA | "Videon är sparad" inom några sekunder, kameran redo igen | |
| A7 | VISA SENASTE KLIPP (nere till vänster i bilden) | Videon spelas | |
| A8 | Tryck 0.5x och 0.25x | Slowmotion, mjuk uppspelning | |
| A9 | Pausa, tryck +1 bild / −1 bild några gånger | Exakt en bildruta per tryck | |
| A10 | Zooma med två fingrar och med 2x/3x | Zoom och panorering fungerar | |
| A11 | TILLBAKA TILL KAMERA | Erik och Förflyttningar fortfarande valda; kameran startar inom ca 1 s | |
| A12 | Välj William #35 → SPELA IN → STOPPA efter ca 20 s | Sparas; William visar "1" på knappen | |
| A13 | Avsluta → Videobibliotek | Eriks video hos Erik, Williams hos William | |
| A14 | Stäng appen helt (svep bort) och öppna igen | Båda videorna och all metadata finns kvar | |
| A15 | Spela upp en video i biblioteket | Bilden är rättvänd (inte upp och ner/stående) | |

### B. Robusthet

| # | Gör så här | Förväntat | Resultat |
|---|---|---|---|
| B1 | Spela in, tryck hemknappen under inspelningen | Inspelningen stoppas och sparas för rätt målvakt | |
| B2 | Spela in, tvinga stängning av appen mitt i (svep bort) | Vid nästa start: gul ruta "återställdes"; videon spelbar eller tydligt markerad | |
| B3 | Spela in 10 min i sträck | Ingen hackig kamerabild, ingen krasch, filen sparas | |
| B4 | Inställningar → Lagring | Rimligt ledigt utrymme och uppskattad inspelningstid | |
| B5 | Dubbeltryck snabbt på SPELA IN och sedan STOPPA | Exakt en inspelning skapas | |

### C. Klippning (fas 2)

| # | Gör så här | Förväntat | Resultat |
|---|---|---|---|
| C1 | Öppna en ca 2 min lång video → **Klipp** | Klippvy med gul markering över hela videon | |
| C2 | Dra start- och slutmarkörerna, eller använd *Sätt START/SLUT här* | Start, längd och slut uppdateras | |
| C3 | Spela markering | Spelar bara markeringen och börjar om vid slutet | |
| C4 | Markera t.ex. 00:42–01:03 → Spara som nytt klipp | Sparas inom några sekunder | |
| C5 | Skapa ett till klipp från samma video | Båda klippen finns i biblioteket, märkta "Klipp" | |
| C6 | Spela upp klippet | Börjar exakt vid vald start, längd ca 21 s, samma kvalitet | |
| C7 | Ersätt originalet på en annan video | Klippet finns kvar, originalet borta, ledigt utrymme ökar | |

### D. Planering

| # | Gör så här | Förväntat | Resultat |
|---|---|---|---|
| D1 | Skapa nytt lag, ny målvakt och en träning från början | Allt går att göra med handskar på | |
| D2 | Duplicera en träning | Samma målvakter och fokusområden, går att ändra innan start | |

### E. Målvaktsportalen (endast om Supabase är uppsatt, se docs/PORTAL.md)

| # | Gör så här | Förväntat | Resultat |
|---|---|---|---|
| E1 | Inställningar → Målvaktsportal → skapa konto, bekräfta e-post, logga in | Inloggad | |
| E2 | Målvakt → e-post + samtycke → Publicera en kort video (helst ett klipp) | Uppladdning med procent, "Publicerad till …" | |
| E3 | Logga in i portalen med målvaktens e-post (i mobilen) | Videon syns och spelas, 0.5x fungerar | |
| E4 | Kommentera i portalen → läs i appen under Kommentarer | Kommentaren syns | |
| E5 | Logga in i portalen som en annan målvakt | Ser inte den första målvaktens video | |

## Det här vet jag inte än – titta särskilt på

- **Kompilering:** att klippmodulen (`modules/goalievision-trim`) kompilerar. Det syns i bygget (steg 4).
- **Bildfrekvens:** att 1080p faktiskt ger 30 bilder/s. Om bildsteg hoppar 2 bilder åt gången stämmer inte bildfrekvensen.
- **Kameraomstart:** att kameran startar om korrekt efter VISA SENASTE KLIPP (A11).
- **Ljud:** hur ljudet beter sig när en video spelas upp direkt efter inspelning.
- **Klippstart:** att klipp börjar exakt vid vald tid och inte vid närmaste nyckelbildruta (C6).
