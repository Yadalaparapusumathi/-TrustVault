import '@fontsource-variable/inter';
import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { fetchCsrf } from '@/api/client';
import { AuthProvider } from '@/auth/AuthProvider';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { createQueryClient } from '@/lib/queryClient';
import App from './App';

// Obtain the XSRF-TOKEN cookie up-front so the first mutating request already carries it.
void fetchCsrf();

const queryClient = createQueryClient();
const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
