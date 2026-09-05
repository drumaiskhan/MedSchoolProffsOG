---
name: Zod generator compatibility
description: Orval's current Zod output uses Zod 4 top-level helpers.
---

The generated API validation package must use Zod 4 when the workspace's Orval version emits helpers such as `zod.email()` and `zod.int()`.

**Why:** The workspace initially resolved Zod 3, so code generation succeeded but the required library typecheck failed on generated schemas.

**How to apply:** Keep the workspace Zod catalog aligned with the generator before running API codegen; regenerate and run `pnpm run typecheck:libs` after contract changes.