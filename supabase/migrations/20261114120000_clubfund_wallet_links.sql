-- ClubFund: accounts verified by a @umass.edu email OTP, each linked to one Solana wallet whose ownership was proved
-- by an Ed25519 signature over a single-use, short-lived challenge. Not applied automatically: review, then apply.
--
-- Security model
--   * Only @umass.edu addresses can create accounts (Before User Created hook) and every privileged operation re-checks
--     the email from the verified session (Edge Functions + the RLS policy below).
--   * Browsers can only READ their own wallet link. Every write goes through the Edge Functions, which use the service
--     role server-side and call the functions below with the user id taken from the verified JWT, never from the request.
--   * Challenges are single-use: consumption is one UPDATE ... WHERE consumed_at IS NULL, so concurrent attempts on the
--     same challenge cannot both succeed, and a used or expired challenge can never be replayed.

-- 1. Email policy ---------------------------------------------------------------------------------------------------

-- Exact @umass.edu (no subdomains, no look-alikes such as umass.edu.attacker.com), dot-atom local part, case-insensitive.
create or replace function public.is_umass_email(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    length(btrim(email, E' \t\r\n')) <= 254
    and lower(btrim(email, E' \t\r\n')) ~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@umass\.edu$',
    false
  )
$$;

-- Before User Created auth hook: refuses to create any account whose email is not an exact @umass.edu address.
-- Enable it in Dashboard → Authentication → Hooks → "Before User Created" → Postgres → this function.
create or replace function public.hook_before_user_created_umass_only(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.is_umass_email(event -> 'user' ->> 'email') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Use your @umass.edu email address to create a ClubFund account.')
  );
end;
$$;

-- 2. Tables ---------------------------------------------------------------------------------------------------------

create table public.wallet_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  wallet_address text not null unique
    check (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  chain text not null default 'solana:devnet' check (chain in ('solana:devnet')),
  verification_method text not null default 'solana:signMessage',
  linked_at timestamptz not null default now(),
  verified_at timestamptz not null
);
comment on table public.wallet_links is
  'One verified Solana wallet per ClubFund account. Private: readable only by its owner; written only by Edge Functions.';

create table public.wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  purpose text not null check (purpose in ('link', 'unlink')),
  nonce text not null unique check (length(nonce) >= 32),
  message text not null check (length(message) <= 2000),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > issued_at and expires_at <= issued_at + interval '10 minutes')
);
comment on table public.wallet_challenges is
  'Single-use wallet signing challenges. Not readable or writable by browsers; used only by Edge Functions.';
create index wallet_challenges_user_issued_idx on public.wallet_challenges (user_id, issued_at desc);

-- 3. Row Level Security -----------------------------------------------------------------------------------------------

alter table public.wallet_links enable row level security;
alter table public.wallet_challenges enable row level security;

-- Supabase grants table privileges to anon/authenticated by default; take them away, then grant only what is needed.
revoke all on table public.wallet_links from anon, authenticated;
revoke all on table public.wallet_challenges from anon, authenticated;
grant select on table public.wallet_links to authenticated;

create policy "Owners read their own wallet link"
  on public.wallet_links
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_umass_email((select auth.jwt() ->> 'email'))
  );
-- No insert/update/delete policies on wallet_links and no policies at all on wallet_challenges: browsers cannot create,
-- change or "verify" a link, and cannot see challenges. The service role (Edge Functions only) bypasses RLS.

-- 4. Server-side operations (service role only) ------------------------------------------------------------------------

-- Issues a challenge after enforcing a per-user rate limit, and clears that user's stale challenges.
create or replace function public.clubfund_issue_challenge(
  p_user uuid,
  p_wallet text,
  p_purpose text,
  p_nonce text,
  p_message text,
  p_ttl_seconds integer default 300
)
returns table (id uuid, issued_at timestamptz, expires_at timestamptz)
language plpgsql
set search_path = ''
as $$
begin
  if p_ttl_seconds < 60 or p_ttl_seconds > 600 then
    raise exception 'invalid_ttl' using errcode = 'P0001';
  end if;
  delete from public.wallet_challenges c
   where c.user_id = p_user and (c.expires_at < now() - interval '1 day' or c.consumed_at < now() - interval '1 day');
  if (select count(*) from public.wallet_challenges c
       where c.user_id = p_user and c.issued_at > now() - interval '10 minutes') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return query
    insert into public.wallet_challenges as c (user_id, wallet_address, purpose, nonce, message, expires_at)
    values (p_user, p_wallet, p_purpose, p_nonce, p_message, now() + make_interval(secs => p_ttl_seconds))
    returning c.id, c.issued_at, c.expires_at;
end;
$$;

-- Consumes a verified link challenge and stores the link, in one transaction. The Edge Function calls this only after
-- the Ed25519 signature over the exact challenge bytes has been verified.
create or replace function public.clubfund_link_wallet(p_challenge uuid, p_user uuid, p_wallet text, p_message text)
returns public.wallet_links
language plpgsql
set search_path = ''
as $$
declare
  ch public.wallet_challenges;
  link public.wallet_links;
begin
  update public.wallet_challenges c
     set consumed_at = now()
   where c.id = p_challenge
     and c.user_id = p_user
     and c.wallet_address = p_wallet
     and c.purpose = 'link'
     and c.message = p_message
     and c.consumed_at is null
     and c.expires_at > now()
  returning * into ch;
  if not found then
    raise exception 'challenge_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.wallet_links l where l.user_id = p_user) then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.wallet_links l where l.wallet_address = p_wallet) then
    raise exception 'wallet_in_use' using errcode = 'P0001';
  end if;
  insert into public.wallet_links (user_id, wallet_address, verified_at)
  values (p_user, p_wallet, now())
  returning * into link;
  return link;
exception
  when unique_violation then
    raise exception 'wallet_in_use' using errcode = 'P0001';
end;
$$;

-- Removes the caller's link. With a challenge: the linked wallet signed an unlink challenge (consumed here).
-- Without one: the Edge Function has already required a fresh email-code sign-in (lost-wallet path).
create or replace function public.clubfund_unlink_wallet(
  p_user uuid,
  p_challenge uuid default null,
  p_wallet text default null,
  p_message text default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_challenge is not null then
    update public.wallet_challenges c
       set consumed_at = now()
     where c.id = p_challenge
       and c.user_id = p_user
       and c.wallet_address = p_wallet
       and c.purpose = 'unlink'
       and c.message = p_message
       and c.consumed_at is null
       and c.expires_at > now()
       and exists (select 1 from public.wallet_links l where l.user_id = p_user and l.wallet_address = p_wallet);
    if not found then
      raise exception 'challenge_invalid' using errcode = 'P0001';
    end if;
  end if;
  delete from public.wallet_links l where l.user_id = p_user;
  return found;
end;
$$;

-- 5. Function privileges ----------------------------------------------------------------------------------------------

grant usage on schema public to supabase_auth_admin;
revoke all on function public.hook_before_user_created_umass_only(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created_umass_only(jsonb) to supabase_auth_admin;
grant execute on function public.is_umass_email(text) to supabase_auth_admin, authenticated, service_role;

revoke all on function public.clubfund_issue_challenge(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.clubfund_link_wallet(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.clubfund_unlink_wallet(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.clubfund_issue_challenge(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.clubfund_link_wallet(uuid, uuid, text, text) to service_role;
grant execute on function public.clubfund_unlink_wallet(uuid, uuid, text, text) to service_role;
