import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initLogInterceptor } from './lib/logInterceptor';
import { bootstrapHubToken, installAxumAuthFetch } from './lib/utils';

initLogInterceptor();
installAxumAuthFetch();
void bootstrapHubToken();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
