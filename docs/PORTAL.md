# Målvaktsportalen – uppsättning och drift

Målvaktsportalen är en webbsida där varje målvakt loggar in med sin e-postadress och ser **endast sina egna** videor. Där kan de spela upp i slowmotion, stega bild för bild och läsa och skriva kommentarer. Endast videor som tränaren uttryckligen publicerar från iPaden laddas upp. Allt annat stannar på iPaden.

```
iPad-appen ── publicera ──▶ Supabase (EU) ◀── webbläsare ── målvakt
  (offline)                  • Postgres + RLS            (mobil/dator)
                             • privat videolagring
                             • e-postinloggning
```

## Delar

| Del | Plats | Teknik |
|---|---|---|
| Databas, behörigheter, lagring | `supabase/migrations/` | Supabase (Postgres, RLS, Storage, Auth) |
| Säkerhetstester | `supabase/tests/`, `npm run test:db` | Postgres 15+ lokalt |
| Webbportal | `portal/` | Vite + React + supabase-js (statisk sida) |
| Publicering i appen | `src/services/cloud/`, `src/features/portal/` | supabase-js + native uppladdning |

## Säkerhetsmodell (testad)

`npm run test:db` kör 110 kontroller mot riktig Postgres. Bland annat:

- en målvakt ser bara sina egna videor, filer och kommentarer
- en tränare ser bara sina egna målvakter
- målvakter kan varken ladda upp, publicera, ändra profiler eller kommentera som tränare
- ej verifierad e-post ger ingen åtkomst
- återkallad åtkomst och ändrad e-post stänger av åtkomsten direkt
- radering av en målvakt tar bort videor och kommentarer
- nya tränare kan inte ladda upp eller lägga till målvakter förrän admin har godkänt dem
- tränare kan inte aktivera sig själva, välja nivå, ändra betaldatum eller göra sig till admin
- nivåns gränser för lagring och antal målvakter gäller, och utgånget betaldatum eller avstängning stoppar uppladdning
- avstängda tränare kan fortfarande återkalla åtkomst och radera målvakter (radering på begäran)

Dessutom:
- Videofilerna ligger i en **privat** bucket och nås bara via signerade länkar som gäller i 1 timme.
- Publicering kräver att tränaren har registrerat **samtycke** för målvakten.

## 0. Prova demon först (inget konto behövs)

Portalen har ett demoläge med exempeldata som körs helt i webbläsaren. Ingen server används och ingenting laddas upp.

```powershell
cd portal
npm install
npm run dev:demo        # öppna adressen som skrivs ut, t.ex. http://localhost:5173
```

Logga in med valfri e-post och koden `123456`. `npm run build:demo` bygger demon till `portal/dist-demo/`. Det vanliga bygget (`npm run build`) innehåller ingen demokod.

## 1. Skapa Supabase-projektet

1. Skapa ett konto på supabase.com och ett nytt projekt. Välj en **EU-region** (t.ex. Stockholm om den finns, annars Frankfurt/Irland).
2. **SQL Editor** → klistra in hela `supabase/migrations/20261014000000_goaltender_portal.sql` → *Run*.
3. **Authentication → Providers → Email**: aktiverad, och *Confirm email* **på** (krävs: åtkomst kopplas via verifierad e-post).
4. **Authentication → URL Configuration**: *Site URL* = portalens adress. Lägg även till den under *Redirect URLs*.
5. **Authentication → Email Templates → Magic Link**: se till att mallen innehåller både `{{ .ConfirmationURL }}` och `{{ .Token }}`, så att målvakten kan logga in med kod om länken öppnas i fel webbläsare. Översätt gärna texten till svenska.
6. **Storage → Settings**: kontrollera *maximal filstorlek*. Se avsnittet Kostnader nedan.
7. **Project Settings → API**: kopiera *Project URL* och *anon public key*.

## 1a. Inloggning

- **Målvakter** loggar in utan lösenord, med länk eller kod via mejl (fliken *Målvakt*).
- **Tränare** loggar som standard in med **e-post och lösenord** (fliken *Tränare*). Samma konto fungerar i iPad-appen.
  - Lösenordet ska vara minst 10 tecken. Om skyddet mot läckta lösenord är påslaget i Supabase nekas lösenord som läckt tidigare.
  - **Nytt tränarkonto:** skapas med e-post och lösenord och bekräftas via mejl. Tränarprofilen skapas vid första inloggningen och får status *väntar på godkännande*.
  - **Glömt lösenord, eller inget lösenord än** (t.ex. konton skapade med kod): logga in med kod och sätt ett lösenord under **Kontrollpanel → Lösenord för iPad-appen**.

