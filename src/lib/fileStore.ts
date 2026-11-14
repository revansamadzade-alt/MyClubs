// Local-only résumé storage in IndexedDB (files never go into localStorage and are never uploaded anywhere).
// One PDF per application, keyed by clubId, plus the student's optional default résumé.

const DB_NAME = 'myclubs-files';
const STORE = 'resumes';
/** Key of the default résumé the student explicitly saved in My applicant profile. */
export const DEFAULT_RESUME_KEY = '__default__';

export interface StoredFile {
  name: string;
  size: number;
  type: string;
  blob: Blob;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let idb: IDBFactory | undefined;
    try {
      idb = typeof indexedDB === 'undefined' ? undefined : indexedDB;
    } catch {
      idb = undefined;
    }
    if (!idb) return reject(new Error('IndexedDB is not available'));
    // A wedged or blocked database must not leave the page waiting forever.
    const timer = setTimeout(() => reject(new Error('IndexedDB did not respond')), 4000);
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(DB_NAME, 1);
    } catch (e) {
      clearTimeout(timer);
      return reject(e instanceof Error ? e : new Error('IndexedDB open failed'));
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB is blocked'));
    };
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
  });
}

/** Rejects when the browser can't store files (blocked, private mode, quota). */
export const saveResume = (key: string, file: Blob & { name?: string }) =>
  run('readwrite', (s) =>
    s.put(
      { name: file.name ?? 'resume.pdf', size: file.size, type: file.type || 'application/pdf', blob: file, savedAt: new Date().toISOString() } satisfies StoredFile,
      key,
    ),
  );

export async function getResume(key: string): Promise<StoredFile | undefined> {
  const v = (await run('readonly', (s) => s.get(key))) as StoredFile | undefined;
  return v && v.blob instanceof Blob && typeof v.name === 'string' ? v : undefined;
}

export const deleteResume = (key: string) => run('readwrite', (s) => s.delete(key)).catch(() => undefined);

export const clearResumes = () => run('readwrite', (s) => s.clear()).catch(() => undefined);
