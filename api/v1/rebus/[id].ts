import { handler, json, notModified, soloGet } from '../../../lib/http';
import { RebusService } from '../../../services/rebus.service';

export const config = { runtime: 'edge' };

const service = new RebusService();

/** GET /v1/rebus/:id — dettaglio di un rebus pubblicato. */
export default handler(async (req) => {
  soloGet(req);

  const id = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const { dto, etag } = await service.dettaglio(id);

  // Rivalidazione: il client che ha già la versione corrente riceve un 304
  // vuoto invece dell'intero payload.
  if (req.headers.get('if-none-match') === etag) return notModified(etag);

  return json(dto, { etag });
});
