import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, ToastBar, toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import './i18n/index.js';
// Side-effect: sanitize stuck prism_debug_api_mode=error_* before any requests.
import './utils/api.js';
import App from './App.jsx';
import './index.css';
import { initSuperTokensWeb } from './config/supertokens.js';

// Initialise SuperTokens before render so the axios session interceptors (utils/api.js) and any
// Session.* call have a configured SDK.
initSuperTokensWeb();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#18181b',
            color: '#f4f4f5',
            border: '1px solid #3f3f46',
            borderRadius: '12px',
            fontSize: 'var(--text-body-s)',
          },
          success: { iconTheme: { primary: '#a78bfa', secondary: '#18181b' } },
          error:   { iconTheme: { primary: '#f87171', secondary: '#18181b' } },
        }}
      >
        {(t) => (
          <ToastBar toast={t}>
            {({ icon, message }) => (
              <>
                {icon}
                {message}
                {t.type !== 'loading' && (
                  <button
                    onClick={() => toast.dismiss(t.id)}
                    className="ml-2 p-0.5 rounded-full hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer text-slate-400 hover:text-white flex items-center justify-center"
                    style={{ outline: 'none' }}
                    aria-label="Close"
                  >
                    <X size={14} />
                  </button>
                )}
              </>
            )}
          </ToastBar>
        )}
      </Toaster>
    </QueryClientProvider>
  </StrictMode>
);
