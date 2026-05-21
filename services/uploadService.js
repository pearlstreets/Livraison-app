import api from './api';

// Driver registration documents are uploaded straight to S3 through a
// presigned POST obtained from the backend. The presign endpoint is public
// (AllowAny) because it runs before the driver has an account.
export const uploadService = {
  async presignDriverDoc({ filename, contentType, size, slot }) {
    const { data } = await api.post('/api/v1/delivery/register/doc-presign/', {
      filename,
      content_type: contentType,
      size,
      slot,
    });
    return data?.data || data;
  },

  // Upload a local file to S3 with the presigned POST fields.
  async uploadToS3(presign, fileUri, contentType) {
    if (!presign || !presign.url) throw new Error('Invalid presign payload');
    const form = new FormData();
    Object.entries(presign.fields || {}).forEach(([k, v]) => form.append(k, v));
    form.append('file', {
      uri: fileUri,
      name: (presign.key || 'upload').split('/').pop(),
      type: contentType || 'application/octet-stream',
    });
    const res = await fetch(presign.url, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`S3 upload failed (${res.status})`);
    return presign.public_url;
  },

  // Presign + upload one registration document; resolves to its public URL.
  // `size` must be the real byte size — the presigned policy enforces it.
  async uploadDriverDoc({ fileUri, slot, size, contentType }) {
    const filename = (fileUri || '').split('/').pop() || String(slot);
    const type =
      contentType ||
      (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const presign = await uploadService.presignDriverDoc({
      filename,
      contentType: type,
      size,
      slot,
    });
    return uploadService.uploadToS3(presign, fileUri, type);
  },
};
