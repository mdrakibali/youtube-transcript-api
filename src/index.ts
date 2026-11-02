import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import { mapErrorToAppError } from './lib/errors.js';
import { parseVideoId } from './lib/parse-video-id.js';
import { getVideoData } from './services/youtube.js';

const app = new Hono();

/**
 * Constant-time comparison for API keys using SHA-256 digests.
 */
function isKeyValid(providedKey: string | undefined, expectedKey: string): boolean {
  if (!providedKey) return false;
  const hashProvided = crypto.createHash('sha256').update(providedKey).digest();
  const hashExpected = crypto.createHash('sha256').update(expectedKey).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

// Authentication middleware (skipped only for /health)
app.use('*', async (c, next) => {
  if (c.req.path === '/health') {
    return next();
  }

  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    return c.json(
      {
        error: 'INTERNAL',
        message: 'Server authentication is not configured (API_KEY missing).'
      },
      500
    );
  }

  const providedKey = c.req.header('x-api-key');
  if (!isKeyValid(providedKey, expectedKey)) {
    return c.json(
      {
        error: 'UNAUTHORIZED',
        message: 'Unauthorized: Missing or invalid x-api-key header.'
      },
      401
    );
  }

  return next();
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Video query validation schema
const querySchema = z.object({
  url: z.string().min(1, 'Query parameter "url" (or video ID) is required.'),
  lang: z.string().optional(),
  format: z.enum(['json', 'text-timestamps']).optional()
});

// Video metadata + transcript endpoint
app.get('/api/video', async (c) => {
  const rawUrl = c.req.query('url') || c.req.query('id');
  const rawLang = c.req.query('lang');
  const rawFormat = c.req.query('format');

  const validation = querySchema.safeParse({
    url: rawUrl,
    lang: rawLang,
    format: rawFormat
  });

  if (!validation.success) {
    const issue = validation.error.issues[0]?.message || 'Invalid query parameters.';
    return c.json(
      {
        error: 'INVALID_URL',
        message: issue
      },
      400
    );
  }

  const { url, lang, format } = validation.data;
  const videoId = parseVideoId(url);

  const data = await getVideoData(videoId, lang, format);
  return c.json(data);
});

// Global error handler
app.onError((err, c) => {
  const appErr = mapErrorToAppError(err);
  return c.json(
    {
      error: appErr.code,
      message: appErr.message
    },
    appErr.statusCode as any
  );
});

// 404 handler for unknown routes
app.notFound((c) => {
  return c.json(
    {
      error: 'NOT_FOUND',
      message: `Route not found: ${c.req.method} ${c.req.path}`
    },
    404
  );
});

const port = parseInt(process.env.PORT || '8080', 10);

// Only start the server directly if not running in a test suite
if (process.env.NODE_ENV !== 'test') {
  serve(
    {
      fetch: app.fetch,
      port
    },
    (info) => {
      console.log(`Server is running on port ${info.port}`);
    }
  );
}

export default app;
