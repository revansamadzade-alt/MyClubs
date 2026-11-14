// POST /functions/v1/wallet-unlink — see supabase/functions/_shared/handlers.ts. Deploy with JWT verification ON.
import { handle } from '../_shared/handlers.ts';
import { runtimeDeps } from '../_shared/runtime.ts';

Deno.serve((req) => handle('unlink', req, runtimeDeps()));
