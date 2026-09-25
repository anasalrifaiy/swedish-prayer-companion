import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prayerTimesRouter from "./prayer-times";
import remindersRouter from "./reminders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(prayerTimesRouter);
router.use(remindersRouter);

export default router;
