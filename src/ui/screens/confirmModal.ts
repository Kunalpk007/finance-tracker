import type { AppState } from '../state';
import { esc } from '../util';

/** One shared confirm dialog for every "are you sure?" in the app — replaces
 *  the browser's native confirm() popup, which can't be styled and (on some
 *  platforms) shows the raw page URL, with a themed modal matching the rest
 *  of the UI. App.confirmAction() opens it; OK runs the stored action, ×/
 *  Cancel/Esc/backdrop just close it. */
export function vConfirmModal(app: AppState): string {
  const c = app.confirmModal;
  if (!c) return '';
  return `<dialog class="modal" id="confirmModal">
    <div class="modal-body">
      <h2>${esc(c.title ?? 'Are you sure?')}</h2>
      <p class="sub" style="margin-bottom:18px">${esc(c.message)}</p>
      <div class="row">
        <button class="btn ghost grow" id="confirmCancel" data-testid="confirm-cancel">Cancel</button>
        <button class="btn grow${c.danger ? ' danger' : ''}" id="confirmOk" data-testid="confirm-ok">${esc(c.okLabel ?? 'OK')}</button>
      </div>
    </div>
  </dialog>`;
}
