import type { StoreState } from '../domain/types';

/** Storage is deliberately abstracted (D17). Everything above talks only to
 *  this interface — swapping to hosted sync is a config change, not a
 *  rewrite. LocalAdapter (IndexedDB) and RemoteAdapter (Supabase) both
 *  satisfy it. */
export interface StoreAdapter {
  name: string;
  load(): Promise<StoreState | null>;
  save(state: StoreState): Promise<boolean>;
  /** Why the last save failed, when the backend can say (e.g. an RLS refusal). */
  lastError?: string;
}
