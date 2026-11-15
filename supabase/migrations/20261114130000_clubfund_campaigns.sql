-- ClubFund campaigns and verified Solana Devnet contributions. Requires 20261114120000_clubfund_wallet_links.sql.
-- Not applied automatically: review, then apply.
--
-- Demo only. Every campaign is a fictional Solana Devnet demonstration: Devnet SOL is a test token with no monetary
-- value, no real donations are collected, and no UMass organization or charity runs, endorses or receives them.
--
-- Security model
--   * Browsers can READ published campaigns and the public contribution history (amount, time, signature) and their
--     OWN contribution ownership rows. They cannot write anything: no insert/update/delete grants or policies.
--   * A contribution is recorded only by the campaign-contribute Edge Function (service role), after it fetched the
--     transaction from Solana Devnet itself and checked source wallet, recipient, amount, memo and confirmation.
--   * Totals are updated in the same database transaction as the insert, under a row lock on the campaign, so they
--     always equal the sum of verified contributions and cannot be edited from a browser.
--   * Transaction signatures are unique: one blockchain transaction is counted at most once.
--   * A campaign accepts contributions only after the developer has manually confirmed its recipient address
--     (recipient_confirmed_at). Changing the address clears the confirmation.
--   * Public queries never include user ids, emails or wallet addresses (the ownership table is private).

-- 1. Tables ---------------------------------------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 64),
  category text not null check (category in ('club', 'event', 'charity')),
  title text not null check (length(title) between 3 and 120),
  summary text not null check (length(summary) between 3 and 280),
  description text not null check (length(description) <= 4000),
  goal_lamports bigint not null check (goal_lamports > 0 and goal_lamports <= 1000000000000),
  -- A Devnet wallet controlled by the project developer, entered and confirmed by hand. Null until configured.
  recipient_address text check (recipient_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  recipient_confirmed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'closed')),
  -- Optional MyClubs entry points: a demo event in src/data/events.ts, or an organization that has agreed to a demo.
  related_event_id text check (related_event_id ~ '^[a-z0-9-]{1,80}$'),
  related_org_id text check (related_org_id ~ '^[a-z0-9-]{1,80}$'),
  raised_lamports bigint not null default 0 check (raised_lamports >= 0),
  contribution_count integer not null default 0 check (contribution_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipient_confirmed_at is null or recipient_address is not null)
);
comment on table public.campaigns is
  'Fictional ClubFund demo campaigns on Solana Devnet. Public metadata; totals are maintained only by clubfund_record_contribution.';
-- One recipient per campaign, so every transfer has an unambiguous campaign (the memo is checked as well).
create unique index campaigns_recipient_key on public.campaigns (recipient_address) where recipient_address is not null;

create table public.campaign_contributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  lamports bigint not null check (lamports > 0),
  signature text not null unique check (signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
  cluster text not null default 'devnet' check (cluster = 'devnet'),
  confirmation_status text not null check (confirmation_status in ('confirmed', 'finalized')),
  slot bigint not null check (slot > 0),
  block_time timestamptz,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.campaign_contributions is
  'Verified Solana Devnet contributions. Public history without personal data; written only by the campaign-contribute Edge Function.';
create index campaign_contributions_campaign_idx on public.campaign_contributions (campaign_id, verified_at desc);

create table public.contribution_owners (
  contribution_id uuid primary key references public.campaign_contributions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
);
comment on table public.contribution_owners is
  'Which MyClubs account made each contribution. Private: readable only by that account.';
create index contribution_owners_user_idx on public.contribution_owners (user_id);

-- 2. Timestamps and recipient confirmation ----------------------------------------------------------------------------

create or replace function public.clubfund_campaigns_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- A new recipient address must be confirmed again before the campaign accepts contributions.
  if new.recipient_address is distinct from old.recipient_address
     and new.recipient_confirmed_at is not distinct from old.recipient_confirmed_at then
    new.recipient_confirmed_at := null;
  end if;
  return new;
end;
$$;

create trigger campaigns_before_update
  before update on public.campaigns
  for each row execute function public.clubfund_campaigns_before_update();

-- 3. Row Level Security -----------------------------------------------------------------------------------------------

alter table public.campaigns enable row level security;
alter table public.campaign_contributions enable row level security;
alter table public.contribution_owners enable row level security;

revoke all on table public.campaigns from anon, authenticated;
revoke all on table public.campaign_contributions from anon, authenticated;
revoke all on table public.contribution_owners from anon, authenticated;
grant select on table public.campaigns to anon, authenticated;
grant select on table public.campaign_contributions to anon, authenticated;
grant select on table public.contribution_owners to authenticated;

create policy "Published campaigns are public"
  on public.campaigns
  for select
  to anon, authenticated
  using (status <> 'draft');

create policy "Contributions to published campaigns are public"
  on public.campaign_contributions
  for select
  to anon, authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.status <> 'draft'));

