/**
 * Tipi di dominio. Il confine importante è fra `Rebus` (riga completa, uso
 * interno/admin: contiene la soluzione in chiaro) e `RebusPubblicoDTO`
 * (ciò che esce dall'API).
 *
 * Sono deliberatamente due tipi distinti e non uno con campi opzionali:
 * così il compilatore impedisce di restituire per sbaglio la soluzione.
 */

export type StatoRebus = 'draft' | 'approved' | 'published';

export type SegmentoVignetta =
  | { tipo: 'chiave'; val: string }
  | { tipo: 'lemma'; val: string };

export type OggettoScena = {
  lemma: string;
  chiavi?: Array<{ lettera: string; pos?: string }>;
  contiene?: Array<{ lettera: string }>;
};

export type Scena = {
  oggetti: OggettoScena[];
  relazioni?: Array<{ tipo: string; a: number; b: number }>;
};

/** Riga completa. Non deve mai essere serializzata verso il client. */
export interface Rebus {
  id: string;
  hashGrafemi: string;
  stringaGrafemi: string;
  hashSoluzione: string;
  soluzione: string;
  soluzioneHashVerifica: string | null;
  soluzioneCifrata: string | null;
  lunghezzeSoluzione: number[] | null;
  taglioVignetta: SegmentoVignetta[];
  scena: Scena;
  immagineUrl: string | null;
  difficolta: number | null;
  stato: StatoRebus;
  revision: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload di /v1/rebus/:id */
export interface RebusPubblicoDTO {
  id: string;
  revision: number;
  immagineUrl: string | null;
  difficolta: number | null;
  taglioVignetta: SegmentoVignetta[];
  scena: Scena;
  soluzioneHashVerifica: string | null;
  soluzioneCifrata: string | null;
  lunghezzeSoluzione: number[] | null;
  publishedAt: string | null;
}

/**
 * Elemento di /v1/sync. Niente `scena` (payload pesante, serve solo al
 * dettaglio) e in più `attivo`: false è una lapide per un rebus ritirato,
 * che dice all'APK di rimuoverlo dalla cache locale.
 */
export interface RebusSyncDTO {
  id: string;
  revision: number;
  immagineUrl: string | null;
  difficolta: number | null;
  taglioVignetta: SegmentoVignetta[];
  soluzioneHashVerifica: string | null;
  soluzioneCifrata: string | null;
  lunghezzeSoluzione: number[] | null;
  publishedAt: string | null;
  attivo: boolean;
}

export interface RisultatoSync {
  rebus: RebusSyncDTO[];
  cursore: number;
  altriDisponibili: boolean;
}

/** Candidato prodotto dal generatore, prima dell'inserimento. */
export interface NuovoRebus {
  soluzione: string;
  taglioVignetta: SegmentoVignetta[];
  scena: Scena;
  difficolta?: number;
}

export type MotivoScarto =
  | 'nessuna_segmentazione'
  | 'lemma_non_disegnabile'
  | 'scena_incoerente'
  | 'duplicato'
  | 'scartato_manualmente';
