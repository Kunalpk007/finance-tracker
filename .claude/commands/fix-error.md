---
description: Identify an error, fix its root cause, and log it in docs/error-log/ERROR_LOG.md
---
Identify and fix this error: $ARGUMENTS

Follow the error-log protocol: diagnose from evidence, fix the root cause, then record the entry with
`node .claude/hooks/error-log/log-error.mjs --title ... --error ... --cause ... --fix ... --files ...`.
