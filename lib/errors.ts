/**
 * Errori applicativi con status HTTP associato.
 *
 * Regola: `messaggio` è pubblico e finisce nella risposta, quindi non deve
 * mai contenere dettagli interni (query, nomi di colonne, stack). Il
 * contesto per il debug va in `dettaglio`, che resta nei log.
 */

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly codice: string,
    messaggio: string,
    readonly dettaglio?: unknown,
  ) {
    super(messaggio);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(messaggio: string, dettaglio?: unknown) {
    super(400, 'VALIDAZIONE', messaggio, dettaglio);
  }
}

export class NotFoundError extends AppError {
  constructor(risorsa = 'Risorsa') {
    super(404, 'NON_TROVATO', `${risorsa} non trovata`);
  }
}

export class MethodNotAllowedError extends AppError {
  constructor(metodo: string) {
    super(405, 'METODO_NON_CONSENTITO', `Metodo ${metodo} non consentito`);
  }
}

export class DatabaseError extends AppError {
  constructor(dettaglio: unknown) {
    // Messaggio volutamente generico: gli errori Postgres possono rivelare
    // struttura dello schema e persino frammenti di dati.
    super(500, 'ERRORE_INTERNO', 'Errore interno', dettaglio);
  }
}
