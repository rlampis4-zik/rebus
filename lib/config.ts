/**
 * Lettura e validazione delle variabili d'ambiente.
 *
 * Fallire subito all'avvio con un messaggio chiaro è molto meglio che
 * scoprire una env mancante come `undefined is not a function` dentro una
 * query, in produzione, mesi dopo.
 */

function richiesta(nome: string): string {
  const v = process.env[nome];
  if (!v || v.trim() === '') {
    throw new Error(
      `Variabile d'ambiente ${nome} mancante. ` +
        `In locale: 'vercel env pull .env.local'. Su Vercel: Settings > Environment Variables (poi rifai il deploy).`,
    );
  }
  return v;
}

function opzionale(nome: string): string | undefined {
  const v = process.env[nome];
  return v && v.trim() !== '' ? v : undefined;
}

/**
 * L'integrazione Neon di Vercel popola DATABASE_URL; i template "Vercel
 * Postgres" popolano POSTGRES_URL. Accettiamo entrambi per non dipendere da
 * quale delle due strade è stata usata per collegare il DB.
 */
function connectionString(pooled: boolean): string {
  const url = pooled
    ? opzionale('DATABASE_URL') ?? opzionale('POSTGRES_URL')
    : opzionale('DATABASE_URL_UNPOOLED') ?? opzionale('POSTGRES_URL_NON_POOLING');

  if (!url) return richiesta(pooled ? 'DATABASE_URL' : 'DATABASE_URL_UNPOOLED');

  // Errore silenzioso classico: la connection string diretta usata a runtime.
  // Non rompe subito, degrada sotto carico quando le connessioni si accumulano.
  const haPooler = url.includes('-pooler.');
  if (pooled && !haPooler) {
    console.warn(
      '[config] La connection string di runtime non sembra pooled (host senza "-pooler"). ' +
        'In serverless usa quella pooled.',
    );
  }
  return url;
}

export const config = {
  databaseUrl: connectionString(true),
  databaseUrlDiretta: () => connectionString(false),

  /** Durata cache CDN. Il contenuto è immutabile, quindi si può essere generosi. */
  cache: {
    sMaxAge: Number(process.env.CACHE_S_MAXAGE ?? 3600),
    staleWhileRevalidate: Number(process.env.CACHE_SWR ?? 86400),
  },

  sync: {
    limiteDefault: 200,
    limiteMax: 500,
  },

  isProduzione: process.env.VERCEL_ENV === 'production',
} as const;
