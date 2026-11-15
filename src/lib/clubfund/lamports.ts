// SOL amounts as integer lamports (1 SOL = 1,000,000,000 lamports). Typed amounts are parsed digit by digit, never
// through floating point, so 0.1 + 0.2 style rounding can never change what is sent or counted.
import { LAMPORTS_PER_SOL, MAX_CONTRIBUTION_LAMPORTS, MIN_CONTRIBUTION_LAMPORTS } from '../../../supabase/functions/_shared/solana';

/** "0.25", ".5", "2" → lamports. Null for anything else (signs, exponents, commas, more than 9 decimals). */
export function parseSol(input: string): number | null {
  const m = /^(\d{0,10})(?:\.(\d{0,9}))?$/.exec(input.trim());
  if (!m || (!m[1] && !m[2])) return null;
  const lamports = Number(m[1] || '0') * LAMPORTS_PER_SOL + Number((m[2] ?? '').padEnd(9, '0'));
  return Number.isSafeInteger(lamports) ? lamports : null;
}

/** Lamports → "1.25" (trailing zeros trimmed, at least `minDecimals` shown). */
export function formatSol(lamports: number, minDecimals = 0): string {
  const neg = lamports < 0;
  const abs = Math.abs(Math.trunc(lamports));
  const whole = Math.floor(abs / LAMPORTS_PER_SOL);
  let frac = String(abs % LAMPORTS_PER_SOL).padStart(9, '0').replace(/0+$/, '');
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, '0');
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
}

/** Whole-percent progress toward a goal, 0–100, from integer lamports. */
export function progressPercent(raised: number, goal: number): number {
  if (!(goal > 0) || !(raised > 0)) return 0;
  return Math.min(100, Math.floor((raised * 100) / goal));
}

export interface AmountContext {
  /** Spendable Devnet balance in lamports, when known. */
  balance: number | null;
  /** Estimated network fee in lamports. */
  fee: number;
  /** Minimum balance an account must keep (rent exemption), in lamports. */
  rentMinimum: number;
}

export type AmountCheck = { ok: true; lamports: number } | { ok: false; reason: 'empty' | 'invalid' | 'too_small' | 'too_large' | 'insufficient' | 'rent'; message: string };

export function checkAmount(input: string, ctx: AmountContext): AmountCheck {
  if (!input.trim()) return { ok: false, reason: 'empty', message: 'Enter an amount of Devnet SOL.' };
  const lamports = parseSol(input);
  if (lamports === null) return { ok: false, reason: 'invalid', message: 'Enter a number such as 0.05 (up to 9 decimal places).' };
  if (lamports < MIN_CONTRIBUTION_LAMPORTS)
    return { ok: false, reason: 'too_small', message: `The smallest contribution is ${formatSol(MIN_CONTRIBUTION_LAMPORTS)} Devnet SOL.` };
  if (lamports > MAX_CONTRIBUTION_LAMPORTS)
    return { ok: false, reason: 'too_large', message: `The largest contribution is ${formatSol(MAX_CONTRIBUTION_LAMPORTS)} Devnet SOL.` };
  if (ctx.balance !== null) {
    const needed = lamports + ctx.fee;
    if (needed > ctx.balance)
      return {
        ok: false,
        reason: 'insufficient',
        message: `Not enough Devnet SOL. Your wallet has ${formatSol(ctx.balance)} SOL; this needs ${formatSol(needed)} SOL including the network fee.`,
      };
    const left = ctx.balance - needed;
    if (left > 0 && left < ctx.rentMinimum)
      return {
        ok: false,
        reason: 'rent',
        message: `Solana requires a wallet to keep at least ${formatSol(ctx.rentMinimum)} SOL. Choose a smaller amount.`,
      };
  }
  return { ok: true, lamports };
}
