import { AlertTriangle, RotateCw } from 'lucide-react';
import { errorMessage } from '@/api/errors';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <EmptyState
      tone="danger"
      icon={<AlertTriangle className="h-5 w-5" />}
      title={title}
      description={errorMessage(error)}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RotateCw className="h-3.5 w-3.5" />}>
            Try again
          </Button>
        )
      }
    />
  );
}
