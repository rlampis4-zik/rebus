import { Database, type Riga } from '../lib/db.js';
import type {
  MotivoScarto,
  NuovoRebus,
  Rebus,
  RebusSyncDTO,
  Scena,
  SegmentoVignetta,
  StatoRebus,
} from '../types/rebus.js';
import { hashGrafemi, hashSoluzione, normalizzaGrafemi } from '../lib/hash.js';

/**
 * Unico punto del backend che conosce i nomi delle colonne.
 * Tutto ciò che sta sopra (service, handler) lavora su tipi di dominio.
 */
export class RebusRepository {
  constructor(private readonly db: Database = Database.get()) {}

  // ----------------------------------------------------------------
  // Mapping
  // ----------------------------------------------------------------

  /**
   * `revision` è un bigint e il driver lo restituisce come stringa per non
   * perdere precisione. Convertirlo esplicitamente evita che il confronto
   * del cursore diventi una comparazione lessicografica: "9" > "10" sarebbe
   * vero, e la sync si bloccherebbe.
   */
  private static numero(v: unknown): number {
    return typeof v === 'number' ? v : Number(v);
  }

  private static data(v: unknown): Date | null {
    if (!v) return null;
    return v instanceof Date ? v : new Date(String(v));
  }

  private static iso(v: unknown): string | null {
    const d = RebusRepository.data(v);
    return d ? d.toISOString() : null;
  }

  private static toSync(r: Riga): RebusSyncDTO {
    return {
      id: String(r.id),
      revision: RebusRepository.numero(r.revision),
      immagineUrl: (r.immagine_url as string) ?? null,
      difficolta: r.difficolta == null ? null : RebusRepository.numero(r.difficolta),
      taglioVignetta: (r.taglio_vignetta as SegmentoVignetta[]) ?? [],
      soluzioneHashVerifica: (r.soluzione_hash_verifica as string) ?? null,
      soluzioneCifrata: (r.soluzione_cifrata as string) ?? null,
      lunghezzeSoluzione: (r.lunghezze_soluzione as number[]) ?? null,
      publishedAt: RebusRepository.iso(r.published_at),
      attivo: Boolean(r.attivo),
    };
  }

  private static toRebus(r: Riga): Rebus {
    return {
      id: String(r.id),
      hashGrafemi: String(r.hash_grafemi),
      stringaGrafemi: String(r.stringa_grafemi),
      hashSoluzione: String(r.hash_soluzione),
      soluzione: String(r.soluzione),
      soluzioneHashVerifica: (r.soluzione_hash_verifica as string) ?? null,
      soluzioneCifrata: (r.soluzione_cifrata as string) ?? null,
      lunghezzeSoluzione: (r.lunghezze_soluzione as number[]) ?? null,
      taglioVignetta: (r.taglio_vignetta as SegmentoVignetta[]) ?? [],
      scena: (r.scena as Scena) ?? { oggetti: [] },
      immagineUrl: (r.immagine_url as string) ?? null,
      difficolta: r.difficolta == null ? null : RebusRepository.numero(r.difficolta),
      stato: r.stato as StatoRebus,
      revision: RebusRepository.numero(r.revision),
      publishedAt: RebusRepository.data(r.published_at),
      createdAt: RebusRepository.data(r.created_at)!,
      updatedAt: RebusRepository.data(r.updated_at)!,
    };
  }

  // ----------------------------------------------------------------
  // Lettura (usata dall'API)
  // ----------------------------------------------------------------

