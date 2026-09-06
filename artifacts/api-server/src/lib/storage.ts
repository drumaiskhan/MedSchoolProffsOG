import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger";
import { getSetting } from "./settings";

// Folders whose files are typically large (book PDFs, resource files) go to
// Cloudinary; everything else defaults to Supabase Storage. Either backend
// can still take anything — this is just the default routing — and the
// SIZE_OVERRIDE_BYTES check below sends anything over that size to
// Cloudinary regardless of folder, as a safety net for a large file coming
// in through a folder not on this list (e.g. an MCQ question image someone
// pastes in at unusually high resolution).
const LARGE_FILE_FOLDERS = new Set(["books", "resources"]);
const SIZE_OVERRIDE_BYTES = 5 * 1024 * 1024; // 5MB

async function resolveSupabaseConfig(): Promise<{ url: string; key: string; bucket: string } | null> {
  const dbUrl = await getSetting("SUPABASE_URL", null);
  const dbKey = await getSetting("SUPABASE_SERVICE_ROLE_KEY", null);
  if (dbUrl && dbKey) return { url: dbUrl, key: dbKey, bucket: (await getSetting("SUPABASE_STORAGE_BUCKET", null)) || "medschool-uploads" };
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) return { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY, bucket: SUPABASE_STORAGE_BUCKET || "medschool-uploads" };
  return null;
}

async function resolveCloudinaryConfig(): Promise<{ cloudName: string; apiKey: string; apiSecret: string } | null> {
  const dbCloudName = await getSetting("CLOUDINARY_CLOUD_NAME", null);
  const dbApiKey = await getSetting("CLOUDINARY_API_KEY", null);
  const dbApiSecret = await getSetting("CLOUDINARY_API_SECRET", null);
  if (dbCloudName && dbApiKey && dbApiSecret) return { cloudName: dbCloudName, apiKey: dbApiKey, apiSecret: dbApiSecret };
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY, apiSecret: CLOUDINARY_API_SECRET };
  return null;
}

// resolveFileUrl() below is called synchronously in many places (list
// serializers, .map() callbacks) so it can't itself await the DB-backed
// settings. This small self-refreshing cache bridges the gap: populated by
// uploadFile() on every upload, and lazily kicks off a background refresh
// (never blocking the current request) whenever it's read stale/empty — so
// within a request or two of an admin saving these in Settings, URL
// resolution picks them up without needing an upload to happen first.
// process.env is used as the synchronous fallback in the meantime.
let cachedSupabaseUrl: string | null = process.env.SUPABASE_URL || null;
let cachedCloudinaryCloudName: string | null = process.env.CLOUDINARY_CLOUD_NAME || null;
let lastConfigRefresh = 0;
function refreshConfigCacheIfStale(): void {
  if (Date.now() - lastConfigRefresh <= 15_000) return;
  lastConfigRefresh = Date.now();
  void getSetting("SUPABASE_URL", null).then((url) => { if (url) cachedSupabaseUrl = url; }).catch(() => {});
  void getSetting("CLOUDINARY_CLOUD_NAME", null).then((name) => { if (name) cachedCloudinaryCloudName = name; }).catch(() => {});
}

async function uploadToSupabase(buffer: Buffer, safeName: string, mimeType: string): Promise<{ path: string } | { error: string }> {
  const config = await resolveSupabaseConfig();
  if (!config) return { error: "Supabase Storage is not configured (missing URL or service role key)." };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(config.url, config.key);
    const { error } = await supabase.storage.from(config.bucket).upload(safeName, buffer, { contentType: mimeType, upsert: false });
    if (error) throw error;
    return { path: `supabase:${config.bucket}/${safeName}` };
  } catch (err) {
    logger.error({ err }, "Supabase upload failed");
    return { error: `Supabase: ${err instanceof Error ? err.message : "upload failed"}` };
  }
}

async function uploadToCloudinary(buffer: Buffer, safeName: string): Promise<{ path: string } | { error: string }> {
  const config = await resolveCloudinaryConfig();
  if (!config) return { error: "Cloudinary is not configured (missing cloud name, API key, or API secret)." };
  try {
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret });
    const publicId = safeName.replace(/\.[^./]+$/, ""); // Cloudinary tracks the extension itself via format
    const result = await new Promise<{ public_id: string; resource_type: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: "auto" }, (err, res) => {
        if (err || !res) { reject(err ?? new Error("Cloudinary upload returned no result")); return; }
        resolve({ public_id: res.public_id, resource_type: res.resource_type });
      });
      stream.end(buffer);
    });
    return { path: `cloudinary:${result.resource_type}/${result.public_id}` };
  } catch (err) {
    logger.error({ err }, "Cloudinary upload failed");
    return { error: `Cloudinary: ${err instanceof Error ? err.message : "upload failed"}` };
  }
}

