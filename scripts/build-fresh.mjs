// Deploy build (Vercel runs `npm run build:fresh`): refresh the data snapshot from the public feeds, then build.
// A feed outage or an unexpected sync error never blocks the deploy: the committed snapshot is kept, and the app
// keeps showing each source's last successful update. The deployed site never fetches feeds at runtime.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SNAPSHOT = fileURLToPath(new URL('../src/data/generated/campus-data.json', import.meta.url));
const before = readFileSync(SNAPSHOT, 'utf8');

const isUsable = (text) => {
  try {
    const d = JSON.parse(text);
    return Array.isArray(d.clubs) && d.clubs.length >= 50 && Array.isArray(d.events) && Array.isArray(d.sources);
  } catch {
    return false;
  }
};

// MYCLUBS_SYNC_SCRIPT lets a test substitute a failing sync to prove the fallback.
const syncScript = process.env.MYCLUBS_SYNC_SCRIPT ?? fileURLToPath(new URL('./sync-data.mjs', import.meta.url));
const sync = spawnSync(process.execPath, [syncScript], { stdio: 'inherit' });
const after = readFileSync(SNAPSHOT, 'utf8');
if (sync.status !== 0 || !isUsable(after)) {
  writeFileSync(SNAPSHOT, before);
  console.warn(`Data sync ${sync.status !== 0 ? `failed (exit ${sync.status})` : 'produced an unusable snapshot'}; building with the committed snapshot.`);
}

const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
process.exit(build.status ?? 1);
