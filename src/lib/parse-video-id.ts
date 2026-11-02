import { AppError } from './errors.js';

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts and validates an 11-character YouTube video ID from a URL or bare ID string.
 * Supports:
 * - Bare 11-char ID (e.g., dQw4w9WgXcQ)
 * - Standard watch URL (e.g., youtube.com/watch?v=dQw4w9WgXcQ)
 * - Mobile URL (e.g., m.youtube.com/watch?v=dQw4w9WgXcQ)
 * - Short URL (e.g., youtu.be/dQw4w9WgXcQ)
 * - Shorts URL (e.g., youtube.com/shorts/dQw4w9WgXcQ)
 * - Embed URL (e.g., youtube.com/embed/dQw4w9WgXcQ)
 * - Live URL (e.g., youtube.com/live/dQw4w9WgXcQ)
 */
export function parseVideoId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new AppError(400, 'INVALID_URL', 'Video URL or ID must not be empty.');
  }

  // Check if it's already a bare 11-char ID
  if (VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    // Ensure URL has a protocol for parsing
    const urlString = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(urlString);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

    // 1) youtu.be/<id>
    if (hostname === 'youtu.be') {
      const pathnameId = url.pathname.slice(1).split('/')[0]?.split('?')[0];
      if (pathnameId && VIDEO_ID_REGEX.test(pathnameId)) {
        return pathnameId;
      }
    }

    // 2) youtube.com or m.youtube.com
    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      // /watch?v=<id>
      if (url.pathname === '/watch' || url.pathname === '/watch_popup') {
        const vParam = url.searchParams.get('v');
        if (vParam && VIDEO_ID_REGEX.test(vParam)) {
          return vParam;
        }
      }

      // /shorts/<id>, /embed/<id>, /v/<id>, /live/<id>
      const pathSegments = url.pathname.split('/').filter(Boolean);
      if (pathSegments.length >= 2) {
        const [prefix, id] = pathSegments;
        if (['shorts', 'embed', 'v', 'live'].includes(prefix.toLowerCase())) {
          if (id && VIDEO_ID_REGEX.test(id)) {
            return id;
          }
        }
      }
    }
  } catch {
    // URL parsing failed; fall through to regex heuristic
  }

  // Fallback regex scan for standard patterns
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/
  );

  if (match && match[1] && VIDEO_ID_REGEX.test(match[1])) {
    return match[1];
  }

  throw new AppError(
    400,
    'INVALID_URL',
    `Invalid YouTube URL or video ID: "${input}". Must be a valid 11-character YouTube video ID or URL.`
  );
}
