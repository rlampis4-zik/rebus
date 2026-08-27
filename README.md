# Backend rebus — Neon + Vercel

API di sola lettura su Vercel Functions, dati su Neon Postgres.
Nessun endpoint di scrittura pubblico: lo script admin scrive direttamente sul DB.

```
migrations/001_init.sql      schema
lib/hash.ts                  normalizzazione + hashing (condiviso col generatore)
lib/db.ts                    client Neon + helper risposte
api/v1/sync.ts               GET /v1/sync?since=&limit=
api/v1/rebus/[id].ts         GET /v1/rebus/:id
scripts/upsert-esempio.ts    inserimento idempotente lato admin
```

## 1. Progetto Neon

Crea il progetto scegliendo la region più vicina agli utenti (per l'Italia, `eu-central-1`).
Il piano free è per progetto, non per account: se in futuro vuoi separare staging da produzione, sono due progetti distinti.

## 2. Collegarlo a Vercel

Due strade.

**Integrazione dal marketplace (consigliata).** Dalla dashboard Vercel, tab **Storage** → aggiungi Neon dal marketplace e collegalo al progetto. Vercel inietta da solo le variabili d'ambiente (`DATABASE_URL`, `DATABASE_URL_UNPOOLED` e affini) in tutti gli ambienti, e crea un branch di database per ogni deploy di preview — che significa poter testare una migrazione senza toccare i dati di produzione.

**Manuale.** Copi la connection string dalla dashboard Neon e la incolli in Vercel → Settings → Environment Variables come `DATABASE_URL`. Va bene se preferisci non dare a Vercel accesso all'account Neon, ma perdi il branching automatico.

In entrambi i casi: dopo aver aggiunto o cambiato una variabile devi **rifare il deploy**, le env non vengono applicate a caldo.

## 3. Pooled vs diretta

Neon espone due connection string e scambiarle è l'errore più comune:

| | host | quando |
|---|---|---|
| **Pooled** | contiene `-pooler` | runtime, tutte le function → `DATABASE_URL` |
| **Diretta** | senza `-pooler` | migrazioni e script admin da CLI → `DATABASE_URL_UNPOOLED` |

Il driver HTTP `@neondatabase/serverless` va sempre sulla pooled. Le migrazioni con DDL vanno sulla diretta, perché passano da transazioni lunghe che il pooler in transaction mode non gestisce bene.

## 4. Migrazione

```bash
npm i @neondatabase/serverless
psql "$DATABASE_URL_UNPOOLED" -f migrations/001_init.sql
```

Puoi tirare giù le env di Vercel in locale con `vercel env pull .env.local`.

## 5. Chiave di cifratura

```bash
openssl rand -hex 32   # -> REBUS_ENC_KEY
```

Serve solo allo script admin, **non** va messa fra le env di Vercel: il backend non cifra nulla a runtime. La stessa chiave va compilata dentro l'APK per il "rivela". Vedi l'avvertenza in `lib/hash.ts`: è offuscamento, non sicurezza.

## 6. Cache

Le risposte hanno `s-maxage=3600, stale-while-revalidate=86400`. È il motivo per cui il piano free regge: la CDN serve quasi tutto e il DB resta quasi sempre addormentato.

Il rovescio della medaglia: dopo aver pubblicato nuovi rebus **restano invisibili fino a un'ora**. Alla fine dello script admin invalida la cache, altrimenti ti sembrerà che la pubblicazione non abbia funzionato:

```bash
curl -X POST "https://api.vercel.com/v1/purge?projectIdOrName=$PROJECT" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

In alternativa, se il ritardo non ti dà fastidio, non fare nulla: si allinea da solo.

## 7. Cosa non c'è, di proposito

- **Nessun progresso utente lato server.** Senza account non c'è nulla da sincronizzare. Tenerlo in SQLite sull'APK elimina auth, rate limiting e tutta la superficie di scrittura. Si aggiunge dopo, se serve il multi-device.
- **Nessuna immagine nel DB.** Con 0,5 GB e vignette da ~150 KB ti fermeresti a poche centinaia di rebus. Vanno su Vercel Blob o Cloudflare R2; nel DB solo l'URL.
- **Nessuna route admin.** La revisione draft → approved → published si fa da uno script o da un client SQL. Un pannello web è la prima cosa da aggiungere quando i rebus da revisionare diventano tanti.
