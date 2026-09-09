import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger";
import { getSetting } from "./settings";

// Supabase is used for this app's Postgres database only (DATABASE_URL) —
// Supabase Storage is NOT used for new uploads. Cloudinary is the one and
// only upload backend now. This removed the @supabase/supabase-js dependency
// from the server entirely (smaller install/bundle, one less client to spin
// up per request) and the "Invalid Compact JWS" error that came from a
// malformed/legacy Supabase service-role key, since nothing ever builds a
// Supabase Storage client anymore.
//
// The only remaining trace of Supabase here is in resolveFileUrl() below,
// which can still turn an *old* "supabase:..." storage path (saved back when
// Supabase Storage was in use) into a working public URL — reading a public
// bucket's object needs no key at all, just the project URL — so files
// uploaded before this change don't suddenly break. New uploads never
// produce a "supabase:" path.

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
// within a request or two of an admin saving Cloudinary settings, URL
// resolution picks them up without needing an upload to happen first.
// process.env is used as the synchronous fallback in the meantime.
//
// cachedSupabaseUrl exists only to resolve pre-existing "supabase:" storage
// paths from before Storage moved to Cloudinary-only (see the comment atop
// this file) — it is read from SUPABASE_URL if that env var happens to still
// be set (e.g. left over from before this change), never from admin
// settings, since Supabase Storage is no longer admin-configurable.
let cachedSupabaseUrl: string | null = process.env.SUPABASE_URL || null;
let cachedCloudinaryCloudName: string | null = process.env.CLOUDINARY_CLOUD_NAME || null;
let lastConfigRefresh = 0;
function refreshConfigCacheIfStale(): void {
  if (Date.now() - lastConfigRefresh <= 15_000) return;
  lastConfigRefresh = Date.now();
  void getSetting("CLOUDINARY_CLOUD_NAME", null).then((name) => { if (name) cachedCloudinaryCloudName = name; }).catch(() => {});
}

/**
 * Root-cause fix (round 3, items 2/6/8): the cache above used to be
 * populated ONLY by the fire-and-forget refresh in refreshConfigCacheIfStale,
 * which is async but resolveFileUrl() is synchronous — so on a cold boot
 * where CLOUDINARY_CLOUD_NAME lives only in the DB (not an env var, i.e. the
 * "Admin -> Settings" configuration path this whole feature exists for),
 * cachedCloudinaryCloudName stayed null for the entire first burst of
 * requests (every list/serializer call that resolves a URL before that first
 * background promise resolves), which is exactly the "Uploaded, but the file
 * isn't loading back" warning AdminImageUpload was surfacing right after a
 * save/restart. Two fixes:
 *
 * 1. warmStorageConfigCache() — awaited once at server boot (see index.ts),
 *    before the app starts accepting requests, so the cache is never empty
 *    for a DB-configured cloud name in the first place.
 * 2. setCachedCloudinaryCloudName() — called synchronously from the
 *    settings route the moment an admin saves a new CLOUDINARY_CLOUD_NAME,
 *    so a save takes effect immediately instead of waiting for the next
 *    15-second refresh window.
 */
export async function warmStorageConfigCache(): Promise<void> {
  try {
    const name = await getSetting("CLOUDINARY_CLOUD_NAME", null);
    if (name) cachedCloudinaryCloudName = name;
    lastConfigRefresh = Date.now();
  } catch (err) {
    logger.error({ err }, "[storage] Could not warm Cloudinary config cache at boot — falling back to env var / lazy refresh.");
  }
}

export function setCachedCloudinaryCloudName(name: string | null): void {
  if (name) cachedCloudinaryCloudName = name;
}

