# Första test på iPaden med Expo Go (gratis)

> Med Claude Code på datorn: be den följa `docs/LOKAL-START.md`. Den gör installationen och startar servern.

Expo Go är en gratis app från App Store som kör GoalieVision direkt från din dator via Wi-Fi. Den kräver inget Apple Developer-konto, ingen kabel och ingen Mac. Det fullständiga bygget beskrivs i `IPAD-TEST.md` och kräver Apple Developer-konto.

## Skillnader mot ett eget bygge

| | Expo Go | Eget bygge (EAS) |
|---|---|---|
| Inspelning, bibliotek, uppspelning, slowmotion, bildsteg, zoom | Ja | Ja |
| Publicering till portalen | Ja | Ja |
| **Klippning** | **Nej.** Klippvyn visar att den kräver ett eget bygge. | Ja |
| Behörighetsfrågor | Expo Gos egna texter, inte appens svenska | Appens svenska texter |
| Kräver datorn igång | Ja, för att starta och ladda om appen | Nej (preview-bygge) |
| Flygplansläge | Testas inte här. Appen laddas från datorn. | Ja |
| Data | Ligger i Expo Go. Tas bort om Expo Go raderas. | Ligger i appen |

**Osäkert innan första försöket:** Expo Go i App Store stöder normalt bara den senaste Expo-versionen. Projektet använder **SDK 57**. Om Expo Go säger att projektet är inkompatibelt med versionen fungerar inte den här vägen. Skicka då felet till mig.

## 1. Förberedelser på Windows (en gång)

1. Installera **Node.js 22 LTS** (nodejs.org) och **Git** (git-scm.com). Starta om PowerShell efteråt.
2. Hämta koden:
   ```powershell
   git clone https://github.com/klockare30-art/MvAPP.git
   cd MvAPP
   git checkout claude/peaceful-archimedes-y2apwt
   npm install
   ```
3. **Koppla portalen (valfritt, behövs för test E):** skapa filen `.env` i mappen `MvAPP` med:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://ykhvqsavvdvvjsdnxtok.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<samma publishable key som i Netlify>
   EXPO_PUBLIC_PORTAL_URL=https://goalievision.netlify.app
   ```
   Använd **aldrig** nyckeln *secret* / *service_role*. `.env` laddas inte upp till GitHub.
4. På iPaden: installera **Expo Go** från App Store.

## 2. Starta

```powershell
cd MvAPP
npx expo start --go
```

- `--go` behövs. Utan flaggan väntar datorn på ett eget bygge i stället för Expo Go.
- Tillåt Node.js i Windows brandvägg (privat nätverk) när frågan kommer.
- Datorn och iPaden måste vara på **samma Wi-Fi**.
- Skanna QR-koden i terminalen med iPadens **kamera-app** och tryck på länken. Expo Go öppnar appen. Första laddningen tar en stund.
- Hittas inte datorn, till exempel på ett gäst-Wi-Fi som isolerar enheter: stoppa med `Ctrl+C` och kör `npx expo start --go --tunnel`. Svara ja om den vill installera ett tilläggspaket.
- Står iPaden i stående läge: vrid den. Appen är byggd för liggande läge.

## 3. Testa

Använd protokollet i `IPAD-TEST.md` med dessa ändringar:

- **Kör inte i flygplansläge.** Appen behöver kontakt med datorn i Expo Go.
- **A2:** behörighetstexten kommer från Expo Go och är inte svensk. Det är väntat.
- **B2** (tvinga stängning): öppna sedan Expo Go igen och välj projektet under *Recently opened*.
- **C (klippning):** hoppa över. Kontrollera bara att *Klipp* visar att det kräver ett eget bygge och inte kraschar.
- **E (portalen):** tränarkontot i appen använder e-post och lösenord. Har du loggat in i portalen med kod: sätt ett lösenord under portalen → **Kontrollpanel → Lösenord för iPad-appen**, och logga sedan in i appen med samma e-post. Använd inte "Skapa tränarkonto", eftersom det ger en annan tränare utan dina lag.

Fyll i resultatkolumnen och skicka tillbaka den med skärmdumpar eller felmeddelanden. Röda felskärmar i Expo Go innehåller texten jag behöver; fota eller skärmdumpa hela.
