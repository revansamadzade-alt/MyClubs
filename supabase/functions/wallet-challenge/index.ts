// POST /functions/v1/wallet-challenge — see supabase/functions/_shared/handlers.ts. Deploy with JWT verification ON.
import { handle } from '../_shared/handlers.ts';
import { runtimeDeps } from '../_shared/runtime.ts';

Deno.serve((req) => handle('challenge', req, runtimeDeps()));
