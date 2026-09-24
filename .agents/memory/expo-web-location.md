---
name: Expo web location lookup
description: Browser location coordinates and city-name lookup behave differently in this Expo app.
---

Expo Location's web implementation can obtain coordinates but throws for reverse geocoding. Do not assume a successful browser geolocation request supplies a city name. Native reverse geocoding and browser city lookup need separate paths, and the city list may still be loading when location resolves.

**Why:** A coordinate-only success looked like a failed city match in the web preview, even though the official timetable included the city.

**How to apply:** When changing location-based city selection, test the web flow with an explicit browser location and verify both the city match and the displayed official timetable row. Do not substitute calculated prayer times for missing source data.