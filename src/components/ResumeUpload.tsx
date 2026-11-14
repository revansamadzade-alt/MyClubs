import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { FileText, Upload } from 'lucide-react';
import type { ResumeMeta } from '../types';
import { checkPdf, fmtSize } from '../lib/applicationForms';
import { DEFAULT_RESUME_KEY, deleteResume, getResume, saveResume } from '../lib/fileStore';
import { cx } from '../lib/cx';
import { FieldTag } from './Applications';

const OBJECT_URL_LIFETIME = 60_000;

/**
 * PDF résumé picker with drag-and-drop. The file is validated, then kept only in this browser (IndexedDB).
 * It is never uploaded or sent to an organization. If the browser can't store files, the résumé is kept in memory
 * for this visit only and the student is told so.
 */
export function ResumeUpload({
  storageKey,
  label,
  help,
  value,
  onChange,
  sample,
  defaultResume,
}: {
  /** IndexedDB key for this upload (the club id, or the default-résumé key). */
  storageKey: string;
  label: string;
  help?: string;
  value?: ResumeMeta;
  onChange: (meta: ResumeMeta | undefined) => void;
  /** Offer the bundled fictional sample résumé (demo organization only). */
  sample?: boolean;
  /** The student's saved default résumé, offered for reuse (by reference, not copied). */
  defaultResume?: { name: string; size: number };
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  const [local, setLocal] = useState<File | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  /** The last file chosen here could not be stored by the browser. */
  const [unsaved, setUnsaved] = useState(false);
  const keyFor = (m?: ResumeMeta) => (m?.source === 'default' ? DEFAULT_RESUME_KEY : storageKey);
  const memoryOnly = value?.stored === false;

  // A saved name with no stored file (site data cleared, another browser): ask to reattach instead of pretending.
  useEffect(() => {
    if (!value || local || memoryOnly) {
      setMissing(false);
      return;
    }
    let live = true;
    getResume(keyFor(value))
      .then((f) => live && setMissing(!f || f.name !== value.name))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
    // keyFor depends only on value and storageKey
  }, [storageKey, value, local, memoryOnly]);

  // Object URLs are released after a minute, and all of them when this control goes away.
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
      urls.current = [];
    },
    [],
  );

  async function store(file: File): Promise<boolean> {
    try {
      await saveResume(storageKey, file);
      return true;
    } catch {
      return false;
    }
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setNote('');
    setBlockedUrl(null);
    const problem = await checkPdf(file);
    if (input.current) input.current.value = '';
    if (problem) return setError(problem);
    setError('');
    setLocal(file);
    const stored = await store(file);
    setUnsaved(!stored);
    setNote(stored ? `Attached ${file.name}. Saved in this browser only.` : '');
    onChange({ name: file.name, size: file.size, ...(stored ? {} : { stored: false }) });
  }

  async function retry() {
    if (!local) return;
    if (await store(local)) {
      setUnsaved(false);
      setError('');
      setNote(`Saved ${local.name} in this browser.`);
      onChange({ name: local.name, size: local.size });
    } else setError("Still couldn't save the file. It stays attached until you refresh this page.");
  }

  async function useSample() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample-resume.pdf`);
      if (!res.ok) throw new Error(String(res.status));
      await take(new File([await res.blob()], 'sample-resume.pdf', { type: 'application/pdf' }));
    } catch {
      setError("Couldn't load the sample résumé. Choose a PDF instead.");
    }
  }

  async function useDefault() {
    if (!defaultResume) return;
    const f = await getResume(DEFAULT_RESUME_KEY).catch(() => undefined);
    if (!f) return setError('Your saved résumé is no longer stored in this browser. Choose a PDF instead.');
    setError('');
    setLocal(null);
    setNote(`Using your saved résumé, ${f.name}.`);
    onChange({ name: f.name, size: f.size, source: 'default' });
  }

  function release(url: string) {
    URL.revokeObjectURL(url);
    urls.current = urls.current.filter((u) => u !== url);
  }

  async function view() {
    if (!value) return;
    setError('');
    setBlockedUrl(null);
    const blob = local ?? (await getResume(keyFor(value)).catch(() => undefined))?.blob;
    if (!blob) {
      setMissing(true);
      return setError(`Can't open ${value.name}: it's no longer stored in this browser. Attach it again.`);
    }
    const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
    const url = URL.createObjectURL(pdf);
    urls.current.push(url);
    setTimeout(() => release(url), OBJECT_URL_LIFETIME);
    const w = window.open(url, '_blank');
    if (!w) {
      setBlockedUrl(url);
      return setError('Your browser blocked the new tab. Allow pop-ups for this site, or download the PDF instead.');
    }
    try {
      w.opener = null;
    } catch {
      // Cross-context property may be read-only; the blob URL is same-origin and harmless either way.
    }
  }

  async function remove() {
    if (value?.source !== 'default') await deleteResume(storageKey);
    setLocal(null);
    setError('');
    setBlockedUrl(null);
    setUnsaved(false);
    setNote(value?.source === 'default' ? 'Saved résumé removed from this application (it stays in your profile).' : 'Résumé removed from this browser.');
    onChange(undefined);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files[0]);
  };

  return (
    <div>
      <p id={`${id}-label`} className="mb-1 text-sm font-bold text-ink">
        {label} <FieldTag />
      </p>
      {value && !missing ? (
        <div className="flex flex-wrap items-center gap-3 rounded border border-line bg-white p-3" data-testid="resume-attached">
          <FileText size={24} aria-hidden className="shrink-0 text-umass" />
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate font-bold text-ink">{value.name}</p>
            <p className="text-xs text-ink-soft">
              {fmtSize(value.size)} ·{' '}
              {memoryOnly ? 'this visit only (not stored)' : value.source === 'default' ? 'your saved résumé' : 'stored only in this browser'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={view} className="btn btn-secondary btn-sm">
              View<span className="sr-only"> {value.name}</span>
            </button>
            <button type="button" onClick={() => input.current?.click()} className="btn btn-secondary btn-sm">
              Replace<span className="sr-only"> résumé</span>
            </button>
            <button type="button" onClick={remove} className="btn btn-secondary btn-sm">
              Remove<span className="sr-only"> résumé</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx('rounded border-2 border-dashed p-5 text-center', dragging ? 'border-link bg-[#eef3f9]' : 'border-line bg-surface')}
          data-testid="resume-drop"
        >
          <Upload size={24} aria-hidden className="mx-auto text-ink-soft" />
          <p className="mt-2 text-sm text-ink">Drag a PDF here, or</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => input.current?.click()} className="btn btn-secondary btn-sm" aria-describedby={`${id}-help`}>
              Choose PDF<span className="sr-only"> for {label}</span>
            </button>
            {defaultResume && (
              <button type="button" onClick={useDefault} className="btn btn-secondary btn-sm">
                Use my saved résumé ({defaultResume.name})
              </button>
            )}
            {sample && (
              <button type="button" onClick={useSample} className="btn btn-ghost btn-sm">
                Use sample résumé (demo)
              </button>
            )}
          </div>
          {missing && value && (
            <p className="mt-3 text-sm font-bold text-warn">Reattach your résumé: {value.name} is no longer stored in this browser.</p>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        onChange={(e) => void take(e.target.files?.[0])}
        data-testid="resume-input"
      />
      <p id={`${id}-help`} className="mt-1 text-xs text-ink-soft">
        {help && `${help} `}PDF up to 5 MB. Stored only in this browser — never uploaded or sent to the organization.
      </p>
      {unsaved && local && (
        <div role="alert" className="mt-2 rounded border border-warn/40 bg-warn-soft p-3 text-sm text-ink" data-testid="resume-memory-only">
          <p className="font-bold text-warn">This browser can't store files right now.</p>
          <p className="mt-1">
            {local.name} is kept for this visit only and will be gone after a refresh (storage may be blocked, full, or in private mode). Your
            typed answers are still saved.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={retry} className="btn btn-secondary btn-sm">
              Try saving again
            </button>
            <button type="button" onClick={remove} className="btn btn-secondary btn-sm">
              Remove
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm font-bold text-badge">
          {error}
        </p>
      )}
      {blockedUrl && value && (
        <a href={blockedUrl} download={value.name} className="btn btn-secondary btn-sm mt-2">
          Download {value.name}
        </a>
      )}
      <p role="status" className="mt-1 text-xs text-success">
        {note}
      </p>
    </div>
  );
}
