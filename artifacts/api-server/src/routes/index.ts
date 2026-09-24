import { Router, type IRouter } from "express";
import healthRouter from "./health";
import prayerTimesRouter from "./prayer-times";

const router: IRouter = Router();

router.use(healthRouter);
router.use(prayerTimesRouter);

export default router;
