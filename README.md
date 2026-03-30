# Picreature

Lokální interní studio pro sjednocení portrétů do jednoho brand stylu pomocí Gemini image editing API.

## Co aplikace dělá

- nahraje 1 portrétní fotku člověka
- aplikuje zamčený preset pro světlo, crop, paletu, pozadí a sjednocení outfitu
- zachová identitu a vrátí 4 kandidáty
- umožní ruční výběr a stažení výsledku
- ukládá joby jen dočasně do `.cache/picreature/jobs`

## Co potřebuješ od Google

Pro tuhle aplikaci potřebuješ:

- Google účet
- přístup do Google AI Studio
- Gemini API key vytvořený v Google AI Studio
- v praxi doporučeně zapnutý billing pro daný projekt

### Jaké modely aplikace používá

Aplikace nepoužívá jen jeden natvrdo zadaný image model. Má řízený fallback chain:

1. `gemini-3-pro-image-preview`
   To odpovídá `Nano Banana Pro`.
2. `gemini-3.1-flash-image-preview`
   Rychlejší fallback, který v Google changelogu navazuje jako `Nano Banana 2`.
3. `gemini-2.5-flash-image`
   Konzervativní fallback pro případy, kdy preview image modely nejsou pro daný projekt dostupné.

Proč takhle:

- `gemini-3-pro-image-preview` dává nejlepší kvalitu pro brandové portréty
- ale je to preview model a Google u preview modelů výslovně uvádí, že mohou mít restriktivnější rate limity a měnit se před stabilizací
- rate limits jsou v Gemini API vázané na projekt a usage tier, ne na konkrétní API key
- různé Google projekty tak mohou mít prakticky různou dostupnost stejného modelu

Aplikace proto:

- zkusí nejdřív Nano Banana Pro
- při `403`, `404`, `429`, model-unavailable nebo dočasné nedostupnosti automaticky zkusí další model
- v UI ukáže, který model nakonec použila a proč došlo k fallbacku

### Jaký Google plán / billing je potřeba

Aktuálně je nejpraktičtější počítat s placeným provozem:

- aplikace defaultně preferuje `gemini-3-pro-image-preview`
- podle aktuálního ceníku Gemini Developer API nemá `gemini-3-pro-image-preview` free tier pro image output
- stejně tak `gemini-3.1-flash-image-preview` nemá free tier pro image output
- `gemini-2.5-flash-image` je až poslední fallback a pro reálné image generování je také bezpečnější počítat s Paid Tier
- billing Gemini API běží přes Google Cloud Billing
- od 23. března 2026 Google uvádí dva billing režimy: `Prepay` a `Postpay`; noví uživatelé defaultně padají do `Prepay`
- rate limits jsou navázané na projekt, ne na samotný API key
- vyšší quota se přidělují automaticky podle usage tieru
- Google Cloud welcome credit se na Gemini API / AI Studio nedá použít

Praktický závěr:

- na první funkční setup si založ projekt v AI Studiu
- připoj k němu billing
- vytvoř API key
- key dej do `.env.local`

### Co znamená chyba `limit: 0`

Pokud u image modelů uvidíš něco jako:

- `generate_content_free_tier_requests, limit: 0`
- `generate_content_free_tier_input_token_count, limit: 0`

znamená to typicky toto:

- Google pro ten model na tvém projektu neposkytuje free-tier kvótu
- projekt není přepnutý do placeného Gemini usage tieru
- nebo používáš projekt/API key, který není navázaný na billing

Prakticky:

- pro image modely nepředpokládej free provoz
- zapni billing v AI Studiu / Google Cloud projektu
- ověř, že API key patří právě tomuto projektu
- po změně billing nastavení appku restartuj

Když chyba vrací `429` spolu s `limit: 0`, není to klasické “počkej minutu a bude to dobré”. Ve většině případů to znamená, že bez billing změny to fungovat nebude.

## Jak získat Gemini API key

1. Otevři Google AI Studio:

   `https://aistudio.google.com/`

2. Jdi na stránku API klíčů:

   `https://aistudio.google.com/apikey`

3. Vytvoř nový API key pro nový nebo existující Google projekt.

4. Pokud tě Google vyzve k nastavení billing účtu, dokonči ho.

5. Zkontroluj v AI Studiu:

   - `Billing`, že projekt běží v placeném režimu
   - `Dashboard > Usage`, že vidíš usage a quota

6. Zkopíruj vygenerovaný klíč.

7. Pokud chceš ověřit, že je projekt nastavený správně pro image modely:

   - otevři `Billing`
   - otevři `Usage`
   - zkontroluj, že projekt není omezený jen na free-tier usage
   - pokud appka hlásí `limit: 0`, ber to jako signál, že billing / paid tier ještě není správně aktivní

## Instalace projektu

1. Nainstaluj závislosti:

   ```bash
   npm install
   ```

2. Vytvoř lokální env soubor:

   ```bash
   cp .env.example .env.local
   ```

3. Do `.env.local` vlož svůj Gemini API key:

   ```env
   GEMINI_API_KEY=sem_vloz_svuj_klic
   ```

4. Nahraj fixní style reference do `references/`:

   - `style-reference-1.jpg`
   - `style-reference-2.jpg`
   - `style-reference-3.jpg`

   Aplikace poběží i bez nich, ale konzistence bude horší.

## Spuštění lokálně

```bash
npm run dev
```

Pak otevři `http://localhost:3000`.

## Spuštění přes Docker

1. Ujisti se, že běží Docker daemon.

2. Připrav `.env.local` s `GEMINI_API_KEY`.

3. Přidej style reference do `references/`.

4. Spusť:

   ```bash
   docker compose up --build
   ```

5. Otevři `http://localhost:3000`.

Container drží dočasná data v host-mounted `./.cache`.

## Ověření

```bash
npm test
npm run build
docker compose build
```

## Bezpečnost

- API key používej jen server-side, nikdy ho neposílej do browseru
- necommituj `.env.local`
- pokud key unikne, rovnou ho zneplatni a vytvoř nový

## Poznámky

- V1 je záměrně jen lokální interní tool.
- Není tu persistentní galerie ani auth vrstva.
- `Regenerate` vytvoří nový job nad stejným zdrojovým uploadem.

## Oficiální odkazy

- Gemini API keys: `https://ai.google.dev/gemini-api/docs/api-key`
- Gemini billing: `https://ai.google.dev/gemini-api/docs/billing/`
- Gemini pricing: `https://ai.google.dev/gemini-api/docs/pricing`
- Gemini rate limits: `https://ai.google.dev/gemini-api/docs/rate-limits`
- Gemini models: `https://ai.google.dev/gemini-api/docs/models`
- Gemini changelog: `https://ai.google.dev/gemini-api/docs/changelog`
