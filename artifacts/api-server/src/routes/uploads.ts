import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { uploadFile, resolveFileUrl, localUploadDir } from "../lib/storage";
import { checkRateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only PNG, JPEG, WEBP, or PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});

const uploadFavicon = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB — favicons are small
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only PNG, ICO, SVG, or WEBP files are allowed for the favicon"));
      return;
    }
    cb(null, true);
  },
});

router.post("/uploads/payment-proof", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const storagePath = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, "payment-proofs");
  res.status(201).json({ storagePath, url: resolveFileUrl(storagePath), mimeType: req.file.mimetype });
});

// Unauthenticated variant for Register() — a student filling out the signup
// form has no account (and therefore no session cookie) yet, so the
// authenticated route above 401s for them. Same validation/size limit as
// the authenticated route, but rate-limited by IP since this is now an
// open-to-the-internet upload endpoint.
router.post("/uploads/payment-proof-signup", upload.single("file"), async (req, res): Promise<void> => {
  const ip = req.ip || "unknown";
  const limit = checkRateLimit(`payment-proof-signup:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many uploads from this connection. Please try again in a few minutes." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const storagePath = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, "payment-proofs");
  res.status(201).json({ storagePath, url: resolveFileUrl(storagePath), mimeType: req.file.mimetype });
});

router.post("/uploads/profile-picture", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const storagePath = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, "profile-pictures");
  res.status(201).json({ storagePath, url: resolveFileUrl(storagePath) });
});

router.post("/uploads/resource", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const storagePath = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, "resources");
  res.status(201).json({ storagePath, url: resolveFileUrl(storagePath), sizeBytes: req.file.size });
});

// Books library — admin-only PDF (and optional cover image) uploads.
router.post("/uploads/book", requireAdmin, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const storagePath = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, "books");
  res.status(201).json({ storagePath, url: resolveFileUrl(storagePath), sizeBytes: req.file.size });
});

// Website favicon — shown in browser tabs, so unlike the uploads above it
// must be readable by anyone (no auth cookie is sent for a plain
// <link rel="icon"> request, especially cross-origin on split deployments).
// Uploading a new one stays admin-only.
router.post("/uploads/favicon", requireAdmin, uploadFavicon.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const storagePath = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, "favicon");
  res.status(201).json({ storagePath, url: resolveFileUrl(storagePath), mimeType: req.file.mimetype });
});

// Serves locally-stored uploads (only reached when Supabase Storage isn't
// configured). Payment proofs and profile pictures are personal/financial
// documents, so those folders must never be reachable by an anonymous or
// unrelated caller — requireAuth is the floor. We don't further restrict to
// owner-or-admin here because folder/filename alone doesn't identify the
// owning user without an extra DB lookup per request; if that's needed,
// join storagePath back to the owning payment/user record before serving.
// The favicon folder is the one exception: it holds nothing sensitive and
// browsers request it without credentials, so it's served publicly.
router.get("/uploads/:folder/:filename", (req, res, next): void => {
  const folder = path.basename(req.params.folder);
  if (folder === "favicon") { next(); return; }
  requireAuth(req, res, next);
}, (req, res): void => {
  const folder = path.basename(req.params.folder);
  const filename = path.basename(req.params.filename);
  res.sendFile(path.join(localUploadDir(), folder, filename), (err) => {
    if (err) res.status(404).json({ error: "File not found" });
  });
});

export default router;