create policy "Owners read their own contributions"
  on public.contribution_owners
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_umass_email((select auth.jwt() ->> 'email'))
  );
-- No insert/update/delete policies anywhere: browsers cannot create contributions or change totals.

-- 4. Recording a verified contribution (service role only) -------------------------------------------------------------

create or replace function public.clubfund_record_contribution(
  p_campaign uuid,
  p_user uuid,
  p_wallet text,
  p_recipient text,
  p_lamports bigint,
  p_signature text,
  p_slot bigint,
  p_block_time timestamptz,
  p_confirmation text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c public.campaigns;
  prior record;
  saved public.campaign_contributions;
begin
  -- The row lock serializes contributions to one campaign, so the total is always the sum of its contributions.
  select * into c from public.campaigns where id = p_campaign for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  if c.status <> 'active' or c.recipient_confirmed_at is null then
    raise exception 'campaign_unavailable' using errcode = 'P0001';
  end if;
  if c.recipient_address is distinct from p_recipient then
    raise exception 'wrong_recipient' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.wallet_links l where l.user_id = p_user and l.wallet_address = p_wallet) then
    raise exception 'not_linked' using errcode = 'P0001';
  end if;

  select cc.*, o.user_id as owner into prior
    from public.campaign_contributions cc
    left join public.contribution_owners o on o.contribution_id = cc.id
   where cc.signature = p_signature;
  if found then
    -- Idempotent: the same student re-checking the same contribution gets it back, counted once.
    if prior.owner = p_user and prior.campaign_id = p_campaign then
      return jsonb_build_object(
        'created', false,
        'contribution', jsonb_build_object(
          'id', prior.id, 'campaign_id', prior.campaign_id, 'lamports', prior.lamports, 'signature', prior.signature,
          'confirmation_status', prior.confirmation_status, 'slot', prior.slot, 'block_time', prior.block_time,
          'verified_at', prior.verified_at),
        'raised_lamports', c.raised_lamports,
        'contribution_count', c.contribution_count);
    end if;
    raise exception 'duplicate_signature' using errcode = 'P0001';
  end if;

  insert into public.campaign_contributions (campaign_id, lamports, signature, confirmation_status, slot, block_time)
  values (p_campaign, p_lamports, p_signature, p_confirmation, p_slot, p_block_time)
  returning * into saved;
  insert into public.contribution_owners (contribution_id, user_id, wallet_address) values (saved.id, p_user, p_wallet);
  update public.campaigns
     set raised_lamports = raised_lamports + p_lamports,
         contribution_count = contribution_count + 1
   where id = p_campaign
  returning * into c;

  return jsonb_build_object(
    'created', true,
    'contribution', jsonb_build_object(
      'id', saved.id, 'campaign_id', saved.campaign_id, 'lamports', saved.lamports, 'signature', saved.signature,
      'confirmation_status', saved.confirmation_status, 'slot', saved.slot, 'block_time', saved.block_time,
      'verified_at', saved.verified_at),
    'raised_lamports', c.raised_lamports,
    'contribution_count', c.contribution_count);
