// Which demo campaigns are attached to a MyClubs organization or event, for the "Support This Club" and "Help Fund
// This Event" links. One small public REST read per page load, without loading the Supabase client, and silent on any
// failure: if ClubFund is unreachable, profiles and events simply show no fundraising link.
import { useEffect, useState } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export interface CampaignLink {
  slug: string;
  title: string;
  category: 'club' | 'event' | 'charity';
  related_event_id: string | null;
  related_org_id: string | null;
}

let cache: Promise<CampaignLink[]> | null = null;

function campaignLinks(): Promise<CampaignLink[]> {
  if (!url || !key || !/^https?:\/\/[^/]+/.test(url)) return Promise.resolve([]);
  cache ??= fetch(
    `${url.replace(/\/$/, '')}/rest/v1/campaigns?select=slug,title,category,related_event_id,related_org_id&status=eq.active&or=(related_event_id.not.is.null,related_org_id.not.is.null)`,
    { headers: { apikey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) },
  )
    .then((r) => (r.ok ? r.json() : []))
    .then((rows: unknown) => (Array.isArray(rows) ? (rows as CampaignLink[]) : []))
    .catch(() => []);
  return cache;
}

/** The active demo campaign attached to this organization or event, if any. */
export function useDemoCampaign(kind: 'org' | 'event', id: string | undefined): CampaignLink | null {
  const [found, setFound] = useState<CampaignLink | null>(null);
  useEffect(() => {
    let live = true;
    setFound(null);
    if (!id) return;
    void campaignLinks().then((rows) => {
      if (live) setFound(rows.find((c) => (kind === 'org' ? c.related_org_id : c.related_event_id) === id) ?? null);
    });
    return () => {
      live = false;
    };
  }, [kind, id]);
  return found;
}
