---
name: Expo Go startup diagnostics
description: Interpreting the optional React Native DevTools install warning in this Replit Expo environment.
---

Metro can log that React Native DevTools failed to install because `libglib-2.0.so.0` is missing, while still starting normally and serving the Expo Go QR code and web preview.

**Why:** This warning concerns the container's optional native DevTools executable, not necessarily the phone app's JavaScript startup. Treat it as a separate signal from an Expo Go splash-screen hang.

**How to apply:** First verify that Metro reports it is ready and Expo dependency checks pass. Then ask for a fresh Expo Go launch or device-side error logs before changing splash or font code based on this warning alone.