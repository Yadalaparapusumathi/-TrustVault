import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, FileText, Pencil, RotateCw } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { CLASSIFICATIONS, type Classification, type DocumentDetail, type UpdateDocumentRequest } from '@/api/types';
import { ClassificationBadge } from '@/components/domain/badges';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { formatBytes, formatDateTime } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { useCategories, useUpdateDocument } from './hooks';

export function OverviewTab({ doc, onReload }: { doc: DocumentDetail; onReload: () => Promise<unknown> }) {
  const canEdit = doc.myPermission === 'OWNER' || doc.myPermission === 'EDIT';
  const [editing, setEditing] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Details"
          icon={<FileText className="h-4 w-4" />}
          actions={
            canEdit &&
            !editing && (
              <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
                Edit details
              </Button>
            )
          }
        />
        <CardBody>
          {editing ? (
            <EditDetailsForm key={doc.lockVersion} doc={doc} onDone={() => setEditing(false)} onReload={onReload} />
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</h3>
                {doc.description ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{doc.description}</p>
                ) : (
                  <p className="mt-1.5 text-sm italic text-slate-400">No description</p>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Meta label="Category">{doc.category}</Meta>
                <Meta label="Classification">
                  <ClassificationBadge value={doc.classification} />
                </Meta>
                <Meta label="Created">{formatDateTime(doc.createdAt)}</Meta>
                <Meta label="Last updated">{formatDateTime(doc.updatedAt)}</Meta>
              </dl>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="File" description={`Current version v${doc.currentVersion}`} />
        <CardBody>
          <dl className="space-y-4">
            <Meta label="Original filename">
              <span className="break-all">{doc.originalFilename}</span>
            </Meta>
            <Meta label="Size">{formatBytes(doc.sizeBytes)}</Meta>
            <Meta label="Content type">
              <span className="font-mono text-xs">{doc.contentType}</span>
            </Meta>
            <Meta label="SHA-256">
              <div className="flex items-start gap-1">
                <code className="block min-w-0 flex-1 break-all rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">
                  {doc.sha256}
                </code>
                <CopyButton value={doc.sha256} label="Copy SHA-256" />
              </div>
            </Meta>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

interface FormState {
  name: string;
  description: string;
  category: string;
  classification: Classification;
}

function EditDetailsForm({ doc, onDone, onReload }: { doc: DocumentDetail; onDone: () => void; onReload: () => Promise<unknown> }) {
  const update = useUpdateDocument(doc.id);
  const categories = useCategories();
  const listId = useId();
  const [form, setForm] = useState<FormState>({
    name: doc.name,
    description: doc.description ?? '',
    category: doc.category,
    classification: doc.classification,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!form.category.trim()) next.category = 'Category is required.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: UpdateDocumentRequest = { lockVersion: doc.lockVersion };
    if (form.name.trim() !== doc.name) body.name = form.name.trim();
    if (form.description !== (doc.description ?? '')) body.description = form.description;
    if (form.category.trim() !== doc.category) body.category = form.category.trim();
    if (form.classification !== doc.classification) body.classification = form.classification;
    if (Object.keys(body).length === 1) {
      onDone();
      return;
    }
    update.mutate(body, {
      onSuccess: onDone,
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          setConflict(true);
          return;
        }
        if (err instanceof ApiError && Object.keys(err.errors).length) {
          setErrors(err.errors);
          return;
        }
        notifyError(err);
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {conflict && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Someone else changed this document — reload to see the latest version before editing.
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={reloading}
            leftIcon={<RotateCw className="h-3.5 w-3.5" />}
            onClick={async () => {
              setReloading(true);
              try {
                await onReload();
              } finally {
                setReloading(false);
              }
            }}
          >
            Reload
          </Button>
        </div>
      )}
      <Field id="edit-name" label="Name" error={errors.name}>
        <Input id="edit-name" value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} maxLength={255} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="edit-category" label="Category" error={errors.category}>
          <Input
            id="edit-category"
            list={listId}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            invalid={!!errors.category}
            autoComplete="off"
            required
          />
          <datalist id={listId}>
            {(categories.data ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field id="edit-classification" label="Classification" error={errors.classification}>
          <Select id="edit-classification" value={form.classification} onChange={(e) => set('classification', e.target.value as Classification)}>
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="edit-description" label="Description" optional error={errors.description}>
        <Textarea id="edit-description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} maxLength={2000} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={update.isPending} disabled={conflict}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
