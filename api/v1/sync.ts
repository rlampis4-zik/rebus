import { handler, json, soloGet } from '../../lib/http.ts';
import { RebusService } from '../../services/rebus.service.ts';

const service = new RebusService();

/**
 * GET /v1/sync?since=<revision>&limit=200
 *
 * L'APK conserva l'ultima revision ricevuta e riparte da lì; alla prima
 * installazione passa since=0 (o omette il parametro) e pagina finché
 * `altriDisponibili` è true.
 */
export default handler(async (req) => {
  soloGet(req);
  const p = new URL(req.url).searchParams;
  return json(await service.sync(p.get('since'), p.get('limit')));
});
