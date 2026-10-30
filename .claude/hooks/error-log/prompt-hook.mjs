// UserPromptSubmit hook: when the prompt asks to identify/fix an error, inject the
// logging protocol so every fix ends with an entry in docs/error-log/ERROR_LOG.md.
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let prompt = '';
  try { prompt = JSON.parse(input).prompt ?? ''; } catch { /* no prompt, stay silent */ }
  if (!/\/fix-error|(identify|diagnose|fix|log)\b.{0,40}\berror/i.test(prompt)) return;
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        'ERROR-LOG PROTOCOL: (1) find the real error and its root cause from evidence (logs, code), not a guess; ' +
        '(2) fix it; (3) once fixed, record it with: node .claude/hooks/error-log/log-error.mjs ' +
        '--title "..." --error "<exact message>" --cause "<root cause>" --fix "<what changed>" --files "<paths>". ' +
        'Do not log an error that is not yet fixed; say so instead.'
    }
  }));
});
