import { Router, type IRouter } from "express";
import { GetPrayerTimesResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const sourceUrl = "https://salat.muslim.se/data/prayertimes.json";

router.get("/prayer-times", async (req, res): Promise<void> => {
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Salah-Sverige/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      req.log.warn({ upstreamStatus: response.status }, "Prayer timetable upstream failed");
      res.status(502).json({ error: "Prayer timetable is unavailable" });
      return;
    }
    const data: unknown = await response.json();
    res.set("Cache-Control", "public, max-age=21600, stale-while-revalidate=86400");
    res.json(GetPrayerTimesResponse.parse(data));
  } catch (error) {
    req.log.error({ err: error }, "Could not fetch prayer timetable");
    res.status(502).json({ error: "Prayer timetable is unavailable" });
  }
});

export default router;