import './env.js';
import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => console.log(`Khondo API listening on http://localhost:${port}/api`));
