import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import type { ApplicantProfile as Profile, ResumeMeta } from '../../types';
import { useStore } from '../../context/StoreContext';
import { PROFILE_FIELDS, cleanValues, validateField, type ApplicationFormDef } from '../../lib/applicationForms';
import { fmtStamp } from '../../lib/applications';
import { DEFAULT_RESUME_KEY } from '../../lib/fileStore';
import { Field, fieldId } from '../../components/FormField';
import { ResumeUpload } from '../../components/ResumeUpload';
import { PageHeader } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

type Values = Record<string, string>;
const KEYS = ['fullName', 'email', 'major', 'minor', 'classYear', 'github', 'linkedin', 'portfolio', 'experience'] as const;
const DEF: ApplicationFormDef = { template: 'general', templateLabel: 'Profile', steps: [{ id: 'personal', title: 'Profile', fields: PROFILE_FIELDS }] };

const toValues = (p: Profile | null): Values => Object.fromEntries(KEYS.map((k) => [k, p?.[k] ?? '']).filter(([, v]) => v));

export default function ApplicantProfilePage() {
  useTitle('My applicant profile');
  const { profile, saveProfile, deleteProfile } = useStore();
  const [values, setValues] = useState<Values>(() => toValues(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of PROFILE_FIELDS) {
      const m = validateField(f, values[f.id]);
      if (m) errs[f.id] = m;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = PROFILE_FIELDS.find((f) => errs[f.id]);
      if (first) document.getElementById(fieldId(first.id))?.focus();
      return;
    }
    const clean = cleanValues(DEF, values);
    setValues(clean);
    saveProfile({ ...clean, ...(profile?.resume ? { resume: profile.resume } : {}) }, 'Applicant profile saved in this browser.');
  };

  const onResume = (meta: ResumeMeta | undefined) => {
    const base = { ...cleanValues(DEF, toValues(profile)) };
    // Only a résumé the browser actually stored can be reused later.
    saveProfile(meta && meta.stored !== false ? { ...base, resume: { name: meta.name, size: meta.size } } : base, meta ? undefined : 'Default résumé removed.');
  };

  const remove = () => {
    if (!window.confirm('Delete your applicant profile and default résumé from this browser? Applications you already started keep their answers.')) return;
    deleteProfile();
    setValues({});
    setErrors({});
  };

  const errorCount = Object.keys(errors).length;

  return (
    <article className="max-w-3xl">
      <Link to="/clubs/applications" className="mb-4 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
        <ArrowLeft size={16} aria-hidden /> All applications
      </Link>
      <PageHeader
        title="My applicant profile"
        description="Optional details reused to fill in new application forms. Every field is optional."
      />
      <p className="mb-5 flex gap-2 rounded-md border border-[#b3d7ee] bg-[#eef6fb] p-3 text-sm text-ink">
        <Lock size={16} aria-hidden className="mt-0.5 shrink-0 text-link" />
        Stored only in this browser. This is not an account and nothing is sent anywhere. Editing it never changes applications you already
        started.
      </p>

      <form onSubmit={submit} noValidate className="card space-y-5 p-5" aria-labelledby="profile-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="profile-heading" className="text-xl font-bold text-ink">
            Your details
          </h2>
          {profile && <span className="text-xs text-ink-soft">Saved {fmtStamp(profile.updatedAt)}</span>}
        </div>
        {errorCount > 0 && (
          <p role="alert" className="rounded-md border border-badge/40 bg-[#fdeeee] p-3 text-sm font-bold text-badge">
            {errorCount === 1 ? '1 field needs attention.' : `${errorCount} fields need attention.`}
          </p>
        )}
        {PROFILE_FIELDS.map((f) => (
          <Field
            key={f.id}
            f={f}
            value={values[f.id] ?? ''}
            error={errors[f.id]}
            onChange={(v) => {
              setValues((p) => ({ ...p, [f.id]: v }));
              if (errors[f.id]) setErrors(({ [f.id]: _, ...rest }) => rest);
            }}
            onBlur={() => {
              if (!values[f.id]?.trim()) return;
              const m = validateField(f, values[f.id]);
              setErrors((p) => {
                const { [f.id]: _, ...rest } = p;
                return m ? { ...rest, [f.id]: m } : rest;
              });
            }}
          />
        ))}
        <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <button type="submit" className="btn btn-primary">
            Save profile
          </button>
          {profile && (
            <button type="button" onClick={remove} className="btn btn-secondary">
              Delete profile
            </button>
          )}
        </div>
      </form>

      <section className="card mt-6 p-5" aria-labelledby="default-resume-heading">
        <h2 id="default-resume-heading" className="text-xl font-bold text-ink">
          Default résumé
        </h2>
        <p className="mb-3 mt-1 text-sm text-ink-soft">
          Uploading here makes this PDF your default. New application forms offer “Use my saved résumé”, and you can still attach a different PDF
          for any one application.
        </p>
        <ResumeUpload storageKey={DEFAULT_RESUME_KEY} label="Default résumé (PDF)" value={profile?.resume} onChange={onResume} />
      </section>
    </article>
  );
}
