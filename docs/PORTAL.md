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

`npm run test:db` kör 45 kontroller mot riktig Postgres. Bland annat:

- en målvakt ser bara sina egna videor, filer och kommentarer
- en tränare ser bara sina egna målvakter
- målvakter kan varken ladda upp, publicera, ändra profiler eller kommentera som tränare
- ej verifierad e-post ger ingen åtkomst
- återkallad åtkomst och ändrad e-post stänger av åtkomsten direkt
- radering av en målvakt tar bort videor och kommentarer

Dessutom:
- Videofilerna ligger i en **privat** bucket och nås bara via signerade länkar som gäller i 1 timme.
- Publicering kräver att tränaren har registrerat **samtycke** för målvakten.

## 1. Skapa Supabase-projektet

1. Skapa ett konto på supabase.com och ett nytt projekt. Välj en **EU-region** (t.ex. Stockholm om den finns, annars Frankfurt/Irland).
2. **SQL Editor** → klistra in hela `supabase/migrations/20261014000000_goaltender_portal.sql` → *Run*.
3. **Authentication → Providers → Email**: aktiverad, och *Confirm email* **på** (krävs: åtkomst kopplas via verifierad e-post).
4. **Authentication → URL Configuration**: *Site URL* = portalens adress. Lägg även till den under *Redirect URLs*.
5. **Authentication → Email Templates → Magic Link**: se till att mallen innehåller både `{{ .ConfirmationURL }}` och `{{ .Token }}`, så att målvakten kan logga in med kod om länken öppnas i fel webbläsare. Översätt gärna texten till svenska.
6. **Storage → Settings**: kontrollera *maximal filstorlek*. Se avsnittet Kostnader nedan.
7. **Project Settings → API**: kopiera *Project URL* och *anon public key*.

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
| Säkerhetsregler (RLS + lagring) mot Postgres 16 med Supabase-stubbar | 45 kontroller godkända. Ett avsiktligt sabotage av en regel fångades. |
| Portalens logik (`portal`: `npm test`) | Godkänd |
| Portalen i Chromium mot en lokal fejk-Supabase (inloggning, bibliotek, filter, uppspelning, 0,5x, hopp via tidsstämpel) | Fungerar |
| Publiceringsflödet i appen med fejkat API (ordning, städning vid fel, avpublicering, radering) | Godkänt i Jest |
| Mot ett riktigt Supabase-projekt | **Ej testat** – kräver ditt projekt |
| Uppladdning från iPad (native `PUT` mot signerad URL) | **Ej testat på enhet** |
