---
name: Prayer notification scheduling
description: Why prayer alerts use dated native notifications rather than repeating daily alarms.
---

Schedule local alerts from each selected city's published day-by-day table, for the five prayers only; sunrise is not a prayer. Keep vibration as the default delivery choice, with optional ordinary device notification sound. Do not silently calculate missing times or repeat one clock time every day.

**Why:** Published prayer times change each day. iOS limits pending local notifications. A phone cannot renew a bounded local window while the app remains closed; long-term continuity requires a server-driven push path that starts strictly after the last locally scheduled alert. The table must not be reused across an unverified calendar-year boundary.

**How to apply:** Show local scheduled-through and remote subscription states separately, keep notification permission opt-in, reschedule only app-owned notifications, and compute remote instants in Europe/Stockholm regardless of server/device timezone. A native build must have an Expo project ID and valid push credentials; web preview cannot validate physical delivery. System sound/vibration settings and battery behavior still affect delivery.