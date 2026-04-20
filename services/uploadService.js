/**
 * S3 presigned-POST upload helper for the driver app.
 *
 * The driver uploads ID card / IBAN / KBIS BEFORE the account exists,
 * so we talk to the unauthenticated presign endpoint
 * /api/v1/delivery/register/doc-presign/. The flow:
 *
 *   1. Ask the backend for a presigned POST (url + fields + public_url)
 *   2. POST the file directly to S3 as multipart/form-data — fields
 *      first, then "file" last (S3 strictly requires that order for
 *      the signature to verify).
 *   3. Return the public_url so the caller can ship it in /register/.
 *
 * All errors are surfaced as Error with a short, non-leaky message —
 * the caller (LoginScreen step 3) shows it in the validation area.
 */
import api from './api';

// Small helper — guess content-type from filename. React Native's
// expo-image-picker doesn't always populate `mimeType`, so we fall
// back to the extension.
const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function guessContentType(uri, fallback) {
  if (fallback) return fallback;
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(uri || '');
  const ext = m ? m[1].toLowerCase() : '';
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

function guessFilename(uri, slot) {
  const m = /([^/]+)$/.exec(uri || '');
  if (m && m[1]) return m[1].split('?')[0];
  return `${slot || 'doc'}.jpg`;
}

async function fetchSize(uri) {
  // expo-image-picker gives a file:// URI; RN's native fetch can HEAD
  // it but won't return Content-Length reliably. Easier: read the
  // response and use blob.size. Cheap for <10 MB images.
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return blob.size || 0;
  } catch {
    return 0;
  }
}

export const uploadService = {
  /**
   * Upload one driver-registration document to S3.
   *
   * @param {object}  opts
   * @param {string}  opts.uri          Local file URI (from expo-image-picker)
   * @param {string}  [opts.slot]       "id_front" | "id_back" | "iban" | "kbis"
   * @param {string}  [opts.contentType]
   * @param {string}  [opts.filename]
   * @returns {Promise<{ publicUrl: string, key: string }>}
   */
  async uploadDriverDoc({ uri, slot = 'doc', contentType, filename }) {
    if (!uri) throw new Error('No file to upload');

    const resolvedType = guessContentType(uri, contentType);
    const resolvedName = filename || guessFilename(uri, slot);
    const size = await fetchSize(uri);

    // 1. Ask backend for a presigned POST
    const { data } = await api.post('/api/v1/delivery/register/doc-presign/', {
      filename: resolvedName,
      content_type: resolvedType,
      size,
      slot,
    });

    if (!data || data.status === false || !data.data) {
      throw new Error(data?.message || 'Failed to authorize upload');
    }

    const { url, fields, public_url, key } = data.data;

    // 2. Build multipart: fields first, file last.
    const form = new FormData();
    Object.entries(fields || {}).forEach(([k, v]) => form.append(k, v));
    form.append('file', {
      uri,
      name: resolvedName,
      type: resolvedType,
    });

    // 3. Raw fetch to S3 — do NOT route through our axios api instance
    // (it would add the Authorization header S3 doesn't expect).
    const s3Resp = await fetch(url, { method: 'POST', body: form });
    if (!s3Resp.ok) {
      // S3 returns XML with <Error><Code>...; surface a short message.
      let detail = '';
      try {
        detail = (await s3Resp.text()).slice(0, 160);
      } catch {
        detail = '';
      }
      throw new Error(`S3 upload failed (${s3Resp.status}) ${detail}`);
    }

    return { publicUrl: public_url, key };
  },
};

export default uploadService;
