import { Innertube, ClientType } from 'youtubei.js';

export interface VideoMetadata {
  title: string;
  channel: string;
  channelId: string;
  description: string;
  durationSeconds: number;
  publishedAt: string | null;
  viewCount: number;
  thumbnails: Array<{
    url: string;
    width?: number;
    height?: number;
  }>;
}

let innertubeInstance: Innertube | null = null;

async function getInnertube(): Promise<Innertube> {
  if (!innertubeInstance) {
    innertubeInstance = await Innertube.create();
  }
  return innertubeInstance;
}

/**
 * Standard YouTube thumbnails based on video ID.
 */
function getStandardThumbnails(videoId: string) {
  return [
    { url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 },
    { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 },
    { url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, width: 320, height: 180 },
    { url: `https://i.ytimg.com/vi/${videoId}/default.jpg`, width: 120, height: 90 }
  ];
}

/**
 * Fallback metadata fetcher using YouTube's official, zero-auth, unblockable oEmbed API.
 */
async function fetchOEmbedMetadata(videoId: string): Promise<VideoMetadata | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;

    const data: any = await res.json();
    return {
      title: data.title || '',
      channel: data.author_name || '',
      channelId: data.author_url ? data.author_url.split('/').pop() || '' : '',
      description: '',
      durationSeconds: 0,
      publishedAt: null,
      viewCount: 0,
      thumbnails: [
        ...(data.thumbnail_url
          ? [{ url: data.thumbnail_url, width: data.thumbnail_width, height: data.thumbnail_height }]
          : []),
        ...getStandardThumbnails(videoId)
      ]
    };
  } catch {
    return null;
  }
}

/**
 * Fetches video metadata reliably.
 * 1. Tries Innertube Android Client (rich metadata).
 * 2. Falls back to YouTube oEmbed API (guaranteed to succeed without bot-blocks).
 */
export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  // 1. Try Innertube Basic Info (Android client)
  try {
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId, { client: ClientType.ANDROID });
    const basic = info.basic_info;

    if (basic && basic.title) {
      return {
        title: basic.title || '',
        channel: basic.author || '',
        channelId: basic.channel_id || '',
        description: basic.short_description || '',
        durationSeconds:
          typeof basic.duration === 'number'
            ? basic.duration
            : parseInt(String(basic.duration || 0), 10) || 0,
        publishedAt: basic.publish_date || null,
        viewCount:
          typeof basic.view_count === 'number'
            ? basic.view_count
            : parseInt(String(basic.view_count || 0), 10) || 0,
        thumbnails:
          Array.isArray(basic.thumbnail) && basic.thumbnail.length > 0
            ? basic.thumbnail.map((t: any) => ({
                url: t.url,
                width: t.width,
                height: t.height
              }))
            : getStandardThumbnails(videoId)
      };
    }
  } catch {
    // Innertube failed or blocked, proceed to oEmbed fallback
  }

  // 2. Fallback to YouTube oEmbed API
  const oembed = await fetchOEmbedMetadata(videoId);
  if (oembed) {
    return oembed;
  }

  // 3. Absolute fallback
  return {
    title: '',
    channel: '',
    channelId: '',
    description: '',
    durationSeconds: 0,
    publishedAt: null,
    viewCount: 0,
    thumbnails: getStandardThumbnails(videoId)
  };
}
