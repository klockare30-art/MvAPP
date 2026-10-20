# Starta GoalieVision lokalt och testa på iPhone/iPad (Expo Go)

Den här filen är skriven för **Claude Code på tränarens Windows-dator**, eller för den som gör stegen för hand. Målet är att köra iPad-appen i **Expo Go** på en iPhone eller iPad som är på samma Wi-Fi som datorn.

Läs också `AGENTS.md` (projektregler) och `docs/EXPO-GO-TEST.md` (vad som testas och vad som skiljer Expo Go från ett eget bygge).

## Regler för den som utför stegen
- **Fråga användaren innan du installerar program** som Node eller Git, och innan du kör något som kostar pengar eller laddar upp något, t.ex. `eas build`.
- **Arbeta på grenen `claude/peaceful-archimedes-y2apwt`.** Pusha inte till någon annan gren.
- **Committa aldrig `.env`.** Den finns i `.gitignore`.
- **Rör inte databasen:** kör inga SQL-filer och ändra inget i `supabase/`. Databasen är redan uppsatt.
- **Uppgradera inte Expo-versionen på eget initiativ.** Säger Expo Go att projektet är inkompatibelt, stoppa och rapportera det exakta felet till användaren (se Felsökning).
- **Rapportera fel ordagrant.** Gissa inte.

## 1. Förutsättningar (kontrollera, installera bara efter fråga)
```powershell
node -v      # ska vara v22 eller senare
git --version
```
Saknas något: Node.js LTS från nodejs.org och Git från git-scm.com. Starta om terminalen efteråt.

På telefonen eller iPaden: installera **Expo Go** från App Store.

## 2. Hämta koden
Finns mappen redan, uppdatera den:
```powershell
cd MvAPP
git checkout claude/peaceful-archimedes-y2apwt
git pull
```
Annars, klona den:
```powershell
git clone https://github.com/klockare30-art/MvAPP.git
cd MvAPP
git checkout claude/peaceful-archimedes-y2apwt
```
Installera sedan beroenden:
```powershell
npm install
```
Gula `warn`-rader är normala. Röda `ERR!`-rader ska rapporteras.

## 3. Koppla appen till portalen (`.env`)
Skapa filen `.env` i projektroten, bredvid `package.json`:
```
EXPO_PUBLIC_SUPABASE_URL=https://ykhvqsavvdvvjsdnxtok.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<klistra in>
EXPO_PUBLIC_PORTAL_URL=https://goalievision.netlify.app
```
- **Be användaren klistra in nyckeln.** Det är samma *publishable key* (börjar med `sb_publishable_`) som ligger i Netlify under Environment variables, eller i Supabase → Project Settings → API Keys.
- **Använd aldrig** nyckeln *secret* / *service_role*.
- Utan `.env` fungerar appen ändå offline, men inte publicering till portalen.

## 4. Starta
```powershell
npx expo start --go
```
- `--go` krävs. Projektet har stöd för egna byggen och väntar annars på ett sådant i stället för Expo Go.
- Frågar Windows brandvägg: tillåt Node.js på **privata nätverk**.
- Användaren skannar QR-koden i terminalen med telefonens **kamera-app** och öppnar länken i Expo Go.
- Hittar telefonen inte datorn (t.ex. gäst-Wi-Fi som isolerar enheter): stoppa med Ctrl+C och kör `npx expo start --go --tunnel`. Svara ja om ett tilläggspaket behöver installeras.
- Datorn måste vara igång så länge appen testas.

## 5. Logga in som tränare i appen
Appen loggar in med **e-post och lösenord**. Tränarens befintliga konto är skapat med inloggningskod och har inget lösenord. Gör så här:
1. **Portalen → Kontrollpanel → "Lösenord för iPad-appen":** sätt ett lösenord på minst 10 tecken.
2. **Appen → Inställningar → Målvaktsportal:** logga in med **samma e-post** och det lösenordet. Använd inte "Skapa tränarkonto", eftersom det skapar en annan tränare utan lag och målvakter.

## 6. Testa
Följ `docs/EXPO-GO-TEST.md` och protokollet i `docs/IPAD-TEST.md`, med undantagen som står där: ingen klippning och inget flygplansläge i Expo Go.

**På iPhone:**
- Appen är byggd för iPad i liggande läge. Vrid telefonen till liggande.
- Inspelningsskärmen blir trång: namn kortas, och väljaren **Övning** kan hamna ovanpå en målvaktsknapp (känt layoutfel).
- iPhonen duger för att testa funktionerna:
  - kamera och inspelning
  - sparning per målvakt
  - slowmotion och bildstegning
  - publicering
  
  Den duger inte för att bedöma hur appen känns att använda vid isen.

**Kända luckor att känna till vid publicering från appen:**
- Målvakter i appen och målvakter i portalens **Mina lag** synkas inte.
- Publicerar appen till en målvakt skapas en egen portalprofil för den, utan lag. Den syns under "Utan klubb/lag" i portalen och räknas mot nivåns gräns för antal målvakter.
- Klipp från appen sparas som **Träning**.

## Felsökning
| Symptom | Gör så här |
|---|---|
| Expo Go: "Project is incompatible with this version of Expo Go" | Stoppa. Rapportera exakt text och vilken SDK Expo Go stöder. Uppgradera inte projektet. |
| Telefonen hittar inte datorn | Samma Wi-Fi? Tillåt Node.js i brandväggen. Prova `--tunnel`. |
| Röd felskärm i appen | Fota eller skärmdumpa hela skärmen och skicka till användaren. |
| Inloggning i appen misslyckas | Har lösenordet satts i Kontrollpanelen? Rätt e-post? |
| Publicering misslyckas | Felmeddelandet i appen säger orsaken: konto ej godkänt, lagring full eller samtycke saknas. Rapportera texten. |
