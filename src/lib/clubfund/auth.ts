// UMass email verification with Supabase Auth email one-time codes. Codes are generated, sent and checked by Supabase;
// nothing here creates or stores codes.
import type { AuthError } from '@supabase/supabase-js';
import { isUmassEmail, normalizeEmail } from '../../../supabase/functions/_shared/policy';
import { supabase } from './client';
import { CODE_MAX_LENGTH, CODE_MIN_LENGTH, isCodeLengthValid, normalizeCode } from './otp';

export { isUmassEmail, normalizeEmail };
export { CODE_MAX_LENGTH, CODE_MIN_LENGTH, isCodeLengthValid, normalizeCode };

export const RESEND_SECONDS = 60;

export class AuthProblem extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Friendly, non-revealing messages for Supabase Auth errors. */
export function explainAuthError(e: Partial<AuthError> & { name?: string; status?: number; code?: string; message?: string }): AuthProblem {
  const code = e.code ?? '';
  const status = e.status ?? 0;
  if (e.name === 'AuthRetryableFetchError' || status === 0 || /fetch|network/i.test(e.message ?? ''))
    return new AuthProblem('network', "Can't reach the verification service. Check your connection and try again.");
  if (status === 429 || code.startsWith('over_'))
    return new AuthProblem('rate_limited', 'Too many codes requested. Wait a minute, then request a new code.');
  if (code === 'otp_expired' || (status === 403 && /expired|invalid/i.test(e.message ?? '')))
    return new AuthProblem('bad_code', 'That code is wrong or has expired. Check the newest email, or request a new code.');
  if (status === 403 || code.startsWith('hook_') || code === 'signup_disabled')
    return new AuthProblem('not_allowed', 'ClubFund accounts can only be created with an @umass.edu email address.');
  if (code === 'email_address_invalid' || code === 'validation_failed')
    return new AuthProblem('invalid_email', 'Enter a valid @umass.edu email address.');
  if (code === 'email_provider_disabled' || code === 'otp_disabled')
    return new AuthProblem('not_configured', 'Email sign-in is not turned on for ClubFund yet.');
  if (status >= 500)
    return new AuthProblem('send_failed', "We couldn't send or check the code right now (the email service may not be set up yet). Try again later.");
  return new AuthProblem('unknown', 'Something went wrong. Try again.');
}

/** Sends a one-time code to an exact @umass.edu address. The server-side hook enforces the same rule. */
export async function requestCode(rawEmail: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  if (!isUmassEmail(email)) throw new AuthProblem('invalid_email', 'Use your @umass.edu email address (for example jdoe@umass.edu).');
  let error: AuthError | null = null;
  try {
    ({ error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
  } catch (e) {
    throw explainAuthError(e as AuthError);
  }
  if (error) throw explainAuthError(error);
  return email;
}

export async function verifyCode(email: string, rawCode: string): Promise<void> {
  // A string of digits exactly as entered (leading zeros kept). Supabase alone decides if it is right or expired.
  const token = rawCode.replace(/\D/g, '');
  if (!isCodeLengthValid(token))
    throw new AuthProblem('bad_code', `Enter the verification code from the email (${CODE_MIN_LENGTH} to ${CODE_MAX_LENGTH} digits).`);
  let res;
  try {
    res = await supabase().auth.verifyOtp({ email, token, type: 'email' });
  } catch (e) {
    throw explainAuthError(e as AuthError);
  }
  if (res.error) throw explainAuthError(res.error);
  if (!res.data.session) throw new AuthProblem('bad_code', 'That code is wrong or has expired. Request a new code.');
}

export async function signOut(): Promise<void> {
  // Local sign-out always clears this browser's session, even if the network call fails.
  await supabase().auth.signOut({ scope: 'local' }).catch(() => undefined);
}
