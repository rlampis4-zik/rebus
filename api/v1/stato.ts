import { handler, json, soloGet } from '../../lib/http';
import { RebusService } from '../../services/rebus.service';

const service = new RebusService();

/**
 * GET /v1/stato
 *
 * Payload minimo che l'APK può interrogare all'avvio: se la revision
 * coincide con quella locale, salta del tutto la sync.
 *
 * Cache breve (60s) invece di un'ora: è l'unico endpoint dove la freschezza
 * conta più del risparmio, perché è quello che decide se sincronizzare.
 */
export default handler(async (req) => {
  soloGet(req);
  const s = await service.stato();
  return new Response(JSON.stringify(s), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
});
