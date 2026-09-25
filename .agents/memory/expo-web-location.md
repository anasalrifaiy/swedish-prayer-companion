---
name: Expo web location lookup
description: Browser location coordinates and city-name lookup behave differently in this Expo app.
---

Expo Location's web implementation can obtain coordinates but throws for reverse geocoding. Do not assume a successful browser geolocation request supplies a city name. Native and browser country checks need separate paths, and the city list may still be loading when location resolves.

**Why:** A coordinate-only success looked like a failed city match in the web preview, even though the official timetable included the city.

**How to apply:** When changing location-based city selection, test the web flow with an explicit browser location and verify the country check, nearest-city selection, and displayed official timetable row. Do not substitute calculated prayer times for missing source data.