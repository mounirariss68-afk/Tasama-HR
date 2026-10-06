---
name: Tasama publishing constraints
description: Production startup limits and the supported way to preserve the imported demo unchanged.
---

Tasama's artifact deployment has an observed 60-second port-opening limit. Its original full seed can exceed that limit against the managed production database, even though it completes quickly in development.

**Why:** Publishing logs showed the process terminated during first-run seeding before opening port 5000. Production contained only the first client's schemas afterward.

**How to apply:** Inspect the latest logs rather than assuming all publish failures have the same cause. For seed-related startup timeouts, recommend the Publishing tool's development-data copy/overwrite option after verifying development is fully seeded. Warn that this replaces production data; do not directly mutate production, edit imported startup logic, or invent an unsupported timeout setting.
