import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import multer from "multer";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachUser } from "./middlewares/auth";
import { dbErrorMessage } from "./lib/dbErrors";

const app: Express = express();

// Express auto-generates an ETag for every JSON response by default. For
// dynamic, per-user endpoints like /api/auth/me and /api/site-content, that
// means the browser can send `If-None-Match` on a later request and get back
// a bodyless 304 — which crashes any frontend code that assumes the fetch
// always resolves with real data (e.g. `user.name.split(...)`) rather than
// treating 304 as "no new data available" and reusing the cached response
// itself. Since none of these API responses are meant to be
// browser-cacheable in the first place, disable etag generation entirely so
// every request gets a fresh 200 with a real body.
app.set("etag", false);
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// APP_URL can be a single origin or a comma-separated list (useful when the
// frontend is deployed separately, e.g. a Vercel preview + production URL).
// Falling back to `true` reflects the request origin, which the `cors`
// package treats as credential-safe — fine for local dev, but set APP_URL
// explicitly in production.
const allowedOrigins = process.env.APP_URL?.split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true, credentials: true }));
// Default body-parser limit is 100kb — plenty for a single MCQ/flashcard,
// but a bulk "Add multiple" submission (e.g. 20+ flashcards or MCQs pasted
// at once) can exceed that easily, and the request gets rejected with a
// "PayloadTooLargeError" before it ever reaches the route handler. Raised
// generously so real bulk-import/bulk-create payloads (including base64
// file uploads sent as JSON) go through.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cookieParser());
app.use(attachUser);

app.use("/api", router);

// Anything that reaches here is a 404 under /api — respond JSON, not HTML,
// so the frontend's `request()` helper (which only parses JSON bodies) can
// surface a real message instead of falling back to "Request failed (404)".
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler — must be registered last, and must take 4 args for
// Express to recognize it as an error handler. Without this, an error
// thrown/rejected anywhere in a route (Express 5 auto-forwards async
// rejections to `next(err)`) fell through to Express's default handler,
// which renders an HTML stack trace. The frontend only ever parses JSON, so
// every one of those failures surfaced to admins as an opaque
// "Request failed (500)" with no real explanation — e.g. the Books upload
// error in the admin UI. This turns every unhandled error into a JSON body
// with a real (if generic) message, and logs the underlying cause server-side.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.originalUrl, method: req.method }, "Unhandled error");
  if (res.headersSent) return;
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too large." : err.message });
    return;
  }
  // body-parser throws a plain Error with a `type`/`status` for malformed or
  // oversized request bodies (e.g. "entity.too.large") — surface a real
  // message and status instead of a generic 500, so a bulk create/import
  // that's still too big shows "request too large", not an opaque failure.
  if (err && typeof err === "object" && "type" in err && typeof (err as { status?: unknown }).status === "number") {
    const bodyErr = err as { type?: string; status: number; message?: string };
    res.status(bodyErr.status).json({ error: bodyErr.type === "entity.too.large" ? "That request is too large — try submitting fewer items at once." : (bodyErr.message || "Invalid request body.") });
    return;
  }
  const message = dbErrorMessage(err, "Something went wrong. Please try again.");
  res.status(500).json({ error: message });
});

export default app;
