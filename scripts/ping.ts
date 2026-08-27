/**
 * Verifica che connessione e schema siano a posto.
 *   npx tsx scripts/ping.ts
 *
 * Il primo `select` può impiegare 1-2 secondi: è il cold start di Neon che
 * risveglia il compute dopo lo scale-to-zero. È normale e non va confuso con
 * un problema di rete.
 */
import { Database } from '../lib/db';
import { RebusRepository } from '../repositories/rebus.repository';

async function main() {
  const db = Database.get();

  const t0 = Date.now();
  if (!(await db.ping())) {
    console.error('❌ Connessione fallita. Controlla DATABASE_URL.');
    process.exit(1);
  }
  console.log(`✅ Connesso (${Date.now() - t0} ms, cold start incluso)`);

  const tabelle = await db.esegui<{ table_name: string }>(
    (sql) => sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `,
  );
  const attese = ['candidati_scartati', 'lessico', 'rebus'];
  const presenti = tabelle.map((t) => t.table_name);
  const mancanti = attese.filter((t) => !presenti.includes(t));

  if (mancanti.length) {
    console.error(`❌ Tabelle mancanti: ${mancanti.join(', ')} — esegui la migrazione 001_init.sql`);
    process.exit(1);
  }
  console.log(`✅ Schema presente: ${presenti.join(', ')}`);

  const repo = new RebusRepository(db);
  console.log(`📊 Pubblicati: ${await repo.contaPubblicati()} — revision max: ${await repo.revisionMassima()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
