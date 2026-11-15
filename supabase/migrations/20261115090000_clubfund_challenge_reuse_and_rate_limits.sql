-- ClubFund: reuse open wallet challenges, report when a rate limit lifts, and limit contribution checks per user.
-- Requires 20261114120000_clubfund_wallet_links.sql. Not applied automatically: review, then apply.
--
-- Why: every "Sign verification message" click minted a new challenge, so cancelled, failed or interrupted wallet
-- signatures used up the 5-per-10-minutes allowance and locked the student out ("Too many verification requests").
-- Now a request for the same account, wallet and purpose gets the still-open challenge back instead of a new one.
-- Challenges stay single-use, bound to one account/wallet/purpose, and expire after 5 minutes; the limit on NEW
-- challenges is unchanged.
--
-- Additive only: clubfund_issue_challenge is kept so already-deployed Edge Functions keep working until redeployed.

-- 1. Challenge reuse ------------------------------------------------------------------------------------------------

create or replace function public.clubfund_request_challenge(
  p_user uuid,
  p_wallet text,
  p_purpose text,
  p_nonce text,
  p_message text,
  p_ttl_seconds integer default 300
)
returns table (id uuid, message text, issued_at timestamptz, expires_at timestamptz, reused boolean)
language plpgsql
set search_path = ''
as $$
declare
  open_challenge public.wallet_challenges;
  recent integer;
  oldest timestamptz;
begin
  if p_ttl_seconds < 60 or p_ttl_seconds > 600 then
    raise exception 'invalid_ttl' using errcode = 'P0001';
  end if;
  -- One request per user at a time, so two tabs cannot both mint a challenge.
  perform pg_advisory_xact_lock(hashtextextended('clubfund-challenge:' || p_user::text, 0));

  delete from public.wallet_challenges c
   where c.user_id = p_user and (c.expires_at < now() - interval '1 day' or c.consumed_at < now() - interval '1 day');

  -- Still open for at least another minute: hand the same challenge back (not counted as a new request).
  select * into open_challenge
    from public.wallet_challenges c
   where c.user_id = p_user
     and c.wallet_address = p_wallet
     and c.purpose = p_purpose
     and c.consumed_at is null
     and c.expires_at > now() + interval '60 seconds'
     -- Same site: the domain (line 1) and URI (line 6) lines the wallet shows must match the requesting app.
     and split_part(c.message, E'\n', 1) = split_part(p_message, E'\n', 1)
     and split_part(c.message, E'\n', 6) = split_part(p_message, E'\n', 6)
   order by c.issued_at desc
   limit 1;
  if found then
    return query select open_challenge.id, open_challenge.message, open_challenge.issued_at, open_challenge.expires_at, true;
    return;
  end if;

  select count(*), min(r.issued_at) into recent, oldest
    from (select c.issued_at from public.wallet_challenges c
           where c.user_id = p_user and c.issued_at > now() - interval '10 minutes'
           order by c.issued_at desc limit 5) r;
  if recent >= 5 then
    -- detail = seconds until the oldest of those five leaves the 10-minute window.
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = greatest(1, ceil(extract(epoch from (oldest + interval '10 minutes' - now()))))::integer::text;
  end if;

  return query
    insert into public.wallet_challenges as c (user_id, wallet_address, purpose, nonce, message, expires_at)
    values (p_user, p_wallet, p_purpose, p_nonce, p_message, now() + make_interval(secs => p_ttl_seconds))
    returning c.id, c.message, c.issued_at, c.expires_at, false;
end;
$$;

revoke all on function public.clubfund_request_challenge(uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.clubfund_request_challenge(uuid, text, text, text, text, integer) to service_role;

-- 2. Persistent per-user rate limits (contribution checks) -----------------------------------------------------------

create table public.clubfund_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('contribute')),
  created_at timestamptz not null default now()
);
comment on table public.clubfund_rate_events is
  'Recent rate-limited ClubFund actions per account (only the current window is kept). Edge Functions only.';
create index clubfund_rate_events_user_idx on public.clubfund_rate_events (user_id, action, created_at desc);

alter table public.clubfund_rate_events enable row level security;
revoke all on table public.clubfund_rate_events from anon, authenticated;
-- No policies: browsers can neither see nor change rate-limit state.

-- Records one action, or raises rate_limited (detail = seconds until the next slot) when the window is full.
create or replace function public.clubfund_take_rate_token(p_user uuid, p_action text, p_limit integer, p_window_seconds integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  recent integer;
  oldest timestamptz;
begin
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('clubfund-rate:' || p_action || ':' || p_user::text, 0));
  delete from public.clubfund_rate_events e
   where e.user_id = p_user and e.action = p_action and e.created_at <= now() - make_interval(secs => p_window_seconds);
  select count(*), min(e.created_at) into recent, oldest
    from public.clubfund_rate_events e
   where e.user_id = p_user and e.action = p_action;
  if recent >= p_limit then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = greatest(1, ceil(extract(epoch from (oldest + make_interval(secs => p_window_seconds) - now()))))::integer::text;
  end if;
  insert into public.clubfund_rate_events (user_id, action) values (p_user, p_action);
end;
$$;

revoke all on function public.clubfund_take_rate_token(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.clubfund_take_rate_token(uuid, text, integer, integer) to service_role;
