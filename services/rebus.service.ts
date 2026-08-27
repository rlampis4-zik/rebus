import { RebusRepository } from '../repositories/rebus.repository.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { config } from '../lib/config.js';
import type { RebusPubblicoDTO, RisultatoSync, Scena, SegmentoVignetta } from '../types/rebus.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validazione e logica applicativa. Gli handler HTTP restano sottili:
 * leggono i parametri grezzi, chiamano qui, serializzano.
 */
export class RebusService {
  constructor(private readonly repo: RebusRepository = new RebusRepository()) {}

  /** Il cursore arriva dalla querystring, quindi va trattato come input ostile. */
  private static parseCursore(raw: string | null): number {
    if (raw === null || raw === '') return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      throw new ValidationError('Il parametro "since" deve essere un intero non negativo');
    }
    return n;
  }

  /**
   * Il limite è clampato, non rifiutato: un client che chiede 10.000 riceve
   * il massimo e continua a paginare, invece di rompersi con un 400.
   */
  private static parseLimite(raw: string | null): number {
    if (raw === null || raw === '') return config.sync.limiteDefault;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new ValidationError('Il parametro "limit" deve essere un intero positivo');
    }
    return Math.min(n, config.sync.limiteMax);
  }

  async sync(sinceRaw: string | null, limitRaw: string | null): Promise<RisultatoSync> {
    const since = RebusService.parseCursore(sinceRaw);
    const limit = RebusService.parseLimite(limitRaw);

    const rebus = await this.repo.perSync(since, limit);

    // Il cursore avanza solo se sono arrivate righe: altrimenti resta dov'era
    // e la prossima chiamata riparte dallo stesso punto.
    const cursore = rebus.length > 0 ? rebus[rebus.length - 1].revision : since;

    return {
      rebus,
      cursore,
      // Pagina piena = probabilmente ce n'è ancora. Può dare un falso positivo
      // quando il totale è un multiplo esatto del limite: costa una chiamata
      // vuota in più, che è meglio di troncare la sync.
      altriDisponibili: rebus.length === limit,
    };
  }

  async dettaglio(id: string): Promise<{ dto: RebusPubblicoDTO; etag: string }> {
    if (!UUID.test(id)) throw new ValidationError('ID non valido');

    const r = await this.repo.pubblicatoPerId(id);
    if (!r) throw new NotFoundError('Rebus');

    const revision = Number(r.revision);
    const publishedAt = r.published_at ? new Date(String(r.published_at)).toISOString() : null;

    const dto: RebusPubblicoDTO = {
      id: String(r.id),
      revision,
      immagineUrl: (r.immagine_url as string) ?? null,
      difficolta: r.difficolta == null ? null : Number(r.difficolta),
      taglioVignetta: (r.taglio_vignetta as SegmentoVignetta[]) ?? [],
      scena: (r.scena as Scena) ?? { oggetti: [] },
      soluzioneHashVerifica: (r.soluzione_hash_verifica as string) ?? null,
      soluzioneCifrata: (r.soluzione_cifrata as string) ?? null,
      lunghezzeSoluzione: (r.lunghezze_soluzione as number[]) ?? null,
      publishedAt,
    };

    // La revision cambia a ogni UPDATE (trigger in tabella), quindi basta da
    // sola come ETag: se il rebus non è cambiato, il client riceve un 304.
    return { dto, etag: `"r${revision}"` };
  }

  /** Usato dall'APK per decidere se vale la pena avviare una sync. */
  async stato(): Promise<{ revision: number; pubblicati: number }> {
    const [revision, pubblicati] = await Promise.all([
      this.repo.revisionMassima(),
      this.repo.contaPubblicati(),
    ]);
    return { revision, pubblicati };
  }
}
