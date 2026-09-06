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

  const result = await uploadToCloudinary(buffer, safeName, mimeType);
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