async function uploadToCloudinary(buffer: Buffer, safeName: string): Promise<{ path: string } | { error: string }> {
  const config = await resolveCloudinaryConfig();
  if (!config) return { error: "Cloudinary is not configured (missing cloud name, API key, or API secret)." };
  try {
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret });
    // The extension is kept as part of the public_id (not stripped) so it
    // stays human-readable in the Cloudinary dashboard. IMPORTANT: this does
    // NOT mean the delivery URL is just "{publicId}" — for resource_type
    // "image"/"video" (which is what "auto" resolves PDFs and images to),
    // Cloudinary's actual delivery URL is ALWAYS "{publicId}.{format}",
    // appended by Cloudinary itself regardless of whether publicId already
    // *looks* like it has an extension. A public_id of "books/171-abc.pdf"
    // uploaded as an image resource is really served from
    // ".../upload/books/171-abc.pdf.pdf" — the previous fix here assumed the
    // existing extension was enough and only fixed the (rarer) case of a
    // public_id with NO extension at all, which is why PDFs kept 404ing.
    // Capturing `format` from the actual upload response and re-appending it
    // in resolveFileUrl() (below) is the only reliable way to build a link
    // that matches what Cloudinary will actually serve — see resolveFileUrl.
    const publicId = safeName;
    const result = await new Promise<{ public_id: string; resource_type: string; format?: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: "auto" }, (err, res) => {
        if (err || !res) { reject(err ?? new Error("Cloudinary upload returned no result")); return; }
        resolve({ public_id: res.public_id, resource_type: res.resource_type, format: res.format });
      });
      stream.end(buffer);
    });
    // Encoded as "cloudinary:{resourceType}/{publicId}|{format}" — the "|"
    // suffix is never a valid Cloudinary public_id character, so it's safe
    // to split on. Format is omitted (no "|") when Cloudinary didn't return
    // one (shouldn't normally happen, but resolveFileUrl handles it either
    // way by falling back to the old no-format behavior for that path).
    const encoded = result.format ? `${result.public_id}|${result.format}` : result.public_id;
    return { path: `cloudinary:${result.resource_type}/${encoded}` };
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
 * Cloudinary is the only upload backend (configurable from Admin -> Platform
 * settings -> Storage; env vars still work as a fallback). Supabase is used
 * for this app's Postgres database only — see the comment atop this file.
 * There is deliberately no local-disk fallback — this app's compute
 * (Render/Railway/Netlify functions) all wipe local disk on redeploy or
 * restart, which is exactly how a previously "successfully" uploaded book
 * disappeared. If Cloudinary isn't configured, or the upload fails, this
 * throws instead of quietly writing somewhere that won't survive the next
 * deploy — and includes the real reason (bad key, wrong cloud name, etc.)
 * rather than a generic failure.
 */
export async function uploadFile(buffer: Buffer, originalName: string, mimeType: string, folder = "misc"): Promise<string> {
  const ext = path.extname(originalName) || "";
  const safeName = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

  const result = await uploadToCloudinary(buffer, safeName);
  if ("path" in result) return result.path;

  throw new Error(`Couldn't save the uploaded file. ${result.error}`);
}

/**
 * Real connectivity check for Admin -> Platform settings -> Storage's "Test
 * connection" button — unlike the presence-only CLOUDINARY_CONFIGURED flag
 * returned by GET /admin/settings (which only checks that the fields are
 * non-empty, not that they actually work), this makes a real, cheap API call
 * and reports the real failure reason if it's misconfigured (bad key, wrong
 * cloud name, etc.).
 */
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

/**
 * Backward-compat repair for rows saved before format was captured
 * explicitly (see the comment in uploadToCloudinary above). Two distinct
 * legacy shapes exist, both broken the same way (Cloudinary can't serve
 * the URL resolveFileUrl builds from them):
 *   1. "cloudinary:{type}/{publicId}" with NO extension at all.
 *   2. "cloudinary:{type}/{publicId}" where publicId already *looks* like
 *      it has an extension (e.g. "books/171-abc.pdf") — this one is the
 *      trickier bug: for image/video resources Cloudinary still requires
 *      the format appended AGAIN ("...171-abc.pdf.pdf"), so an existing
 *      extension does NOT mean the row is fine. An earlier version of this
 *      function assumed it did and skipped these, which is why some
 *      previously-uploaded books kept 404ing even after a "fix".
 * Both are repaired the same way: look the asset up by its stored
 * public_id via Cloudinary's Admin API, read back the real `format`, and
 * return a corrected path in the new "{publicId}|{format}" encoding that
 * resolveFileUrl understands. Already-correct new-style paths (containing
 * "|") are left alone. Returns null if there's nothing to fix, Cloudinary
 * isn't configured, or the asset can't be found (e.g. already deleted).
 */
export async function reresolveLegacyCloudinaryPath(storagePath: string): Promise<string | null> {
  if (!storagePath.startsWith("cloudinary:")) return null;
  const rest = storagePath.slice("cloudinary:".length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const resourceType = rest.slice(0, slash) || "auto";
  const publicId = rest.slice(slash + 1);
  // Already in the new "{publicId}|{format}" encoding — nothing to do.
  if (publicId.includes("|")) return null;

  const config = await resolveCloudinaryConfig();
  if (!config) return null;
  try {
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret });
    const lookupResourceType = resourceType === "auto" ? "image" : resourceType;
    const resource = await cloudinary.api.resource(publicId, { resource_type: lookupResourceType });
    const format = resource?.format;
    if (!format) return null;
    return `cloudinary:${resourceType === "auto" ? lookupResourceType : resourceType}/${publicId}|${format}`;
  } catch (err) {
    logger.error({ err, publicId }, "Could not re-resolve legacy Cloudinary path");
    return null;
  }
}

