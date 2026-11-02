import { formatTimestamp } from '../lib/format-timestamp.js';
import type { ExternalTranscriptResult, ExternalTranscriptSegment } from './supadata.js';

/**
 * Fetches transcript from Capslane API.
 * Uses process.env.CAPSLANE_API_KEY
 */
export async function fetchCapslaneTranscript(
  videoId: string,
  lang?: string
): Promise<ExternalTranscriptResult | null> {
  const apiKey = process.env.CAPSLANE_API_KEY;
  if (!apiKey) {
    console.error('[Tier 3: Capslane] ❌ CAPSLANE_API_KEY is missing in Render environment variables!');
    return null;
  }

  const videoUrl = encodeURIComponent(`https://youtu.be/${videoId}`);
  const endpoint = `https://capslane.com/v1/transcript?url=${videoUrl}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    if (!data || !Array.isArray(data.content) || data.content.length === 0) {
      return null;
    }

    const segments: ExternalTranscriptSegment[] = data.content
      .map((item: any) => {
        const offset = typeof item.offset === 'number' ? item.offset : parseInt(item.offset, 10) || 0;
        const duration = typeof item.duration === 'number' ? item.duration : parseInt(item.duration, 10) || 0;
        const text = (item.text || '').trim();
        return {
          text,
          start: formatTimestamp(offset),
          startMs: offset,
          durationMs: duration
        };
      })
      .filter((s: ExternalTranscriptSegment) => s.text.length > 0);

    if (segments.length === 0) {
      return null;
    }

    return {
      provider: 'capslane',
      language: data.lang || lang || 'auto',
      availableLanguages: Array.isArray(data.availableLangs) ? data.availableLangs : [data.lang || 'auto'],
      segments
    };
  } catch {
    return null;
  }
}
