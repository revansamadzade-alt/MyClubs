// Local-only résumé storage in IndexedDB (files never go into localStorage and are never uploaded anywhere).
// One PDF per application, keyed by clubId.

const DB_NAME = 'myclubs-files';
const STORE = 'resumes';

export interface StoredFile {
  name: string;
  size: number;
  type: string;
  blob: Blob;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

export const saveResume = (clubId: string, file: File) =>
  run('readwrite', (s) => s.put({ name: file.name, size: file.size, type: file.type || 'application/pdf', blob: file, savedAt: new Date().toISOString() } satisfies StoredFile, clubId));

export async function getResume(clubId: string): Promise<StoredFile | undefined> {
  const v = (await run('readonly', (s) => s.get(clubId))) as StoredFile | undefined;
  return v && v.blob instanceof Blob && typeof v.name === 'string' ? v : undefined;
}

export const deleteResume = (clubId: string) => run('readwrite', (s) => s.delete(clubId)).catch(() => undefined);

export const clearResumes = () => run('readwrite', (s) => s.clear()).catch(() => undefined);
