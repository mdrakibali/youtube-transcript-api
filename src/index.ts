import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import crypto from 'node:crypto';
import { z } from 'zod';
import { mapErrorToAppError } from './lib/errors.js';
import { parseVideoId } from './lib/parse-video-id.js';
import { getVideoData, getInnertube } from './services/youtube.js';

// Automatically load local .env file if present
try {
  process.loadEnvFile?.();
} catch {
  // Ignored if .env file is missing (e.g. in production / Render)
}

const app = new Hono();

// HTTP Request Logger (visible in Render logs)
app.use('*', logger());

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

// Validation schema for new /api/v1/transcript endpoint
const transcriptQuerySchema = z.object({
  url: z.string().min(1, 'Query parameter "url" (or video ID) is required.'),
  lang: z.string().optional(),
  fullText: z.preprocess((val) => {
    if (typeof val === 'string') {
      return val.toLowerCase() === 'true' || val === '1';
    }
    return Boolean(val);
  }, z.boolean().optional())
});

// Legacy video query validation schema
const legacyQuerySchema = z.object({
  url: z.string().min(1, 'Query parameter "url" (or video ID) is required.'),
  lang: z.string().optional(),
  format: z.enum(['json', 'text-timestamps']).optional()
});

// Primary transcript endpoint: /api/v1/transcript
app.get('/api/v1/transcript', async (c) => {
  const rawUrl = c.req.query('url') || c.req.query('id');
  const rawLang = c.req.query('lang');
  const rawFullText = c.req.query('fullText') ?? c.req.query('full_text');

  const validation = transcriptQuerySchema.safeParse({
    url: rawUrl,
    lang: rawLang,
    fullText: rawFullText
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

  const { url, lang, fullText } = validation.data;
  const videoId = parseVideoId(url);

  const data = await getVideoData(videoId, lang, Boolean(fullText));
  return c.json(data);
});

// Backward-compatible endpoint: /api/video
app.get('/api/video', async (c) => {
  const rawUrl = c.req.query('url') || c.req.query('id');
  const rawLang = c.req.query('lang');
  const rawFormat = c.req.query('format');
  const rawFullText = c.req.query('fullText') ?? c.req.query('full_text');

  const validation = legacyQuerySchema.safeParse({
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

  // Default to true for legacy endpoint unless explicitly disabled
  const includeFullText =
    rawFullText !== undefined
      ? rawFullText === 'true' || rawFullText === '1'
      : true;

  const data = await getVideoData(videoId, lang, includeFullText, format);
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
      // Pre-warm Innertube in the background so the first request doesn't wait
      getInnertube().catch(() => {});
    }
  );
}

export default app;
