import { db, reminderDeliveries, reminderDevices } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { logger } from "./logger";

const SOURCE = "https://salat.muslim.se/data/prayertimes.json";
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
type Prayer = typeof PRAYERS[number];
type Table = {
  downloadedAt: string;
  cities: Array<{ value: string; label: string }>;
  tables: Record<string, Record<string, { rows: Array<{ cells: string[] }> }>>;
};
let cached: { data: Table; fetchedAt: number } | null = null;
let retryForYear: number | null = null;
let retryAfter = 0;

async function currentTable(year: number): Promise<Table | null> {
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60_000
      && new Date(cached.data.downloadedAt).getUTCFullYear() === year) return cached.data;
  if (retryForYear === year && Date.now() < retryAfter) return null;
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Timetable HTTP ${response.status}`);
    const data = await response.json() as Table;
    if (!Array.isArray(data.cities) || !data.tables || !Number.isFinite(Date.parse(data.downloadedAt))
        || new Date(data.downloadedAt).getUTCFullYear() !== year) {
      retryForYear = year;
      retryAfter = Date.now() + 6 * 60 * 60_000;
      throw new Error("A timetable for this calendar year is not published yet");
    }
    cached = { data, fetchedAt: Date.now() };
    retryForYear = null;
    retryAfter = 0;
    return data;
  } catch (error) {
    if (retryForYear !== year) {
      retryForYear = year;
      retryAfter = Date.now() + 60_000;
    }
    throw error;
  }
}

// Interpret published wall-clock times in Sweden even if the server runs in UTC.
// The second pass covers the UTC offset change at daylight saving boundaries.
function stockholmInstant(day: string, time: string): Date | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const target = `${day} ${time}`;
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const wall = (date: Date) => {
    const parts = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  };
  const utc = Date.parse(`${day}T${time}:00Z`);
  for (const hours of [1, 2]) {
    const date = new Date(utc - hours * 60 * 60_000);
    if (wall(date) === target) return date;
  }
  return null;
}

async function send(token: string, city: string, prayer: Prayer, mode: string): Promise<"sent" | "invalid"> {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      to: token, title: `${prayer} · ${city}`,
      body: `Det är dags för ${prayer} enligt tabellen för ${city}.`,
      sound: mode === "sound" ? "default" : null,
      channelId: mode === "sound" ? "prayer-sound-v1" : "prayer-vibration-v1",
      data: { owner: "prayer-sverige", city, prayer },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`);
  const result = await response.json() as { data?: { status: string; details?: { error?: string }; message?: string } };
  if (result.data?.status === "ok") return "sent";
  if (result.data?.details?.error === "DeviceNotRegistered") return "invalid";
  throw new Error(result.data?.message ?? "Expo rejected push notification");
}

let running = false;
export async function deliverReminders(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const day = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    // No alert is sent if the year's official table has not been published yet.
    const table = await currentTable(Number(day.slice(0, 4)));
    if (!table) return;
    const devices = await db.select().from(reminderDevices).where(eq(reminderDevices.enabled, true));
    for (const device of devices) {
      const key = table.cities.find(item => item.label === device.city)?.value;
      const rows = key ? table.tables[key]?.[String(Number(day.slice(5, 7)))]?.rows : undefined;
      const row = rows?.find(item => item.cells?.[0] === String(Number(day.slice(8, 10))));
      if (!row) continue;
      for (const [index, prayer] of PRAYERS.entries()) {
        if (!device.prayers[prayer]) continue;
        // Column 2 is sunrise, not a prayer.
        const column = index === 0 ? 1 : index + 2;
        const due = stockholmInstant(day, row.cells[column]);
        if (!due || now.getTime() < due.getTime() || now.getTime() - due.getTime() > 5 * 60_000
            || due <= device.localUntil) continue;
        const claim = await db.insert(reminderDeliveries)
          .values({ token: device.token, day, prayer, claimedAt: now })
          .onConflictDoUpdate({
            target: [reminderDeliveries.token, reminderDeliveries.day, reminderDeliveries.prayer],
            set: { claimedAt: now },
            setWhere: and(
              sql`${reminderDeliveries.sentAt} is null`,
              lt(reminderDeliveries.claimedAt, new Date(now.getTime() - 2 * 60_000)),
            ),
          }).returning();
        if (!claim.length) continue;
        try {
          // Recheck after the claim: the user may have disabled reminders or
          // switched cities while this tick was reading the previous snapshot.
          const [latest] = await db.select().from(reminderDevices)
            .where(eq(reminderDevices.token, device.token));
          if (!latest?.enabled || latest.city !== device.city || !latest.prayers[prayer]
              || latest.localUntil >= due) {
            await db.delete(reminderDeliveries).where(and(
              eq(reminderDeliveries.token, device.token),
              eq(reminderDeliveries.day, day), eq(reminderDeliveries.prayer, prayer),
            ));
            continue;
          }
          const outcome = await send(device.token, device.city, prayer, device.mode);
          if (outcome === "invalid") {
            await db.update(reminderDevices).set({ enabled: false }).where(eq(reminderDevices.token, device.token));
          }
          await db.update(reminderDeliveries).set({ sentAt: new Date() })
            .where(and(eq(reminderDeliveries.token, device.token), eq(reminderDeliveries.day, day), eq(reminderDeliveries.prayer, prayer)));
        } catch (error) {
          logger.warn({ err: error, city: device.city, prayer }, "Push delivery failed; will retry");
        }
      }
    }
    // Keep deduplication records bounded.
    if (now.getUTCHours() === 2) {
      await db.delete(reminderDeliveries).where(lt(reminderDeliveries.day, new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10)));
    }
  } finally {
    running = false;
  }
}

export function startReminderDelivery(): void {
  const tick = () => void deliverReminders().catch(err => logger.error({ err }, "Reminder delivery tick failed"));
  tick();
  setInterval(tick, 30_000).unref();
}