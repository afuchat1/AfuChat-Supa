import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiChatRouter from "./ai-chat";
import pesapalRouter from "./pesapal";
import accountPurgeRouter from "./account-purge";
import chatsRouter from "./chats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiChatRouter);
router.use(pesapalRouter);
router.use(accountPurgeRouter);
router.use(chatsRouter);

export default router;
