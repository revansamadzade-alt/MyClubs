// Builds the one kind of transaction ClubFund ever asks a wallet to sign: a single System Program transfer of a fixed
// number of lamports from the student's wallet to a campaign recipient, plus a memo naming the campaign. It is a legacy
// Solana transaction encoded by hand (about 200 bytes), so no large Solana SDK is shipped to the browser.
//
// Layout: [signature count][signatures][message]
// message: [header: 1 signer, 0 read-only signers, 2 read-only accounts][account keys][recent blockhash][instructions]
import { base58 } from '@scure/base';
import { MEMO_PROGRAM_ID, SYSTEM_PROGRAM_ID } from '../../../supabase/functions/_shared/solana';

const SYSTEM_TRANSFER = 2; // SystemInstruction::Transfer

function compactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    const byte = v & 0x7f;
    v >>= 7;
    if (!v) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
}

function readCompactU16(bytes: Uint8Array, at: number): { value: number; next: number } {
  let value = 0;
  for (let i = 0; i < 3; i++) {
    const b = bytes[at + i];
    if (b === undefined) throw new Error('truncated');
    value |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return { value, next: at + i + 1 };
  }
  throw new Error('bad length');
}

function key(address: string): Uint8Array {
  const k = base58.decode(address);
  if (k.length !== 32) throw new Error('Not a Solana address');
  return k;
}

export interface TransferInput {
  from: string;
  to: string;
  /** Integer lamports. */
  lamports: number;
  memo: string;
  /** A recent Devnet blockhash. Mainnet does not know Devnet blockhashes, so the transaction can only land on Devnet. */
  recentBlockhash: string;
}

/** The message bytes the wallet signs. */
export function buildTransferMessage(t: TransferInput): Uint8Array {
  if (!Number.isSafeInteger(t.lamports) || t.lamports <= 0) throw new Error('Amount must be a positive whole number of lamports');
  if (t.from === t.to) throw new Error('Sender and recipient must differ');
  const blockhash = base58.decode(t.recentBlockhash);
  if (blockhash.length !== 32) throw new Error('Bad blockhash');
  const memo = new TextEncoder().encode(t.memo);

  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, SYSTEM_TRANSFER, true);
  view.setBigUint64(4, BigInt(t.lamports), true);

  const bytes: number[] = [
    1, 0, 2, // header
    ...compactU16(4), ...key(t.from), ...key(t.to), ...key(SYSTEM_PROGRAM_ID), ...key(MEMO_PROGRAM_ID),
    ...blockhash,
    ...compactU16(2),
    // transfer: program 2 (System), accounts [0 from, 1 to]
    2, ...compactU16(2), 0, 1, ...compactU16(data.length), ...data,
    // memo: program 3 (Memo), no accounts
    3, ...compactU16(0), ...compactU16(memo.length), ...memo,
  ];
  return Uint8Array.from(bytes);
}

/** A transaction with one empty signature slot, ready for the wallet to sign. */
export function unsignedTransaction(message: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 64 + message.length);
  out[0] = 1;
  out.set(message, 65);
  return out;
}

/** The fee payer's signature (the transaction id) and the message of a signed transaction. */
export function readSignedTransaction(tx: Uint8Array): { signature: string; message: Uint8Array } {
  const { value: count, next } = readCompactU16(tx, 0);
  if (count < 1 || tx.length < next + 64 * count + 3) throw new Error('Not a signed transaction');
  const sig = tx.slice(next, next + 64);
  if (sig.every((b) => b === 0)) throw new Error('The wallet did not sign the transaction');
  return { signature: base58.encode(sig), message: tx.slice(next + 64 * count) };
}
