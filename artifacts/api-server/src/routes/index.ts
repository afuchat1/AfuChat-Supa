import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiChatRouter from "./ai-chat";
import accountPurgeRouter from "./account-purge";
import chatsRouter from "./chats";
import supportRouter from "./support";
import adminRouter from "./admin";
import videosRouter from "./videos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiChatRouter);
router.use(accountPurgeRouter);
router.use(chatsRouter);
router.use(supportRouter);
router.use(adminRouter);
router.use(videosRouter);

export default router;
