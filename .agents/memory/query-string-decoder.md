---
name: Query-string decoder compatibility
description: Compatibility constraint when securing an older query-string dependency in the Expo app.
---

The safe decode-uri-component release exposes an ESM default export instead of the callable CommonJS value expected by older query-string versions. A version override alone passes an audit but breaks URL parsing at runtime; keep a compatibility adapter in the consuming package until its upstream dependency updates.

**Why:** The security fix changes the module export shape, while Expo Router still brings in an older CommonJS query-string. A runtime query parse exposed the mismatch after a clean dependency audit.

**How to apply:** When upgrading or removing the dependency patch, test encoded query parsing through the actual Expo Router dependency path, not just the lockfile or TypeScript check.