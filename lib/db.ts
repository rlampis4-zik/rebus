import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { config } from './config.js';
import { DatabaseError } from './errors.js';

export type Riga = Record<string, unknown>;

/**
 * Wrapper attorno al driver HTTP di Neon.
 *
 * Il driver HTTP fa una richiesta HTTPS per query, quindi non c'è un pool di
 * connessioni da gestire: è esattamente ciò che serve in serverless, dove
 * ogni invocazione può essere un processo nuovo e i driver TCP finiscono per
 * saturare il limite di connessioni del DB.
 *
 * Conseguenza da tenere a mente: **niente transazioni multi-statement**.
 * Per quelle serve il driver Pool via WebSocket. Il backend è di sola
 * lettura, quindi non ci servono; lo script admin, se ne avrà bisogno, userà
 * la connessione diretta.
 */
export class Database {
  private static istanza: Database | null = null;
  private readonly sql: NeonQueryFunction<false, false>;

  private constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  /**
   * Riusa la stessa istanza fra invocazioni che condividono il container
   * caldo, evitando di ricostruire il client a ogni richiesta.
   */
  static get(): Database {
    if (!Database.istanza) Database.istanza = new Database(config.databaseUrl);
    return Database.istanza;
  }

  /** Solo per i test: inietta un'istanza su un DB diverso. */
  static override(db: Database | null): void {
    Database.istanza = db;
  }

  static conConnectionString(url: string): Database {
    return new Database(url);
  }

  /**
   * Espone il tagged template del driver. Le interpolazioni diventano
   * parametri preparati, quindi l'SQL injection non è possibile finché si usa
   * questa forma e non si concatenano stringhe a mano.
   */
  get query(): NeonQueryFunction<false, false> {
    return this.sql;
  }

  async esegui<T extends Riga = Riga>(fn: (sql: NeonQueryFunction<false, false>) => Promise<unknown>): Promise<T[]> {
    try {
      return (await fn(this.sql)) as T[];
    } catch (e) {
      console.error('[db] query fallita', e);
      throw new DatabaseError(e);
    }
  }

  /** Health check: sveglia il compute e verifica che le credenziali siano valide. */
  async ping(): Promise<boolean> {
    try {
      await this.sql`select 1`;
      return true;
    } catch {
      return false;
    }
  }
}