## 1b. Admin, tränare och nivåer

Migreringen `supabase/migrations/20261016000000_coach_access.sql` lägger till administration. Kör den i **SQL Editor** efter den första migreringen.

**Gör dig själv till admin** (en gång). Logga först in i portalen med din e-post så att användaren finns, och kör sedan i SQL Editor:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'din@epost.se';
```

Admin kan bara läggas till här. Appen och portalen kan inte göra någon till admin.

**Flödet:**
1. Tränaren skapar konto och loggar in i iPad-appen (Inställningar → Målvaktsportal). Kontot får status *Väntar på godkännande* och kan inte publicera ännu.
2. Tränaren betalar, utanför appen: faktura, Swish, Stripe eller liknande.
3. Du loggar in i portalen → **Admin** → väljer nivå och *betalt t.o.m.* → **Godkänn** / **Spara**.
4. När betaldatumet passerat stoppas nya uppladdningar och nya målvakter automatiskt. Publicerade videor finns kvar tills de tas bort. Förläng med *+1 månad* / *+1 år*. Tomt datum betyder att kontot inte har något slutdatum.

**Nivåer** (Admin → Nivåer): namn, lagring i GB, max antal målvakter och en prisanteckning. Prisanteckningen visas bara för dig. Nivån *Start* (1 GB, 10 målvakter) skapas från början. Gränserna gäller direkt för alla tränare på nivån.

- Lagringen räknas på tränarens uppladdade filer. Kontrollen görs före varje uppladdning, så en enskild video kan hamna något över gränsen.
- Summan av alla tränares nivåer måste rymmas i ert Supabase-abonnemang.
- Ett pris i appen (köp i iPad-appen) är inte byggt. Apples regler för digitala abonnemang styr det och behöver kontrolleras innan det byggs.

## 2. Bygg och publicera portalen

```powershell
cd portal
copy .env.example .env.local      # fyll i VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY
npm install
npm run build                     # resultat i portal/dist
```

`portal/dist` är en statisk sida som kan läggas på valfri statisk webbhotell-tjänst. Exempel: Netlify (dra och släpp mappen), Cloudflare Pages eller Vercel. Där sätter du rotkatalog `portal`, byggkommando `npm run build`, publiceringsmapp `dist` och samma två miljövariabler. Använd en HTTPS-adress och lägg in den i steg 1.4.

Lokalt test: `npm run dev` i `portal/`.

## 3. Koppla appen

Skapa `.env` i projektroten (se `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=https://<projekt>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_PORTAL_URL=https://<din portal>
```

- `npx expo start` läser `.env` direkt.
- **EAS-byggen laddar inte upp `.env`** (den ignoreras av git). Lägg därför in variablerna i EAS en gång:
  `npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://… --environment preview --visibility plaintext`
  Upprepa för de andra två variablerna, och för miljöerna `development` och `production`.
- Utan variablerna fungerar appen som tidigare, helt offline, och portaldelarna döljs.

## 4. Använda portalen

1. **Appen → Inställningar → Målvaktsportal → Skapa tränarkonto.** Bekräfta via mejlet och logga sedan in.
2. **Målvakt → Redigera:** fyll i e-post och slå på *Samtycke till publicering* när samtycke finns.
3. **Videobibliotek → video → Publicera till Erik.** Uppladdningen visar förlopp. Håll appen öppen, gärna på Wi-Fi.
4. Ge målvakten portalens adress. Hen anger sin e-post, klickar på länken (eller skriver koden) och ser sina videor.
5. **Kommentarer:** målvakten skriver i portalen. Du läser och svarar via *Kommentarer* i videovyn i appen eller i portalen, där du kan logga in med samma tränarkonto.
6. **Ta bort:** *Publicerad till …* → *Ta bort* på en video, eller *Ta bort all portaldata* på målvaktens profil (radering på begäran).

## 4b. Klubbar, lag och målvakter (portalen → Mina lag)

Kräver migreringen `supabase/migrations/20261018000000_clubs_teams.sql`. Kör den i SQL Editor efter de tidigare migreringarna.

