import { Router, type IRouter } from "express";
import healthRouter from "./health";
import medschoolRouter from "./medschool";
import authRouter from "./auth";
import academicStructureRouter from "./academic-structure";
import settingsRouter from "./settings";
import auditRouter from "./audit";
import uploadsRouter from "./uploads";
import pastPapersRouter from "./past-papers";
import studentToolsRouter from "./student-tools";
import analyticsRouter from "./analytics";
import mcqImportRouter from "./mcq-import";
import siteContentRouter from "./site-content";
import examsRouter from "./exams";
import explanationsRouter from "./explanations";
import booksRouter from "./books";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(academicStructureRouter);
router.use(settingsRouter);
router.use(auditRouter);
router.use(uploadsRouter);
router.use(pastPapersRouter);
router.use(studentToolsRouter);
router.use(analyticsRouter);
router.use(mcqImportRouter);
router.use(siteContentRouter);
router.use(examsRouter);
router.use(explanationsRouter);
router.use(booksRouter);
router.use(medschoolRouter);

export default router;
