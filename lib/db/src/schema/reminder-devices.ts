import { pgTable, text, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reminderDevices = pgTable("reminder_devices", {
  token: text("token").primaryKey(),
  city: text("city").notNull(),
  mode: text("mode").notNull(),
  prayers: jsonb("prayers").$type<Record<string, boolean>>().notNull(),
  enabled: boolean("enabled").notNull(),
  localUntil: timestamp("local_until", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reminderDeliveries = pgTable("reminder_deliveries", {
  token: text("token").notNull(),
  day: text("day").notNull(),
  prayer: text("prayer").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [primaryKey({ columns: [table.token, table.day, table.prayer] })]);

export const insertReminderDeviceSchema = createInsertSchema(reminderDevices);
export type ReminderDevice = z.infer<typeof insertReminderDeviceSchema>;