/**
 * Uploads a file buffer and returns a storage path that can be saved to the
 * DB (proofPath / storagePath / profilePicturePath / imagePath columns) and
 * later resolved back to a downloadable URL via resolveFileUrl().
 *
 * Two real backends, both configurable from Admin -> Platform settings ->
 * Storage (env vars still work as a fallback): Supabase Storage for most
 * uploads, Cloudinary for large files (books/resources by folder, or
 * anything over ~5MB regardless of folder). There is deliberately no local-
 * disk fallback — this app's compute (Render/Railway/Netlify functions) all
 * wipe local disk on redeploy or restart, which is exactly how a previously
 * "successfully" uploaded book disappeared. If neither backend is
 * configured, or the appropriate one fails, this throws instead of quietly
 * writing somewhere that won't survive the next deploy — and includes the
 * real reason from each backend it tried, instead of a generic "both
 * failed" that hides whether it was a bad key, a missing bucket, or
 * something else.
 */
export async function uploadFile(buffer: Buffer, originalName: string, mimeType: string, folder = "misc"): Promise<string> {
  const ext = path.extname(originalName) || "";
  const safeName = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const preferCloudinary = LARGE_FILE_FOLDERS.has(folder) || buffer.byteLength > SIZE_OVERRIDE_BYTES;

  const primary = preferCloudinary ? uploadToCloudinary : uploadToSupabase;
  const fallback = preferCloudinary ? uploadToSupabase : uploadToCloudinary;

  const primaryResult = await primary(buffer, safeName, mimeType);
  if ("path" in primaryResult) return primaryResult.path;

  const fallbackResult = await fallback(buffer, safeName, mimeType);
  if ("path" in fallbackResult) return fallbackResult.path;

  throw new Error(
    `Couldn't save the uploaded file — both storage backends failed. ${primaryResult.error} ${fallbackResult.error}`,
  );
}

/**
 * Real connectivity check for Admin -> Platform settings -> Storage's "Test
 * connection" button — unlike the presence-only SUPABASE_CONFIGURED /
 * CLOUDINARY_CONFIGURED flags returned by GET /admin/settings (which only
 * check that the fields are non-empty, not that they actually work), this
 * makes a real, cheap API call to each provider and reports the real
 * failure reason if one is misconfigured. Deliberately avoids
 * upload+delete (which would leave test artifacts behind on partial
 * failure, e.g. an upload that succeeds but a delete without permission) in
 * favor of read-only calls that still require valid, working credentials.
 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; error?: string; bucket?: string }> {
  const config = await resolveSupabaseConfig();
  if (!config) return { ok: false, error: "Not configured — set a Supabase URL and service role key first." };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(config.url, config.key);
    const { data, error } = await supabase.storage.getBucket(config.bucket);
    if (error) throw error;
    if (!data) return { ok: false, error: `Connected, but bucket "${config.bucket}" doesn't exist. Create it in Supabase Storage first and set it to public.` };
    if (!data.public) return { ok: false, error: `Bucket "${config.bucket}" exists but isn't public — uploaded files won't be viewable. Set it to public in Supabase Storage.` };
    return { ok: true, bucket: config.bucket };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Supabase." };
  }
}

export async function testCloudinaryConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = await resolveCloudinaryConfig();
  if (!config) return { ok: false, error: "Not configured — set a cloud name, API key, and API secret first." };
  try {
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret });
    await cloudinary.api.ping();
    return { ok: true };
  } catch (err) {
    const message = err && typeof err === "object" && "error" in err
      ? String((err as { error?: { message?: string } }).error?.message ?? "Could not reach Cloudinary.")
      : (err instanceof Error ? err.message : "Could not reach Cloudinary.");
    return { ok: false, error: message };
  }
}

/** Resolves a stored path (from uploadFile) into a URL the frontend can fetch. */
export function resolveFileUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  refreshConfigCacheIfStale();
  if (storagePath.startsWith("supabase:")) {
    const rest = storagePath.slice("supabase:".length);
    const [bucket, ...pathParts] = rest.split("/");
    if (!cachedSupabaseUrl) return null;
    return `${cachedSupabaseUrl}/storage/v1/object/public/${bucket}/${pathParts.join("/")}`;
  }
  if (storagePath.startsWith("cloudinary:")) {
    const rest = storagePath.slice("cloudinary:".length);
    const slash = rest.indexOf("/");
    const resourceType = rest.slice(0, slash) || "auto";
    const publicId = rest.slice(slash + 1);
    if (!cachedCloudinaryCloudName) return null;
    return `https://res.cloudinary.com/${cachedCloudinaryCloudName}/${resourceType}/upload/${publicId}`;
  }
  if (storagePath.startsWith("local:")) {
    // Legacy rows from before local-disk storage was removed. These no
    // longer resolve to anything (the file is gone) — surfaced as null
    // rather than a broken /api/uploads/* URL that 404s, so the frontend's
    // existing "no image" fallback UI kicks in instead of a dead link.
    return null;
  }
  return storagePath;
}
