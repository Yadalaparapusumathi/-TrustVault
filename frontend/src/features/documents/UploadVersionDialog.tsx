import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/api/errors';
import type { DocumentDetail } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { notifyError } from '@/lib/notify';
import { FileDropzone, UploadProgress } from './FileDropzone';
import { useUploadVersion } from './hooks';

export function UploadVersionDialog({ doc, open, onClose }: { doc: DocumentDetail; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Inner doc={doc} onClose={onClose} />;
}

function Inner({ doc, onClose }: { doc: DocumentDetail; onClose: () => void }) {
  const upload = useUploadVersion(doc.id);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setFileError('Choose a file to upload.');
      return;
    }
    if (fileError) return;
    const controller = new AbortController();
    abortRef.current = controller;
    upload.mutate(
      { file, signal: controller.signal },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (err instanceof ApiError && (err.status === 400 || err.status === 413 || err.status === 415)) {
            setFileError(err.errors.file ?? err.userMessage);
            return;
          }
          notifyError(err, 'Upload failed');
        },
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!upload.isPending}
      title="Upload new version"
      description={
        <>
          The new file becomes version <span className="font-medium text-slate-700">v{doc.currentVersion + 1}</span> of “{doc.name}”.
          Previous versions remain available.
        </>
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="version-form" loading={upload.isPending} disabled={!file || !!fileError}>
            Upload version
          </Button>
        </>
      }
    >
      <form id="version-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <FileDropzone
          file={file}
          disabled={upload.isPending}
          error={fileError}
          onFile={(f, err) => {
            setFile(f);
            setFileError(err);
          }}
        />
        {upload.isPending && <UploadProgress progress={upload.progress} />}
      </form>
    </Dialog>
  );
}
