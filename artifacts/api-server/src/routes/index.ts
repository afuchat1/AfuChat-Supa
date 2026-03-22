import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiChatRouter from "./ai-chat";
import pesapalRouter from "./pesapal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiChatRouter);
router.use(pesapalRouter);

export default router;
