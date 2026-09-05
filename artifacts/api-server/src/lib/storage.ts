import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger";

const LOCAL_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

/**
 * Uploads a file buffer and returns a storage path that can be saved to the
 * DB (proofPath / storagePath / profilePicturePath columns) and later
 * resolved back to a downloadable URL via resolveFileUrl().
 *
 * When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are configured, files go to
 * Supabase Storage (bucket name from SUPABASE_STORAGE_BUCKET, default
 * "medschool-uploads"). Otherwise files are written to a local uploads/
 * directory — fine for development, but use object storage in production
 * since local disk doesn't survive redeploys on most hosts.
 */
export async function uploadFile(buffer: Buffer, originalName: string, mimeType: string, folder = "misc"): Promise<string> {
  const ext = path.extname(originalName) || "";
  const safeName = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const bucket = SUPABASE_STORAGE_BUCKET || "medschool-uploads";
      const { error } = await supabase.storage.from(bucket).upload(safeName, buffer, { contentType: mimeType, upsert: false });
      if (error) throw error;
      return `supabase:${bucket}/${safeName}`;
    } catch (err) {
      logger.error({ err }, "Supabase upload failed, falling back to local disk");
    }
  }

  try {
    const fullDir = path.join(LOCAL_UPLOAD_DIR, folder);
    fs.mkdirSync(fullDir, { recursive: true });
    const fullPath = path.join(LOCAL_UPLOAD_DIR, safeName);
    fs.writeFileSync(fullPath, buffer);
    return `local:${safeName}`;
  } catch (err) {
    // Most commonly EROFS/EACCES: the host's filesystem is read-only
    // outside a scratch dir (e.g. serverless platforms like Vercel only
    // allow writes under /tmp, and /tmp doesn't persist between requests
    // either). Local disk was never meant to survive redeploys anyway —
    // surface a clear, actionable message instead of a bare fs error, since
    // this used to bubble up to admins as an opaque "Request failed (500)".
    logger.error({ err, folder }, "Local disk upload failed");
    throw new Error(
      "Couldn't save the uploaded file. This server's local storage isn't writable — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase Storage) for persistent uploads in this environment.",
    );
  }
}

/** Resolves a stored path (from uploadFile) into a URL the frontend can fetch. */
export function resolveFileUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  if (storagePath.startsWith("supabase:")) {
    const rest = storagePath.slice("supabase:".length);
    const [bucket, ...pathParts] = rest.split("/");
    const { SUPABASE_URL } = process.env;
    if (!SUPABASE_URL) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${pathParts.join("/")}`;
  }
  if (storagePath.startsWith("local:")) {
    return `/api/uploads/${storagePath.slice("local:".length)}`;
  }
  return storagePath;
}

export function localUploadDir(): string {
  return LOCAL_UPLOAD_DIR;
}
