// Minimal ambient types for the two Deno APIs the Edge Functions use, so the project's TypeScript can type-check the
// Deno entry points too (Supabase runs them on Deno). Not deployed: only the function folders and _shared are.
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
