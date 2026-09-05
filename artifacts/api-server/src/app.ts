import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import multer from "multer";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachUser } from "./middlewares/auth";

const app: Express = express();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
  const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
  res.status(500).json({ error: message });
});

export default app;
