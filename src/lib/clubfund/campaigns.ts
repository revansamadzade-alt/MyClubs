// ClubFund campaigns and verified contributions. Reads go straight to Supabase (Row Level Security allows public
// campaign data and each student's own ownership rows only); recording a contribution goes through the
// campaign-contribute Edge Function, which verifies the transaction on Solana Devnet itself.
import { ApiProblem, call } from './api';
import { supabase } from './client';

export type CampaignCategory = 'club' | 'event' | 'charity';

export interface Campaign {
  id: string;
  slug: string;
  category: CampaignCategory;
  title: string;
  summary: string;
  description: string;
  goal_lamports: number;
  recipient_address: string | null;
  recipient_confirmed_at: string | null;
  status: 'active' | 'paused' | 'closed';
  related_event_id: string | null;
  related_org_id: string | null;
  raised_lamports: number;
  contribution_count: number;
  created_at: string;
  updated_at: string;
}

export interface Contribution {
  id: string;
  campaign_id: string;
  lamports: number;
  signature: string;
  confirmation_status: 'confirmed' | 'finalized';
  block_time: string | null;
  verified_at: string;
}

export interface MyContribution extends Contribution {
  campaign: Pick<Campaign, 'slug' | 'title' | 'category'> | null;
}

export const CATEGORY_LABEL: Record<CampaignCategory, string> = {
  club: 'Support a Club',
  event: 'Fund an Event',
  charity: 'Charity Campaigns',
};

/** A campaign takes contributions only when active and its recipient was confirmed by the developer. */
export const acceptsContributions = (c: Campaign) => c.status === 'active' && !!c.recipient_address && !!c.recipient_confirmed_at;

const CAMPAIGN_COLUMNS =
  'id, slug, category, title, summary, description, goal_lamports, recipient_address, recipient_confirmed_at, status, related_event_id, related_org_id, raised_lamports, contribution_count, created_at, updated_at';
const CONTRIBUTION_COLUMNS = 'id, campaign_id, lamports, signature, confirmation_status, block_time, verified_at';

function problem(error: { code?: string; message: string }): ApiProblem {
  if (error.code === 'PGRST205' || error.code === '42P01')
    return new ApiProblem('not_set_up', "ClubFund's campaign database isn't set up yet, so campaigns can't be shown.");
  if (/fetch|network/i.test(error.message)) return new ApiProblem('network', "Can't reach ClubFund right now. Check your connection and try again.");
  return new ApiProblem('server_error', "Couldn't load campaigns. Try again.");
}

const CATEGORY_ORDER: CampaignCategory[] = ['club', 'event', 'charity'];

export async function listCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase().from('campaigns').select(CAMPAIGN_COLUMNS).order('created_at').order('slug');
  if (error) throw problem(error);
  return (data as Campaign[]).sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}

export async function getCampaign(slug: string): Promise<Campaign | null> {
  const { data, error } = await supabase().from('campaigns').select(CAMPAIGN_COLUMNS).eq('slug', slug).maybeSingle();
  if (error) throw problem(error);
  return data as Campaign | null;
}

/** Verified contributions to one campaign, newest first. No user ids, emails or wallet addresses. */
export async function listContributions(campaignId: string): Promise<Contribution[]> {
  const { data, error } = await supabase()
    .from('campaign_contributions')
    .select(CONTRIBUTION_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('verified_at', { ascending: false })
    .limit(100);
  if (error) throw problem(error);
  return data as Contribution[];
}

/** The signed-in student's own verified contributions, newest first. */
export async function listMyContributions(): Promise<MyContribution[]> {
  const { data, error } = await supabase()
    .from('contribution_owners')
    .select(`campaign_contributions(${CONTRIBUTION_COLUMNS}, campaigns(slug, title, category))`);
  if (error) throw problem(error);
  type Row = { campaign_contributions: (Contribution & { campaigns: MyContribution['campaign'] }) | null };
  return (data as unknown as Row[])
    .map((r) => r.campaign_contributions)
    .filter((c): c is Contribution & { campaigns: MyContribution['campaign'] } => !!c)
    .map(({ campaigns, ...c }) => ({ ...c, campaign: campaigns }))
    .sort((a, b) => b.verified_at.localeCompare(a.verified_at));
}

export interface RecordedContribution {
  created: boolean;
  contribution: Contribution;
  campaign: { raised_lamports: number; contribution_count: number };
}

/** Asks the server to verify this Devnet transaction and record it. The server re-checks everything on chain. */
export const submitContribution = (campaignId: string, signature: string, lamports: number) =>
  call<RecordedContribution>('campaign-contribute', { campaignId, signature, lamports });
