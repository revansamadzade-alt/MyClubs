import data from './generated/campus-data.json';

export interface DataSource {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  count: number;
  /** Last successful update of this source (ISO), or null if it never succeeded. */
  updatedAt: string | null;
  error?: string;
}

/** Status of each public source as of the last `npm run sync:data`. This is a snapshot; nothing is fetched at runtime. */
export const DATA_SOURCES: DataSource[] = data.sources as DataSource[];
