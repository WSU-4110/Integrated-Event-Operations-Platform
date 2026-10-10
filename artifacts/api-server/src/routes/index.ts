import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import waitlistRouter from "./waitlist";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(waitlistRouter);
router.use(adminRouter);

export default router;
