import { z, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 501 | 502,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue.path.join('.');
    throw new HttpError(400, path ? `${path}: ${issue.message}` : issue.message, 'validation');
  }
  return r.data;
}

export async function body(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body', 'validation');
  }
}

export const uuid = z.string().uuid();
export const emptyToNull = <T extends ZodType>(s: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), s.nullable());
