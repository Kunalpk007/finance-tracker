import './ui/styles.css';
import { App } from './ui/app';
import { LocalAdapter } from './store/local-adapter';
import { RemoteAdapter, configFromEnv } from './store/remote-adapter';

// Supabase when VITE_SUPABASE_URL/ANON_KEY are set, else the offline IndexedDB demo.
const cfg = configFromEnv();
const app = new App(cfg ? new RemoteAdapter(cfg) : new LocalAdapter());
app.boot();

// Expose for Playwright / manual debugging in dev builds only.
if (import.meta.env.DEV) {
  (window as any).__app = app;
}
