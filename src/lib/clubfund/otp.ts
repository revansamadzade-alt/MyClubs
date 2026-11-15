// Email one-time codes. Supabase projects can be set to send codes of 6 to 10 digits (this project sends 8), so the
// app accepts any length in that range. Codes stay strings end to end, so leading zeros are never lost, and only
// Supabase decides whether a code is correct or expired.

export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 10;

/** The digits from typed or pasted text ("0123 4567" → "01234567"), as a string. Never shortens a valid code. */
export const normalizeCode = (raw: string): string => raw.replace(/\D/g, '').slice(0, CODE_MAX_LENGTH);

/** True when the code has a plausible length to send to Supabase for checking. */
export const isCodeLengthValid = (code: string): boolean =>
  /^\d+$/.test(code) && code.length >= CODE_MIN_LENGTH && code.length <= CODE_MAX_LENGTH;
