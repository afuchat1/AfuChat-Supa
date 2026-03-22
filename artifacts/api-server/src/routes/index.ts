import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiChatRouter from "./ai-chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiChatRouter);

export default router;
