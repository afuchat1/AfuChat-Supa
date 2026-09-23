import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Development uses the Vite proxy so the browser does not call localhost or
// the protected production API directly. Production can override this with
// VITE_API_BASE_URL at build time.
const apiBaseUrl = import.meta.env.DEV
  ? null
  : (import.meta.env.VITE_API_BASE_URL || 'https://api.afuchat.com');
setBaseUrl(apiBaseUrl);

createRoot(document.getElementById('root')!).render(<App />);