- Strukturen är **klubb → lag → målvakter**, och den är **per tränare**: varje tränare ser och ändrar bara sin egen. Det upprätthålls av databasen och är testat.
- Klubbar och lag kan skapas medan kontot väntar på godkännande. Målvakter kan läggas till först när kontot är aktivt, och inom nivåns gräns.
- **Per målvakt:** ändra (namn, nummer, e-post, lag), stäng av eller slå på åtkomst, och radera.
  - *Radera* tar bort målvaktens videofiler, publiceringar och kommentarer, så det är radering på begäran.
- Tar du bort ett lag eller en klubb finns målvakterna kvar, utan lag.
- När ett klipp skickas från matchtaggningen får det lagets namn.
- **Inte byggt:**
  - flera tränare som delar samma klubb och samma målvakter
  - synk med lagen i iPad-appen

## 4c. Tränarens bibliotek, och att ta bort klipp och matcher

Kräver migreringen `supabase/migrations/20261020000000_session_kind.sql`, som går att köra flera gånger.

- Tränarens klipp visas som **klubb → lag → målvakt → Matcher/Träningar → rubrik och datum → klippen**.
  - Matchklipp visar var i matchen klippet ligger.
- **Typ:** matchtaggningen frågar efter Match eller Träning, med Match som standard. iPad-appen sparar alltid som Träning.
  - Klipp sparade innan typen fanns visas under "Utan typ (äldre klipp)".
- Målvakter ser sina egna videor per dag och pass, som tidigare.
- **Hantera klipp** (syns bara för tränare): välj **Ta bort** på ett klipp, eller **Ta bort matchen** för alla klipp i gruppen. Det går också från videovyn med **Ta bort klipp**.
- Det som tas bort är publiceringen, filen och kommentarerna. Målvakten ser klippet inte längre.
- En tränare kan bara ta bort klipp som hen själv har publicerat. Det är testat i databasen.
- Originalet på iPaden eller datorn påverkas inte.
- Taggarna i matchtaggningen och iPad-appen kan fortfarande visa klippet som publicerat, eftersom det inte synkas.

## 4d. Kontrollpanel – egna taggar och kortkommandon

Kräver migreringen `supabase/migrations/20261019000000_tag_types.sql`. Kör den i SQL Editor.

- Portalen → **Kontrollpanel**, som syns för tränare. Där finns taggarna som används i matchtaggningen.
  - Per tagg: färg, namn, kortkommando och sekunder före och efter.
  - Taggar kan läggas till, tas bort och flyttas, och ordningen sparas.
- Listan sparas **på tränarens konto**, inte i webbläsaren, och följer därför med till alla datorer.
- **Spärrar** i både portalen och databasen:
  - F och B är reserverade för snabbspolning.
  - Varje tangent och varje namn får bara användas en gång.
  - Högst 30 taggar.
- Har tränaren inte sparat någon egen lista används standardtaggarna: Skott, Retur, Ingång, Scanning, Mål och Övrigt.
- Tas en tagg bort finns redan gjorda taggar kvar, märkta "Borttagen tagg".

## 5. Matchtaggning (test)

Portalen → **Tagga match** visas för tränare och admin. Matchfilen öppnas från datorn och laddas **inte** upp.

- **Snabbspola:** håll knappen eller tangenten **F** för framåt och **B** för bakåt. Välj 2x, 4x, 8x eller 16x. När du släpper framåt går videon tillbaka till normal fart, 2 s bakåt.
  - Bakåt fungerar genom snabba hopp, eftersom webbläsare inte kan spela video baklänges. Det kan därför se ryckigare ut än framåt.
- **Tagga:** S skott, R retur, I ingång, C scanning, M mål, O övrigt. Klicka också går. Varje tagg blir ett klipp, som standard 6 s före och 3 s efter. Marginalerna går att ändra per tagg.
- **Spara klipp:** välj **lag**, **målvakt**, matchnamn och datum. Målvaktslistan visar bara det valda lagets målvakter.
  - Varje tagg kan få en egen målvakt, t.ex. vid målvaktsbyte. Annars används matchens målvakt.
  - **Spara klipp** eller **Spara alla/markerade** klipper ut och laddar upp. Klippen hamnar hos målvakten med taggen som fokusområde och lagets namn.
