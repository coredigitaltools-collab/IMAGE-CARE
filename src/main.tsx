import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AppProvider } from './context/AppContext';
import App from './App';
import './styles/globals.css';
// Tailwind v4 design system (ink-*/brand-blue-*/brand-red-* tokens,
// rounded-card/shadow-card utilities) that most feature pages already
// use via className - see vite.config.ts for the matching plugin. This
// was never imported anywhere, so every Tailwind utility class in the
// app compiled to nothing and rendered as unstyled default HTML.
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <App />
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
