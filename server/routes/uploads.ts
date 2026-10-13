import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { HttpError } from '../http.js';
import { requireAuth, type AuthEnv } from '../auth.js';

export const uploads = new Hono<AuthEnv>();
// Scoped to this router's own paths: mounted at '/', a bare '*' would leak onto every other route.
for (const path of ['/uploads', '/uploads/*']) uploads.use(path, requireAuth);

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies; the app downsizes photos first.
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

uploads.post('/uploads', async (c) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new HttpError(501, 'Photo upload is not configured on this server. Paste an image URL instead.', 'uploads_disabled');
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Attach an image as "file"', 'validation');
  const ext = EXT[file.type];
  if (!ext) throw new HttpError(400, 'Only JPEG, PNG or WebP images are allowed', 'validation');
  if (file.size > MAX_BYTES) throw new HttpError(400, 'Image is larger than 4 MB', 'validation');
  const blob = await put(`khondo/${c.get('agent').id}/${randomUUID()}.${ext}`, file, { access: 'public', contentType: file.type });
  return c.json({ url: blob.url }, 201);
});
