import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiChatRouter from "./ai-chat";
import pesapalRouter from "./pesapal";
import accountPurgeRouter from "./account-purge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiChatRouter);
router.use(pesapalRouter);
router.use(accountPurgeRouter);

export default router;
