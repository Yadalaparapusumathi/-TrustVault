import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/api/errors';

/** Shows an error toast unless the error is already handled globally (401 redirect / forced password change). */
export function notifyError(error: unknown, fallback?: string): void {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  if (error instanceof ApiError && (error.status === 401 || error.isPasswordChangeRequired)) return;
  toast.error(errorMessage(error, fallback));
}
