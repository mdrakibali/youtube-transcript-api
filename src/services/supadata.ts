import { formatTimestamp } from '../lib/format-timestamp.js';

export interface ExternalTranscriptSegment {
  text: string;
  start: string;
  startMs: number;
  durationMs: number;
}

export interface ExternalTranscriptResult {
  provider: 'supadata' | 'capslane';
  language: string;
  availableLanguages: string[];
  segments: ExternalTranscriptSegment[];
}

/**
 * Fetches transcript from Supadata AI API.
 * Uses process.env.SUPADATA_API_KEY
 */
export async function fetchSupadataTranscript(
  videoId: string,
  lang?: string
): Promise<ExternalTranscriptResult | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    console.error('[Tier 2: Supadata] ❌ SUPADATA_API_KEY is missing in Render environment variables!');
    return null;
  }

  const videoUrl = encodeURIComponent(`https://youtu.be/${videoId}`);
  const endpoint = `https://api.supadata.ai/v1/transcript?url=${videoUrl}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`;

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
      provider: 'supadata',
      language: data.lang || lang || 'auto',
      availableLanguages: Array.isArray(data.availableLangs) ? data.availableLangs : [data.lang || 'auto'],
      segments
    };
  } catch {
    return null;
  }
}
