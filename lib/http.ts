import { AppError, MethodNotAllowedError } from './errors.js';
import { config } from './config.js';

type OpzioniRisposta = { status?: number; cache?: boolean; etag?: string };

/**
 * Il dataset è statico: un rebus pubblicato non cambia più. Con questi header
 * la CDN di Vercel serve quasi tutto il traffico e il DB resta addormentato —
 * che è ciò che rende sufficiente il piano free di Neon e irrilevante il suo
 * cold start.
 *
 * Il prezzo: dopo la pubblicazione i nuovi rebus restano invisibili fino a
 * un'ora, salvo invalidare la cache alla fine dello script admin.
 */
function headerCache(): string {
  return `public, s-maxage=${config.cache.sMaxAge}, stale-while-revalidate=${config.cache.staleWhileRevalidate}`;
}

export function json(body: unknown, o: OpzioniRisposta = {}): Response {
  const status = o.status ?? 200;
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': o.cache !== false && status === 200 ? headerCache() : 'no-store',
  };
  if (o.etag) headers.etag = o.etag;
  return new Response(JSON.stringify(body), { status, headers });
}

export function notModified(etag: string): Response {
  return new Response(null, { status: 304, headers: { etag, 'cache-control': headerCache() } });
}

export function soloGet(req: Request): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new MethodNotAllowedError(req.method);
  }
}

/**
 * Contesto passato da Vercel come secondo argomento agli handler in stile Web.
 * Per le route dinamiche (es. api/v1/rebus/[id].ts) contiene i parametri del path.
 */
export type Contesto<P extends Record<string, string> = Record<string, string>> = {
  params: P;
};

/**
 * Wrapper unico degli handler. Traduce le eccezioni in risposte HTTP e
 * garantisce che un errore imprevisto non trapeli mai verso il client:
 * lo stack finisce nei log, l'utente riceve un 500 generico.
 *
 * Il risultato va esportato come metodo HTTP nominato (`export const GET = ...`),
 * non come default: con `export default` Vercel usa la firma Node `(req, res)`
 * e il Response restituito viene ignorato.
 */
export function handler<P extends Record<string, string> = Record<string, string>>(
  fn: (req: Request, ctx: Contesto<P>) => Promise<Response>,
) {
  return async (req: Request, ctx?: Contesto<P>): Promise<Response> => {
    try {
      return await fn(req, ctx ?? ({ params: {} as P }));
    } catch (e) {
      if (e instanceof AppError) {
        if (e.status >= 500) console.error(`[${e.codice}]`, e.message, e.dettaglio);
        return json({ errore: e.message, codice: e.codice }, { status: e.status, cache: false });
      }
      console.error('[NON_GESTITO]', e);
      return json({ errore: 'Errore interno', codice: 'ERRORE_INTERNO' }, { status: 500, cache: false });
    }
  };
}