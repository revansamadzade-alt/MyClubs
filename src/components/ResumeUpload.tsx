import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { FileText, Upload } from 'lucide-react';
import { checkPdf, fmtSize } from '../lib/applicationForms';
import { deleteResume, getResume, saveResume } from '../lib/fileStore';
import { cx } from '../lib/cx';
import { FieldTag } from './Applications';

type Meta = { name: string; size: number };

/**
 * PDF résumé picker with drag-and-drop. The file is validated, then kept only in this browser (IndexedDB).
 * It is never uploaded or sent to an organization.
 */
export function ResumeUpload({
  clubId,
  label,
  help,
  value,
  onChange,
  sample,
}: {
  clubId: string;
  label: string;
  help?: string;
  value?: Meta;
  onChange: (meta: Meta | undefined) => void;
  /** Offer the bundled fictional sample résumé (demo organization only). */
  sample?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<File | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [dragging, setDragging] = useState(false);

  // A saved name with no stored file (site data cleared, another browser): ask to reattach instead of pretending.
  useEffect(() => {
    if (!value || local) {
      setMissing(false);
      return;
    }
    let live = true;
    getResume(clubId)
      .then((f) => live && setMissing(!f || f.name !== value.name))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [clubId, value, local]);

  async function take(file: File | undefined) {
    if (!file) return;
    setNote('');
    const problem = await checkPdf(file);
    if (input.current) input.current.value = '';
    if (problem) return setError(problem);
    setError('');
    setLocal(file);
    try {
      await saveResume(clubId, file);
      setNote(`Attached ${file.name}. Saved in this browser only.`);
    } catch {
      setNote(`Attached ${file.name}, but this browser can't store files. Reattach it after refreshing.`);
    }
    onChange({ name: file.name, size: file.size });
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

  async function view() {
    const blob = local ?? (await getResume(clubId).catch(() => undefined))?.blob;
    if (!blob) return setMissing(true);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function remove() {
    await deleteResume(clubId);
    setLocal(null);
    setError('');
    setNote('Résumé removed from this browser.');
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
            <p className="text-xs text-ink-soft">{fmtSize(value.size)} · stored only in this browser</p>
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
      {error && (
        <p role="alert" className="mt-1 text-sm font-bold text-badge">
          {error}
        </p>
      )}
      <p role="status" className="mt-1 text-xs text-success">
        {note}
      </p>
    </div>
  );
}