- **Markera och visa:**
  - markera klipp med rutorna, eller med **Alla** och per typ, t.ex. **Skott (5)**
  - **▶ Visa markerade** spelar klippen i följd i normal fart, med Föregående och Nästa. Det passar för genomgångar.
  - Spara och ladda ner gäller de markerade klippen, eller alla om inget är markerat.
  - Klippningen sker utan omkodning: samma kvalitet, under 1 s per klipp.
  - Bara klippet laddas upp, aldrig hela matchen.
  - Klippet börjar vid närmaste nyckelbildruta före vald start. Hur tätt de ligger visas när filen öppnas.
- **Krav för uppladdning:**
  - en godkänd tränarprofil. Klicka *Skapa tränarprofil* och godkänn den sedan under Admin.
  - en målvakt med e-post och registrerat samtycke. Målvakten kan läggas till direkt på sidan.
  - Samma säkerhetsregler och lagringsgränser gäller som för iPaden.
- **Ladda ner:** sparar klippet på datorn i stället.
- Taggarna sparas i webbläsaren per fil, så de finns kvar om sidan laddas om på samma dator.
- Målvakter som läggs till i portalen finns inte automatiskt i iPad-appen ännu (ingen synk mellan dem).

Verifierat:
- Filer på 5 min och 10 min (1080p H.264 med och utan B-bilder, AAC-ljud) och 2 h (2,8 GB).
- Analysen tar ca 1 s. Ett klipp 1 h 24 min in tas ut på under 1 s.
- Klippen avkodas felfritt med ffmpeg.
- Kör själv: `MATCH_FILE=… npx vitest run clipExport` i `portal/`.

**Ej verifierat:** uppspelning och snabbspolning i riktig Chrome/Edge med en verklig matchfil. Testwebbläsaren saknar H.264-uppspelning.

## Kostnader och begränsningar (kontrollera aktuella villkor)

- **Videostorlek:** 1080p30 H.264 ≈ 60 MB per minut, HEVC ≈ 40 MB per minut.
- **Supabase gratisnivå:** enligt dokumentationen när detta skrevs ca 1 GB lagring och max 50 MB per fil, alltså under en minut H.264 per klipp. Betalnivån (Pro) gav ca 100 GB och större filer. Priser och gränser ändras – kontrollera på supabase.com innan ni bestämmer.
- **Klipp:** trimning (fas 2) gör filerna mycket mindre och är det naturliga sättet att bara publicera det relevanta.
- **Uppladdning:** sker i förgrunden. Om appen går i bakgrunden kan uppladdningen avbrytas och får då göras om; videon finns alltid kvar på iPaden.
- **Format:** H.264 är standard eftersom det spelas i alla webbläsare. HEVC spelas i Safari och i de flesta nyare datorer med hårdvarustöd, men inte överallt. Exakt stöd i Firefox och på äldre Android-telefoner har inte verifierats.

## Integritet (GDPR) – stäm av med klubben

Det här är ingen juridisk rådgivning, men följande behöver vara klart **innan första publiceringen**:

- **Personuppgiftsansvar:** vem är ansvarig – du som tränare eller klubben?
- **Samtycke:** skriftligt samtycke från målvakten, och från vårdnadshavare för minderåriga, till att videor lagras i molnet och visas i portalen. Appen kräver att samtycket registreras per målvakt, men själva samtycket måste ni inhämta.
- **Personuppgiftsbiträdesavtal (DPA):** behövs med Supabase. De erbjuder ett standardavtal.
- **EU-region** för lagringen.
- **Rutin för radering och återkallelse:** *Ta bort all portaldata* raderar filer, profil och kommentarer.
- **Information** till målvakterna om vad som lagras, var och hur länge.

## Verifieringsstatus

| Kontroll | Status |
|---|---|
| Säkerhetsregler (RLS + lagring) mot Postgres 16 med Supabase-stubbar | 110 kontroller godkända. Avsiktliga sabotage (betalkrav, lagringsgräns och lagägarskap borttagna) fångades. |
| Portalens logik (`portal`: `npm test`) | Godkänd |
| Portalen i Chromium mot en lokal fejk-Supabase (inloggning, bibliotek, filter, uppspelning, 0,5x, hopp via tidsstämpel) | Fungerar |
| Publiceringsflödet i appen med fejkat API (ordning, städning vid fel, avpublicering, radering) | Godkänt i Jest |
| Adminsidan i Chromium (demoläge, iPad- och mobilbredd, godkännande) | Fungerar |
| Mot ett riktigt Supabase-projekt | **Ej testat** – kräver ditt projekt |
| Uppladdning från iPad (native `PUT` mot signerad URL) | **Ej testat på enhet** |
