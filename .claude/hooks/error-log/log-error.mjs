// Appends one entry to docs/error-log/ERROR_LOG.md:
//   node .claude/hooks/error-log/log-error.mjs --title "..." --error "..." --cause "..." --fix "..." [--files "a.ts, b.sql"]
import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { values: v } = parseArgs({
  options: { title: { type: 'string' }, error: { type: 'string' }, cause: { type: 'string' }, fix: { type: 'string' }, files: { type: 'string' } }
});
for (const k of ['title', 'error', 'cause', 'fix']) {
  if (!v[k]) { console.error(`missing --${k}`); process.exit(1); }
}

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const file = resolve(root, 'docs/error-log/ERROR_LOG.md');
mkdirSync(dirname(file), { recursive: true });
if (!existsSync(file)) writeFileSync(file, '# Error log\n\nOne entry per error: what was seen, why it happened, and the fix applied.\n');

const id = 'ERR-' + String((readFileSync(file, 'utf8').match(/^## ERR-/gm) ?? []).length + 1).padStart(3, '0');
appendFileSync(file, `
## ${id} — ${v.title}

- **Date:** ${new Date().toISOString().slice(0, 10)}
- **Error:**
  \`\`\`
  ${v.error.replace(/\n/g, '\n  ')}
  \`\`\`
- **Cause:** ${v.cause}
- **Fix:** ${v.fix}${v.files ? `\n- **Files:** ${v.files}` : ''}
`);
console.log(`Logged ${id} in docs/error-log/ERROR_LOG.md`);