/**
 * Resolves a stored path (from uploadFile) into a URL the frontend can
 * fetch. `opts.transform` (item 10 — perf) injects Cloudinary delivery
 * transformation params (e.g. "w_400,q_auto,f_auto") right after
 * `/upload/` for *image* resources only — raw/video/auto resources (books,
 * PDFs) are left untouched since transformations don't apply the same way
 * and could interfere with exact-public_id delivery. Callers that don't
 * pass `transform` get the exact same URL as before (no behavior change).
 */
export function resolveFileUrl(storagePath: string | null | undefined, opts?: { transform?: string }): string | null {
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
    const idAndFormat = rest.slice(slash + 1);
    // New-style paths carry the real Cloudinary format after a "|" (see
    // uploadToCloudinary). Old rows saved before this fix have no "|" —
    // resolved as before (works for raw resources like docx/zip; still
    // broken for pre-existing image/video rows like PDFs and thumbnails
    // until re-uploaded, or for books, re-resolved via the "Backfill links"
    // admin action which now handles this case too — see
    // reresolveLegacyCloudinaryPath below).
    const pipeIdx = idAndFormat.indexOf("|");
    const publicId = pipeIdx < 0 ? idAndFormat : idAndFormat.slice(0, pipeIdx);
    const format = pipeIdx < 0 ? null : idAndFormat.slice(pipeIdx + 1);
    if (!cachedCloudinaryCloudName) return null;
    const transformSegment = opts?.transform && resourceType === "image" ? `${opts.transform}/` : "";
    // The part that actually fixes the "PDF/thumbnail 404s" bug: Cloudinary
    // always serves image/video resources at "{publicId}.{format}", even
    // when publicId already visually ends in an extension.
    const needsFormatSuffix = format && (resourceType === "image" || resourceType === "video");
    const deliveredId = needsFormatSuffix ? `${publicId}.${format}` : publicId;
    return `https://res.cloudinary.com/${cachedCloudinaryCloudName}/${resourceType}/upload/${transformSegment}${deliveredId}`;
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

/** Default "don't ship full-resolution originals" transform for thumbnails
 * and cover images (item 10) — resizes to a sane max width, auto-picks
 * format (WebP/AVIF where supported) and quality. Deliberately conservative
 * (no crop) since these get applied to arbitrary admin-uploaded images of
 * unknown aspect ratio. */
export const THUMBNAIL_TRANSFORM = "w_600,q_auto,f_auto";

/**
 * Deletes the underlying Cloudinary asset for a storage path (item 8's
 * follow-up: "when I delete a book, delete it on Cloudinary too"). Safe to
 * call on non-Cloudinary paths (supabase:/local:/plain URLs) — those are
 * silently skipped, since there's nothing this function is responsible for
 * cleaning up there. Never throws: a failed Cloudinary delete (asset
 * already gone, bad credentials, network blip) is logged and swallowed so
 * it can't block the DB row from being deleted — the row going away is the
 * part the user is actually waiting on.
 */
export async function deleteFromCloudinary(storagePath: string | null | undefined): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!storagePath || !storagePath.startsWith("cloudinary:")) return { ok: true, skipped: true };
  const rest = storagePath.slice("cloudinary:".length);
  const slash = rest.indexOf("/");
  if (slash < 0) return { ok: true, skipped: true };
  const resourceType = rest.slice(0, slash) || "auto";
  const idAndFormat = rest.slice(slash + 1);
  const pipeIdx = idAndFormat.indexOf("|");
  const publicId = pipeIdx < 0 ? idAndFormat : idAndFormat.slice(0, pipeIdx);

  const config = await resolveCloudinaryConfig();
  if (!config) return { ok: false, error: "Cloudinary is not configured — could not delete the remote file (the local record was still removed)." };
  try {
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret });
    // resource_type "auto" isn't valid for the destroy API (only for
    // upload) — Cloudinary's own uploader.upload_stream call above always
    // stores the *real* resolved resource_type (image/video/raw) once the
    // upload completes, so "auto" here would only happen for a pre-fix
    // legacy row; fall back to "image" like reresolveLegacyCloudinaryPath
    // does for the same reason.
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType === "auto" ? "image" : resourceType, invalidate: true });
    return { ok: true };
  } catch (err) {
    logger.error({ err, publicId }, "Could not delete Cloudinary asset");
    return { ok: false, error: err instanceof Error ? err.message : "Cloudinary delete failed" };
  }
}