  /**
   * Include i rebus ritirati (published_at valorizzato ma stato != published)
   * con attivo=false. Senza queste lapidi, un rebus rimosso resterebbe per
   * sempre nella cache locale di chi lo aveva già scaricato.
   */
  async perSync(since: number, limit: number): Promise<RebusSyncDTO[]> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        select id, revision, immagine_url, difficolta, taglio_vignetta,
               soluzione_hash_verifica, soluzione_cifrata, lunghezze_soluzione,
               published_at, (stato = 'published') as attivo
        from rebus
        where revision > ${since}
          and (stato = 'published' or published_at is not null)
        order by revision asc
        limit ${limit}
      `,
    );
    return righe.map(RebusRepository.toSync);
  }

  /** La colonna `soluzione` è assente dalla select: non deve uscire dall'API. */
  async pubblicatoPerId(id: string): Promise<Riga | null> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        select id, revision, immagine_url, difficolta, taglio_vignetta, scena,
               soluzione_hash_verifica, soluzione_cifrata, lunghezze_soluzione,
               published_at
        from rebus
        where id = ${id}::uuid and stato = 'published'
        limit 1
      `,
    );
    return righe[0] ?? null;
  }

  async revisionMassima(): Promise<number> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        select coalesce(max(revision), 0) as max
        from rebus
        where stato = 'published' or published_at is not null
      `,
    );
    return RebusRepository.numero(righe[0]?.max ?? 0);
  }

  async contaPubblicati(): Promise<number> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`select count(*)::int as n from rebus where stato = 'published'`,
    );
    return RebusRepository.numero(righe[0]?.n ?? 0);
  }

  // ----------------------------------------------------------------
  // Scrittura (usata solo dallo script admin)
  // ----------------------------------------------------------------

  /** Filtro pre-LLM: evita di spendere token su candidati già noti. */
  async giaVisto(soluzione: string): Promise<boolean> {
    const hg = hashGrafemi(soluzione);
    const hs = hashSoluzione(soluzione);
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        select 1 as x from rebus where hash_grafemi = ${hg} or hash_soluzione = ${hs}
        union all
        select 1 as x from candidati_scartati where hash_grafemi = ${hg} or hash_soluzione = ${hs}
        limit 1
      `,
    );
    return righe.length > 0;
  }

  /**
   * Ritorna l'id solo se la riga è stata davvero inserita, null se era un
   * duplicato. È questo che permette allo script di ciclare finché non ha
   * raccolto N rebus NUOVI, invece di N tentativi metà dei quali scartati.
   */
  async inserisciDraft(c: NuovoRebus): Promise<string | null> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        insert into rebus
          (hash_grafemi, stringa_grafemi, hash_soluzione, soluzione,
           taglio_vignetta, scena, difficolta, stato)
        values (
          ${hashGrafemi(c.soluzione)},
          ${normalizzaGrafemi(c.soluzione)},
          ${hashSoluzione(c.soluzione)},
          ${c.soluzione},
          ${JSON.stringify(c.taglioVignetta)}::jsonb,
          ${JSON.stringify(c.scena)}::jsonb,
          ${c.difficolta ?? null},
          'draft'
        )
        on conflict do nothing
        returning id
      `,
    );
    return righe[0] ? String(righe[0].id) : null;
  }

  async registraScarto(soluzione: string, motivo: MotivoScarto, dettaglio?: unknown): Promise<void> {
    await this.db.esegui(
      (sql) => sql`
        insert into candidati_scartati (hash_grafemi, hash_soluzione, soluzione, motivo, dettaglio)
        values (
          ${hashGrafemi(soluzione)}, ${hashSoluzione(soluzione)}, ${soluzione},
          ${motivo}, ${dettaglio ? JSON.stringify(dettaglio) : null}::jsonb
        )
        on conflict (hash_grafemi) do nothing
      `,
    );
  }

  async allegaAsset(
    id: string,
    dati: { immagineUrl: string; soluzioneHashVerifica: string; soluzioneCifrata: string; lunghezze: number[] },
  ): Promise<void> {
    await this.db.esegui(
      (sql) => sql`
        update rebus set
          immagine_url = ${dati.immagineUrl},
          soluzione_hash_verifica = ${dati.soluzioneHashVerifica},
          soluzione_cifrata = ${dati.soluzioneCifrata},
          lunghezze_soluzione = ${dati.lunghezze}
        where id = ${id}::uuid
      `,
    );
  }

  /** Il CHECK in tabella impedisce di pubblicare un rebus senza immagine o hash. */
  async pubblica(id: string): Promise<boolean> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        update rebus
        set stato = 'published', published_at = coalesce(published_at, now())
        where id = ${id}::uuid and stato = 'approved'
        returning id
      `,
    );
    return righe.length > 0;
  }

  /** Ritiro: lo stato torna ad approved ma published_at resta, così la sync emette la lapide. */
  async ritira(id: string): Promise<boolean> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        update rebus set stato = 'approved'
        where id = ${id}::uuid and stato = 'published'
        returning id
      `,
    );
    return righe.length > 0;
  }

  async perStato(stato: StatoRebus, limit = 50): Promise<Rebus[]> {
    const righe = await this.db.esegui<Riga>(
      (sql) => sql`
        select * from rebus where stato = ${stato}
        order by created_at desc limit ${limit}
      `,
    );
    return righe.map(RebusRepository.toRebus);
  }
}
