---
name: Workspace package installation
description: A Replit package-helper mismatch in this pnpm workspace.
---

The general language-package helper runs a root-level pnpm add and cannot accept pnpm filter flags as package tokens. In this workspace that fails the pnpm root-install guard; a filtered workspace install is needed for an artifact dependency.

**Why:** An attempted helper install did not add the package and also introduced an unrelated .replit Nix setting. That side effect is not part of dependency management for the artifact.

**How to apply:** Check package.json, lockfile, and .replit after an install attempt. If the helper cannot target the artifact, use a filtered pnpm command for that artifact, and remove unrelated config edits through the validated .replit replacement workflow.