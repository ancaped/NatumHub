import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initLogInterceptor } from './lib/logInterceptor';
import { bootstrapHubToken, installAxumAuthFetch } from './lib/utils';
import { FeedbackHost } from './components/shared/FeedbackHost';

initLogInterceptor();
installAxumAuthFetch();
void bootstrapHubToken();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FeedbackHost>
      <App />
    </FeedbackHost>
  </React.StrictMode>,
);
