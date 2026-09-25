import { Router, type IRouter } from "express";
import { db, reminderDevices } from "@workspace/db";
import { SaveReminderDeviceBody, SaveReminderDeviceResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.put("/reminders/device", async (req, res): Promise<void> => {
  const parsed = SaveReminderDeviceBody.safeParse(req.body);
  if (!parsed.success || !Number.isFinite(parsed.data.localUntil.getTime())) {
    res.status(400).json({ error: "Invalid reminder subscription" });
    return;
  }
  const input = parsed.data;
  // A device may disable a subscription while the upstream timetable is unavailable.
  if (input.enabled && !input.city) {
    res.status(400).json({ error: "Select a timetable city" });
    return;
  }
  await db.insert(reminderDevices).values({
    token: input.token, city: input.city, mode: input.mode,
    prayers: input.prayers, enabled: input.enabled,
    localUntil: new Date(input.localUntil), updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: reminderDevices.token,
    set: {
      city: input.city, mode: input.mode, prayers: input.prayers,
      enabled: input.enabled, localUntil: new Date(input.localUntil), updatedAt: new Date(),
    },
  });
  res.json(SaveReminderDeviceResponse.parse({ active: input.enabled }));
});

export default router;