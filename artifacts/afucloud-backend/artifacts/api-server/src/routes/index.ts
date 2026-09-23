import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import imagesRouter from "./images";
import apiKeysRouter from "./apikeys";
import tokensRouter from "./tokens";
import analyticsRouter from "./analytics";
import webhooksRouter from "./webhooks";
import activityRouter from "./activity";
import storageRouter from "./storage";
import domainsRouter from "./domains";
import storageContainersRouter from "./storage-containers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(imagesRouter);
router.use(apiKeysRouter);
router.use(tokensRouter);
router.use(analyticsRouter);
router.use(webhooksRouter);
router.use(activityRouter);
router.use(storageRouter);
router.use(domainsRouter);
router.use(storageContainersRouter);

export default router;
