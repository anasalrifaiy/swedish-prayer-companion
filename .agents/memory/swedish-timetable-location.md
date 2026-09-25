---
name: Swedish timetable location policy
description: How GPS locations should map to Islamiska förbundets city-based prayer tables.
---

Within Sweden, select the geographically nearest available timetable city using GPS coordinates. Display the city and distance, and state that its published times are for that city, not exact times for the user's position. Outside Sweden, do not automatically label any Swedish timetable row as local prayer times. Manual city selection remains available.

**Why:** The user expects location to work even outside the named cities, but also wants Islamiska förbundets tables rather than independently calculated prayer times. A nearest-city choice is useful only if its approximation is explicit.

**How to apply:** Keep coordinate lookup separate from the timetable source; do not silently calculate or substitute prayer times when a city is absent. Keep Qibla based on actual GPS coordinates even when a timetable city is selected by proximity.