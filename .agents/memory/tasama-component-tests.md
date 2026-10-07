---
name: Tasama component test runtime
description: Avoid false JSX runtime failures when running imported frontend component tests from the monorepo.
---

Run imported frontend component tests using that frontend's TypeScript configuration, not the outer workspace's default configuration.

**Why:** Node/tsx invoked from the imported app root otherwise compiled JSX with the classic runtime and reported `React is not defined`, even though the frontend type-check and Vite build were correct.

**How to apply:** From the imported app directory, prefix component-test and server-rendered preview commands with `TSX_TSCONFIG_PATH=apps/web/tsconfig.json`. Do not add unnecessary React imports or change production JSX settings to fix this test-only configuration mismatch.
