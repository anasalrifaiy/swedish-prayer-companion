---
name: Expo web location lookup
description: Browser location and country lookup differ from native Expo behavior, including location freshness.
---

Expo Location's web implementation can obtain coordinates but throws for reverse geocoding. Do not assume a successful browser geolocation request supplies a city name. Native and browser country checks need separate paths, and the city list may still be loading when location resolves.

**Why:** A coordinate-only success looked like a failed city match in the web preview, even though the official timetable included the city.

Expo's web `getCurrentPositionAsync` requests the browser's location with `maximumAge: Infinity`, so reopening a page can reuse old coordinates even when GPS has changed.

**Why:** A fresh-position attempt can appear to run successfully without actually updating the nearest city.

**How to apply:** For web location refresh, request a fresh fix directly from the browser with `maximumAge: 0`; keep Expo's native location API for Android/iOS. Verify a country check, nearest-city selection, and official timetable row with explicit browser coordinates. Do not substitute calculated prayer times for missing source data. Browser focus simulation is not a substitute for checking native foreground behavior on a physical device.