---
name: Prayer notification scheduling
description: Why prayer alerts use dated native notifications rather than repeating daily alarms.
---

Schedule local alerts from each selected city's published day-by-day table, for the five prayers only; sunrise is not a prayer. Keep vibration as the default delivery choice, with optional ordinary device notification sound. Do not silently calculate missing times or repeat one clock time every day.

**Why:** Published prayer times change each day. iOS limits the number of pending local notifications, so a bounded window must be renewed on app opening/foreground and when the city or preferences change. The table also should not be reused across an unverified calendar-year boundary.

**How to apply:** Show the scheduled-through date, keep notification permission opt-in, reschedule only app-owned notifications, and state that system sound/vibration settings and battery behavior affect delivery. Native delivery must be confirmed on a physical device; web preview cannot validate it.