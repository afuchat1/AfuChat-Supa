import { Router, type IRouter } from "express";
import healthRouter from "./health";
import statusRouter from "./status";
import accountPurgeRouter from "./account-purge";
import authRouter from "./auth";
import chatsRouter from "./chats";
import supportRouter from "./support";
import adminRouter from "./admin";
import videosRouter from "./videos";
import uploadsRouter from "./uploads";
import paymentsRouter from "./payments";
import dataExportRouter from "./data-export";
import subscribeRouter from "./subscribe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(statusRouter);
router.use(accountPurgeRouter);
router.use(authRouter);
router.use(chatsRouter);
router.use(supportRouter);
router.use(adminRouter);
router.use(videosRouter);
router.use(uploadsRouter);
router.use(paymentsRouter);
router.use(dataExportRouter);
router.use(subscribeRouter);

export default router;
