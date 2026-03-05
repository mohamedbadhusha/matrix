import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app/App';

// StrictMode is intentionally omitted: it double-mounts in dev which causes
// Supabase's Web Lock API to deadlock (AbortError: Lock broken by steal option).
createRoot(document.getElementById('root')!).render(<App />);
