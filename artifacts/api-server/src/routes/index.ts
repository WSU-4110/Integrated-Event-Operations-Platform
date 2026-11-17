import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import registrationRouter from "./registration";
import adminRouter from "./admin";
import { publicEventContent } from "./eventContent";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(registrationRouter);
router.use(adminRouter);
router.use(publicEventContent);
router.use(chatRouter);

export default router;