exception
  when unique_violation then
    raise exception 'duplicate_signature' using errcode = 'P0001';
end;
$$;

revoke all on function public.clubfund_record_contribution(uuid, uuid, text, text, bigint, text, bigint, timestamptz, text) from public, anon, authenticated;
grant execute on function public.clubfund_record_contribution(uuid, uuid, text, text, bigint, text, bigint, timestamptz, text) to service_role;
revoke all on function public.clubfund_campaigns_before_update() from public, anon, authenticated;

-- 5. Demo campaigns -----------------------------------------------------------------------------------------------------
-- Fictional, clearly labeled, and not tied to any real UMass organization. They have no recipient yet, so their
-- contribution buttons stay disabled until the developer confirms a Devnet address they control:
--
--   update public.campaigns
--      set recipient_address = '<Devnet public address you control>', recipient_confirmed_at = now()
--    where slug = '<slug>';
--
-- The two event campaigns attach to sample events (src/data/events.ts), which are fictional too.

insert into public.campaigns (slug, category, title, summary, description, goal_lamports, status, related_event_id) values
  ('demo-club-competition-travel', 'club', 'Demo Club: Competition Travel',
   'Help a fictional student robotics team cover travel to a regional competition.',
   'A fictional student club used to show how ClubFund could support competition travel: bus fare, registration fees and shared lodging for a regional robotics contest. This campaign is a Solana Devnet demonstration. It is not run by, affiliated with or endorsed by any UMass organization.',
   5000000000, 'active', null),
  ('demo-club-equipment', 'club', 'Demo Club: Equipment & Supplies',
   'Help a fictional student club replace worn-out equipment and stock up on supplies.',
   'A fictional student club used to show how ClubFund could fund equipment, club supplies and everyday organization activities. This campaign is a Solana Devnet demonstration. It is not run by, affiliated with or endorsed by any UMass organization.',
   3000000000, 'active', null),
  ('demo-event-hackathon-workshop', 'event', 'Demo Event: Intro to Hackathons Workshop',
   'Cover snacks and supplies for the sample Intro to Hackathons Workshop.',
   'Shows how students could back a specific campus event, here the sample Intro to Hackathons Workshop listed in Campus Events (sample data). This campaign is a Solana Devnet demonstration; the event and its host are fictional.',
   2000000000, 'active', 'ev-hack-workshop'),
  ('demo-event-open-mic', 'event', 'Demo Event: Open Mic Night',
   'Help rent sound equipment for the sample Open Mic Night community gathering.',
   'Shows how students could back a community gathering, here the sample Open Mic Night listed in Campus Events (sample data). This campaign is a Solana Devnet demonstration; the event and its host are fictional.',
   2000000000, 'active', 'ev-open-mic'),
  ('demo-charity-food-drive', 'charity', 'Demo Charity: Food Drive Simulation',
   'A simulated food drive showing how a charity campaign could work. No food or money is collected.',
   'A simulation of a campus food drive, used to demonstrate charity campaigns on ClubFund. It is not a real charitable fundraiser: contributions are Solana Devnet test tokens with no monetary value, nothing is donated to anyone, and nothing is tax-deductible. It is not run by or affiliated with any charity or UMass organization.',
   4000000000, 'active', null),
  ('demo-charity-volunteer-day', 'charity', 'Demo Charity: Volunteer Day Simulation',
   'A simulated volunteer initiative showing how community assistance campaigns could work.',
   'A simulation of a community volunteer day, used to demonstrate charity campaigns on ClubFund. It is not a real charitable fundraiser: contributions are Solana Devnet test tokens with no monetary value, nothing is donated to anyone, and nothing is tax-deductible. It is not run by or affiliated with any charity or UMass organization.',
   3000000000, 'active', null)
on conflict (slug) do nothing;
