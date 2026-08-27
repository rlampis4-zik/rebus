import { createHash, createCipheriv, randomBytes } from 'node:crypto';

/**
 * Queste funzioni devono essere IDENTICHE tra lo script di generazione e il
 * backend, altrimenti la dedup smette di funzionare in silenzio: due rebus
 * uguali produrrebbero hash diversi e finirebbero entrambi in tabella.
 * Se le modifichi, devi rigenerare tutti gli hash esistenti.
 */

const DIACRITICI = /[\u0300-\u036f]/g;

/** "L'amico sincero" -> "LAMICOSINCERO" */
export function normalizzaGrafemi(s: string): string {
  return s
    .normalize('NFD')
    .replace(DIACRITICI, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/**
 * Normalizzazione della soluzione per la dedup secondaria.
 * Volutamente aggressiva: togliamo accenti e punteggiatura perché
 * "perché no" e "perche no!" sono lo stesso rebus.
 */
export function normalizzaSoluzione(s: string): string {
  return s
    .normalize('NFD')
    .replace(DIACRITICI, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export const hashGrafemi = (s: string) => sha256(normalizzaGrafemi(s));
export const hashSoluzione = (s: string) => sha256(normalizzaSoluzione(s));

/**
 * Hash con cui l'APK verifica offline la risposta digitata dall'utente.
 * Il sale per-rebus impedisce di costruire una rainbow table sull'intero
 * dataset: senza, chi estrae il DB locale confronterebbe gli hash con un
 * dizionario di frasi italiane e sbloccherebbe tutto in pochi minuti.
 */
export function hashVerifica(soluzione: string, rebusId: string): string {
  return sha256(`${rebusId}:${normalizzaSoluzione(soluzione)}`);
}

/** Lunghezze delle parole, per mostrare i trattini senza svelare le lettere. */
export function lunghezzeSoluzione(soluzione: string): number[] {
  return normalizzaSoluzione(soluzione).split(' ').filter(Boolean).map((p) => p.length);
}

/**
 * Cifratura del testo della soluzione per la funzione "rivela".
 *
 * ATTENZIONE: la chiave viaggia dentro l'APK, quindi questo è offuscamento,
 * non sicurezza. Alza l'asticella da "adb pull + sqlite3" a "reverse
 * engineering dell'APK", che per un gioco è sufficiente. Se ti servisse una
 * garanzia reale, l'unica strada è tenere la soluzione server-side dietro un
 * endpoint autenticato — al prezzo di perdere l'uso offline.
 */
export function cifraSoluzione(soluzione: string, chiaveHex: string): string {
  const chiave = Buffer.from(chiaveHex, 'hex');
  if (chiave.length !== 32) throw new Error('REBUS_ENC_KEY deve essere 32 byte in hex (64 caratteri)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chiave, iv);
  const testo = Buffer.concat([cipher.update(soluzione, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, testo].map((b) => b.toString('base64')).join('.');
}
