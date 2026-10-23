import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/errors';
import { CLASSIFICATIONS, type Classification } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { fileBaseName } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { FileDropzone, UploadProgress } from './FileDropzone';
import { useCategories, useUploadDocument } from './hooks';

interface FormState {
  name: string;
  category: string;
  classification: Classification;
  description: string;
}

const initialForm: FormState = { name: '', category: '', classification: 'INTERNAL', description: '' };

export function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <UploadDialogInner onClose={onClose} />;
}

function UploadDialogInner({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const upload = useUploadDocument();
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const listId = useId();

  useEffect(() => () => abortRef.current?.abort(), []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const onFile = (f: File | null, error: string | null) => {
    setFile(f);
    setFileError(error);
    if (f && !form.name.trim()) set('name', fileBaseName(f.name));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!file) setFileError('Choose a file to upload.');
    if (!form.category.trim()) nextErrors.category = 'Category is required.';
    if (form.name.length > 255) nextErrors.name = 'Name is too long.';
    setErrors(nextErrors);
    if (!file || fileError || Object.keys(nextErrors).length > 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    upload.mutate(
      {
        req: {
          file,
          name: form.name.trim() || undefined,
          category: form.category.trim(),
          classification: form.classification,
          description: form.description.trim() || undefined,
        },
        signal: controller.signal,
      },
      {
        onSuccess: (doc) => {
          onClose();
          navigate(`/documents/${encodeURIComponent(doc.id)}`);
        },
        onError: (err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (err instanceof ApiError) {
            if (err.status === 413 || err.status === 415 || err.errors.file) {
              setFileError(err.errors.file ?? err.userMessage);
              return;
            }
            if (Object.keys(err.errors).length > 0) {
              setErrors(err.errors);
              if (err.errors.file) setFileError(err.errors.file);
              return;
            }
          }
          notifyError(err, 'Upload failed');
        },
      },
    );
  };

  const busy = upload.isPending;

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Upload document"
      description="File types and content are validated, encrypted and fingerprinted (SHA-256). Only you have access until you share it."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              if (busy) abortRef.current?.abort();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="upload-form" loading={busy} disabled={!file || !!fileError}>
            Upload
          </Button>
        </>
      }
    >
      <form id="upload-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <FileDropzone file={file} onFile={onFile} disabled={busy} error={fileError} />
        {busy && <UploadProgress progress={upload.progress} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="upload-name" label="Name" error={errors.name} hint="Defaults to the file name." className="sm:col-span-2">
            <Input id="upload-name" value={form.name} onChange={(e) => set('name', e.target.value)} disabled={busy} invalid={!!errors.name} maxLength={255} />
          </Field>
          <Field id="upload-category" label="Category" error={errors.category}>
            <Input
              id="upload-category"
              list={listId}
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              disabled={busy}
              invalid={!!errors.category}
              placeholder="e.g. Contracts"
              required
              aria-describedby={errors.category ? 'upload-category-error' : undefined}
              autoComplete="off"
            />
            <datalist id={listId}>
              {(categories.data ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field id="upload-classification" label="Classification" error={errors.classification}>
            <Select
              id="upload-classification"
              value={form.classification}
              onChange={(e) => set('classification', e.target.value as Classification)}
              disabled={busy}
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="upload-description" label="Description" optional error={errors.description} className="sm:col-span-2">
            <Textarea id="upload-description" value={form.description} onChange={(e) => set('description', e.target.value)} disabled={busy} rows={3} maxLength={2000} />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
