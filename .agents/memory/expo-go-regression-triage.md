---
name: Expo Go regression triage
description: Diagnose Android Expo Go launches that regress to a white splash after the app previously worked.
---

For a previously working Expo Go launch, first compare the last known-working published snapshot with the failing snapshot: inspect resolved lockfile versions and startup-related source changes before changing font or splash behavior. Successful exports, HTTP 200 bundle/assets, and Expo Doctor checks do not prove that Expo Go executed the bundle.

**Why:** A splash timeout was published without changing the Android screen, while the repository history exposed a nearby Expo package sync. The available server checks could not observe device-side JavaScript execution.

**How to apply:** Establish the exact regression window, keep hypotheses separate from confirmed device evidence, and follow the Expo skill before changing SDK versions. Do not treat a successful build or hosted bundle as a runtime test.