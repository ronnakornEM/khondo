// Vercel serverless entry. vercel.json rewrites every /api/* request here; Hono does the routing.
import { getRequestListener } from '@hono/node-server';
import { app } from '../server/app.js';

export default getRequestListener(app.fetch);
