export type ErrorCode =
  | 'INVALID_URL'
  | 'NO_CAPTIONS'
  | 'VIDEO_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'IP_BLOCKED'
  | 'UNAUTHORIZED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function mapErrorToAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  const errorName = error instanceof Error ? error.name : '';

  // Bot-detection / IP blocking
  if (
    lowerMessage.includes('sign in to confirm you’re not a bot') ||
    lowerMessage.includes('sign in to confirm') ||
    lowerMessage.includes('bot check') ||
    lowerMessage.includes('g-recaptcha') ||
    lowerMessage.includes('captcha') ||
    lowerMessage.includes('consent.youtube.com') ||
    lowerMessage.includes('unusual traffic')
  ) {
    return new AppError(
      503,
      'IP_BLOCKED',
      'YouTube blocked the request due to bot detection or IP restrictions.'
    );
  }

  // Rate limiting (HTTP 429)
  if (
    lowerMessage.includes('429') ||
    lowerMessage.includes('too many requests') ||
    errorName === 'YoutubeTranscriptTooManyRequestError'
  ) {
    return new AppError(
      429,
      'RATE_LIMITED',
      'Rate limit exceeded when contacting YouTube. Please try again later.'
    );
  }

  // Video unavailable / private / deleted
  if (
    lowerMessage.includes('video is unavailable') ||
    lowerMessage.includes('private video') ||
    lowerMessage.includes('video has been removed') ||
    lowerMessage.includes('not found') ||
    errorName === 'YoutubeTranscriptVideoUnavailableError'
  ) {
    return new AppError(
      404,
      'VIDEO_UNAVAILABLE',
      'The requested YouTube video is unavailable, private, or does not exist.'
    );
  }

  // No captions available
  if (
    lowerMessage.includes('no transcripts are available') ||
    lowerMessage.includes('transcript disabled') ||
    lowerMessage.includes('captions are not accessible') ||
    lowerMessage.includes('no transcript') ||
    errorName === 'YoutubeTranscriptDisabledError' ||
    errorName === 'YoutubeTranscriptNotAvailableError'
  ) {
    return new AppError(
      404,
      'NO_CAPTIONS',
      'No captions or transcripts are available for this video.'
    );
  }

  // Default to internal error
  return new AppError(
    500,
    'INTERNAL',
    message || 'An unexpected internal error occurred.'
  );
}
