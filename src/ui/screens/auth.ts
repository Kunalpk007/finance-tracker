import type { AppState } from '../state';
import { esc } from '../util';

function shell(title: string, sub: string, body: string, app: AppState): string {
  const { authMsg, authInfo } = app;
  return `<div style="padding-top:22px">
    <div style="text-align:center;margin-bottom:20px">
      <div style="width:46px;height:46px;border-radius:13px;background:var(--accent);color:#fff;
        display:inline-flex;align-items:center;justify-content:center;font-size:23px;font-weight:600">₹</div>
      <h1 style="margin:11px 0 3px">${esc(title)}</h1>
      <p class="sub" style="margin:0">${esc(sub)}</p>
    </div>
    ${authMsg ? (authInfo
      ? `<div class="card" style="background:var(--good-soft);border-color:#b7e1c8" data-testid="auth-info">
      <div class="tiny" style="color:var(--good);font-weight:600">${esc(authMsg)}</div></div>`
      : `<div class="card" style="background:var(--bad-soft);border-color:#f5c6c4" data-testid="auth-error">
      <div class="tiny" style="color:var(--bad);font-weight:600">${esc(authMsg)}</div></div>`) : ''}
    ${body}</div>`;
}

export function vLogin(app: AppState): string {
  return shell('Sign in', 'One login. Your role depends on the workspace.', `
  <div class="card">
    <label class="f"><span>Email</span><input id="liEmail" type="email" autocomplete="username" placeholder="you@example.com" data-testid="login-email"></label>
    <label class="f"><span>Password</span><input id="liPass" type="password" autocomplete="current-password" placeholder="••••••••" data-testid="login-password"></label>
    <button class="btn wide" id="doLogin" data-testid="login-submit">Sign in</button>
  </div>
  <p class="sub" style="text-align:center">No account? <a href="#" data-goto="signup" data-testid="goto-signup">Create one</a></p>
  ${app.remote
    ? '<p class="sub" style="text-align:center">Have an invite code? Sign in or create an account first, then enter it. A code alone never gives access.</p>'
    : '<p class="sub" style="text-align:center">Have an invite code? <a href="#" data-goto="redeem">Redeem it</a></p>'}
  ${app.remote ? '' : `<div class="card" style="background:#fafbfc"><div class="tiny">
    <b>Demo logins</b> (password <code>demo1234</code>): kunal@example.com (admin in both workspaces),
    priya@example.com (household member), ramesh@example.com (business worker).
  </div></div>`}`, app);
}

export function vSignup(app: AppState): string {
  return shell('Create your account', 'One login can hold several workspaces.', `
  <div class="card">
    <label class="f"><span>Your name</span><input id="suName" placeholder="Full name" data-testid="signup-name"></label>
    <label class="f"><span>Email</span><input id="suEmail" type="email" autocomplete="username" data-testid="signup-email"></label>
    <label class="f"><span>Password</span><input id="suPass" type="password" autocomplete="new-password" placeholder="At least 6 characters" data-testid="signup-password"></label>
    <button class="btn wide" id="doSignup" data-testid="signup-submit">Create account</button>
  </div>
  <p class="sub" style="text-align:center">Already have an account? <a href="#" data-goto="login">Sign in</a></p>`, app);
}

export function vRedeem(app: AppState): string {
  return shell('Join a workspace', 'Enter the code an admin gave you.', `
  <div class="card">
    <label class="f"><span>Invite code</span><input id="rdCode" placeholder="AB-CDEFGHJK" style="text-transform:uppercase" data-testid="redeem-code"></label>
    <button class="btn wide" id="doRedeem" data-testid="redeem-submit">Join</button>
  </div>
  <p class="sub" style="text-align:center"><a href="#" data-goto="login">Back to sign in</a></p>`, app);
}

export function vPickWorkspace(app: AppState): string {
  const mine = app.scope.myWorkspaces();
  return `<div style="padding-top:22px">
    <h1 style="text-align:center">Choose a workspace</h1>
    <p class="sub" style="text-align:center">Your role depends on which one you pick.</p>
    ${mine.map((w) => {
      const mem = app.S.memberships.find((m) => m.workspaceId === w.id && m.userId === app.S.session.userId);
      return `<div class="card" data-pickws="${w.id}" style="cursor:pointer" data-testid="workspace-${esc(w.id)}">
        <div class="between">
          <div><div style="font-weight:650;font-size:15.5px">${esc(w.name)}</div>
          <div class="tiny">${w.type === 'business' ? 'Business' : 'Household'} · ${esc(mem?.role ?? '')}</div></div>
          <span class="tiny">›</span>
        </div></div>`;
    }).join('') || '<div class="empty">No workspaces yet.</div>'}
    <div class="card">
      <h3>Create a new workspace</h3>
      <label class="f"><span>Name</span><input id="wsName" placeholder="e.g. Our Home" data-testid="ws-name"></label>
      <div class="seg" id="wsType" data-testid="ws-type">
        <button class="on" data-wstype="household">Household</button>
        <button data-wstype="business">Business</button>
      </div>
      <button class="btn wide" id="doCreateWs" data-testid="ws-create">Create</button>
    </div>
    <p class="sub" style="text-align:center"><a href="#" data-goto="redeem">Have an invite code instead?</a></p>
    <button class="btn wide ghost" id="doSignOut" data-testid="ws-signout">Sign out</button>`;
}
