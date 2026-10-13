# GoalieVision

iPad-app för målvaktstränare i ishockey: planera träningen i förväg, spela in direkt på isen, få varje video automatiskt kopplad till rätt målvakt och visa klippet för målvakten direkt – i slowmotion.

**Status: Fas 1 (funktionell MVP) – implementerad, typkontrollerad och enhetstestad. Ännu INTE testad på en fysisk iPad.** Se [Verifieringsstatus](#verifieringsstatus).

---

## Innehåll

1. [Teknik](#teknik)
2. [Kom igång på Windows](#kom-igång-på-windows)
3. [Köra appen på iPaden](#köra-appen-på-ipaden)
4. [Acceptanstest (fas 1)](#acceptanstest-fas-1)
5. [Arkitektur](#arkitektur)
6. [Kända begränsningar och risker](#kända-begränsningar-och-risker)
7. [Verifieringsstatus](#verifieringsstatus)
8. [Nästa steg](#nästa-steg)

---

## Teknik

| Del | Val | Kommentar |
|---|---|---|
| Ramverk | Expo SDK 57, React Native 0.86, React 19.2 | Senaste stabila SDK vid start (okt 2026) |
| Språk | TypeScript (strict + `noUncheckedIndexedAccess`) | |
| Navigering | Expo Router (filbaserad, `src/app/`) | Sidomeny + stack, inspelning som helskärms-modal |
| Kamera | `expo-camera` (`CameraView`, `recordAsync`) | Riktig inspelning, ingen simulering |
| Uppspelning | `expo-video` | Slowmotion, exakt sökning, bildsteg |
| Databas | `expo-sqlite` (SQLite, WAL, främmande nycklar på) | Migrationer i `src/db/migrations.ts` |
| Filer | `expo-file-system` (nya `File`/`Directory`-API:t) | Videor i `Documents/videos/` |
| Byggen | EAS Build (molnet) | Ingen Mac behövs |
| Test | Jest (`jest-expo`) + Nodes inbyggda `node:sqlite` | Samma SQL och migrationer som i appen |

Inga externa tjänster används. Allt fungerar offline.

## Kom igång på Windows

Krav: **Node.js 22 LTS** (≥ 22.5, behövs för testerna som använder `node:sqlite`) och Git.

```powershell
git clone <repo-url>
cd MvAPP
npm install

npm test            # enhets- och integrationstester
npm run typecheck   # TypeScript
npm run lint        # ESLint (expo-konfig + React Compiler-regler)
```

Lägg alltid till paket med `npx expo install <paket>` så att versionerna matchar SDK 57.

## Köra appen på iPaden

Kameran fungerar inte i simulatorer och iOS-appar kan inte byggas lokalt på Windows. Det finns två vägar:

### A. Snabbtest med Expo Go (enklast, begränsat)

1. Installera **Expo Go** från App Store på iPaden (måste stödja SDK 57).
2. Datorn och iPaden på samma Wi-Fi. Kör `npx expo start --go` (flaggan behövs eftersom projektet innehåller `expo-dev-client`). Om nätverket blockerar: `npx expo start --go --tunnel`.
3. Skanna QR-koden med iPadens kamera.

Alla moduler som används i fas 1 ingår i Expo Go. Begränsningar: Expo Go använder inte appens egna inställningar i `app.json` (namn, behörighetstexter, iPad-only). Orienteringen låses ändå till liggande via kod. **Fas 2 (trimning) kräver en egen native-modul och fungerar inte i Expo Go.**

### B. Development build via EAS (rekommenderat)

Kräver **Apple Developer Program** (99 USD/år) och ett gratis Expo-konto.

```powershell
npm install -g eas-cli
eas login
eas init                     # kopplar projektet till ditt Expo-konto (skriver projectId i app.json)
eas device:create            # registrera iPaden (öppna länken på iPaden och installera profilen)
npm run build:ios:dev        # = eas build --profile development --platform ios
```

1. Byt först `ios.bundleIdentifier` i `app.json` (`com.goalievision.app`) till ett id du äger, t.ex. `se.dittnamn.goalievision`.
2. EAS frågar efter Apple-inloggning och skapar certifikat och provisioneringsprofil automatiskt.
3. Öppna bygglänken/QR-koden på iPaden och installera appen.
4. På iPadOS 16+ måste **Utvecklarläge** slås på: Inställningar → Integritet och säkerhet → Utvecklarläge (iPaden startas om).
5. Starta utvecklingsservern på datorn: `npx expo start`, och öppna appen på iPaden.

### C. Fristående testversion för ishallen

`npm run build:ios:preview` bygger en version som inte behöver utvecklingsservern (intern distribution till registrerade enheter). Använd den för riktiga träningspass, eftersom ishallar ofta saknar stabilt nätverk.

## Acceptanstest (fas 1)

Genomförs på riktig iPad i flygplansläge. Tips: *Inställningar → Testdata → Skapa exempeldata* skapar Borlänge Hockey U16 med Erik #30, William #35 och Oliver #1 samt en planerad träning (inga videor skapas).

| # | Steg | Status |
|---|---|---|
| 1–3 | Öppna appen, välj Borlänge Hockey U16, starta förberedd träning | Ej verifierat på enhet |
| 4–5 | Välj Erik #30 och Förflyttningar | Ej verifierat på enhet |
| 6–8 | SPELA IN i 2 min, STOPPA | Ej verifierat på enhet |
| 9 | Inspelningen sparad lokalt | Pipeline testad med fejkkamera (se tester), ej på enhet |
| 10–12 | VISA SENASTE KLIPP, spela, 0,5x | Ej verifierat på enhet |
| 13–15 | Tillbaka till kamera, välj William #35, Förflyttningar kvar | Ej verifierat på enhet |
| 16–17 | Ny inspelning, stoppa | Pipeline testad med fejkkamera, ej på enhet |
| 18–20 | Videobiblioteket: Eriks video hos Erik, Williams hos William | Testat på databasnivå |
| 21–22 | Stäng och starta om appen, allt finns kvar | Testat på databasnivå (fil-DB stängs/öppnas) |

## Arkitektur

```
src/
  app/                     Expo Router-skärmar (endast routes)
    (main)/                Sidomeny-layout: översikt, träningar, målvakter, lag, bibliotek, inställningar
    record/[sessionId].tsx Inspelningsläge (helskärm, behörigheter)
    video/[videoId].tsx    Videospelare från biblioteken
  components/              Återanvändbara UI-komponenter (stora touchytor)
  features/
    recording/             Tillståndsmaskin, useRecorder (inspelnings-/sparpipeline), inspelnings-UI
    player/                Spelare, tidslinje, zoom/panorering, bildstegsmatematik
  db/                      SQL-gränssnitt, migrationer, expo-sqlite-adapter, seriell transaktionshantering
  repositories/            All SQL per domän (lag, målvakter, träningar, fokusområden, videor, inställningar)
  services/                Videofiler, lagringsberäkning, kraschåterställning (journal)
  state/                   AppProvider, inspelningsinställningar, useDbQuery, ändringshändelser
  domain/                  Domäntyper
  theme/                   Designsystem (färger, typografi, touch-storlekar)
test/                      Testhjälpare (node:sqlite-adapter, shims)
```

### Datamodell

Relationsmodell i SQLite med UUID som id överallt och främmande nycklar påslagna. Tabeller: `trainers`, `clubs`, `teams`, `goaltenders`, `team_memberships` (en målvakt kan tillhöra flera lag utan dubblerad profil), `focus_areas`, `exercises` (fokusområde → övning), `training_sessions`, `training_participants`, `session_focus_areas`, `session_exercises`, `video_recordings`, `video_comments`, `goal_calibrations`, `video_annotations`, `app_settings`.

Viktiga beslut:

- **Varje video tillhör exakt en målvakt**: `goaltender_id NOT NULL` + `ON DELETE RESTRICT`. Målvakter och lag med historik arkiveras i stället för att raderas.
- **Klipp (fas 2) lagras som egna rader** i `video_recordings` (`kind='clip'`, `source_video_id`, `clip_start_ms`, `clip_end_ms`). Då fungerar granskning, kommentarer, bibliotek och publicering likadant för klipp och originalinspelningar. Detta ersätter den separata `VideoClip`-entiteten i specifikationen.
- **Granskning och publicering är separata axlar** (`review_status`, `publication_status`). Allt är `local` tills tränaren uttryckligen publicerar (fas 4).
- **Endast filnamn lagras**, inte absoluta sökvägar – iOS-containerns sökväg kan ändras vid appuppdateringar.
- Tabeller för kommentarer, kalibrering och annoteringar finns redan (normaliserade koordinater) men används först i fas 3. `remote_id` finns förberett för framtida synk.

### Inspelningsflödet

Tillståndsmaskin (`src/features/recording/recordingMachine.ts`):
`IDLE → PREPARING → RECORDING → STOPPING → SAVING → SAVED` (eller `ERROR`). Ogiltiga händelser ignoreras, så dubbeltryck och sena callbacks är ofarliga. Varje försök har ett löpnummer; gamla callbacks kastas.

1. **SPELA IN**: ägaren (träning, målvakt, fokusområde, övning) fryses som en ögonblicksbild. Målvakt/fokus/övning kan inte bytas förrän inspelningen är sparad. Lagringsutrymmet kontrolleras (spärr under 1 GB) och kameran får ett maxfilstorleks-tak så att disken aldrig fylls.
2. En **journal** skrivs till databasen innan kameran startar.
3. **STOPPA** → kameran levererar filen → filen verifieras (finns, > 0 byte) → flyttas från kamerans cache till `Documents/videos/<videoId>.mov` → verifieras igen → metadata skrivs i **en transaktion** → journalen rensas → `SAVED`. Först då visas "Videon är sparad".
4. Om appen går i bakgrunden under inspelning stoppas den kontrollerat och sparas för rätt ägare. En vakthund markerar fel om kameran inte svarar inom 15 s.
5. Om appen dödas mitt i en inspelning hittar nästa start journalen och importerar kamerans temporära fil för den **journalförda** ägaren, märkt "Återställd".

Förhandsvisningen har exakt bildformatet 16:9 eftersom iOS alltid visar kameran med aspect-fill: det man ser är precis det som spelas in (viktigt när målet ska komma med i bild).

### Databasåtkomst

All SQL går genom en enda anslutning med en asynkron mutex (`src/db/serialized.ts`). Anledning: `withExclusiveTransactionAsync` i expo-sqlite öppnar en *ny* anslutning där `PRAGMA foreign_keys` inte är aktiverat, och `withTransactionAsync` låter samtidiga frågor hamna i transaktionen. Beteendet täcks av ett test.

## Kända begränsningar och risker

- **Inte testat på fysisk iPad.** Kamera, uppspelning, filhantering och prestanda (långa inspelningar, minne) måste verifieras på iPad 9:e generationen.
- **Bildfrekvens**: `expo-camera` kan inte ställa in bildfrekvens. 1080p-förinställningen ger normalt 30 bilder/s på iPad, men det är inte verifierat på enheten. Faktisk bildfrekvens läses från filen vid första uppspelning och sparas.
- **4K**: iPad 9:e gen har ingen 4K-kamera. Om 4K väljs och inte stöds behåller kameran tidigare kvalitet; appen kan inte avgöra det i förväg.
- **Videoorientering** hämtas från enhetens fysiska orientering när inspelningen startar. Ligger iPaden plant (skärmen uppåt) kan videon få stående orientering. Ha iPaden upprätt på stativet.
- **Bildsteg** sker med exakt sökning (toleransen 0) till mitten av nästa bild, baserat på videons nominella bildfrekvens. Exakt för konstant bildfrekvens (som iPadens kamera ger); variabel bildfrekvens kan ge ±1 bild.
- **Kameran pausas** medan ett klipp visas och behöver ca 1 s för att starta igen (SPELA IN är spärrad under tiden). `onCameraReady` triggas inte på nytt, därför en fast väntetid – behöver verifieras på enhet.
- **Kraschåterställning**: en fil från en avbruten inspelning är ofta, men inte alltid, spelbar.
- **iCloud-säkerhetskopia**: filer i `Documents/` ingår i iPadens säkerhetskopia. Det kan ta mycket iCloud-utrymme och är en integritetsfråga (minderåriga). Att undanta mappen kräver en liten native-modul (`NSURLIsExcludedFromBackupKey`) – planerat till fas 2.
- **Lagringsuppskattning** bygger på Apples riktvärden (≈ 40 MB/min HEVC, ≈ 60 MB/min H.264 vid 1080p30) tills det finns minst 2 minuter egna inspelningar; därefter används uppmätt snitt.
- **Filer utan metadata** (om databasskrivningen misslyckas efter att filen sparats) raderas aldrig automatiskt; de visas under Inställningar → Lagring. Import av dem kommer i fas 2.
- Datum anges som text (ÅÅÅÅ-MM-DD, TT:MM) för att undvika ett extra native-beroende.

## Verifieringsstatus

| Kontroll | Resultat |
|---|---|
| `npm test` | 48 tester godkända (tillståndsmaskin, inspelningspipeline med fejkkamera, repositories mot riktig SQLite, persistens över stängning/öppning, bildstegsmatematik, lagringsberäkning, datum) |
| `npm run typecheck` | Inga fel |
| `npm run lint` | Inga fel |
| `npx expo export --platform ios` | JS-bundle byggs (Hermes) |
| `npx expo prebuild --platform ios` | Info.plist kontrollerad: liggande, helskärm, endast iPad, svenska behörighetstexter |
| EAS-bygge | **Ej gjort** (kräver ditt Expo-/Apple-konto) |
| Fysisk iPad | **Ej gjort** |

## Nästa steg

**Först**: bygg en development build, kör acceptanstestet på iPaden och rapportera avvikelser.

Fas 2 – videohantering:
- Trimning med lokal Expo-modul (`AVAssetExportSession`, passthrough – ingen omkodning) och flera klipp per inspelning; originalet raderas aldrig före verifierad export.
- Granskningsvy efter träning med status och massåtgärder.
- Undanta videomappen från iCloud-säkerhetskopia.
- Import av filer utan metadata, städning av gamla exporter.
- Miniatyrbilder i listor.

Fas 3–5 enligt specifikationen (kommentarer, ritverktyg, målkalibrering, portal/Supabase, Bluetooth-fjärrkontroll).
