/**
 * Formats a duration in milliseconds into "HH:MM:SS" (or "MM:SS" if under one hour).
 * 
 * Examples:
 * - 0 ms -> "00:00"
 * - 83,000 ms -> "01:23"
 * - 3,683,000 ms -> "01:01:23"
 */
export function formatTimestamp(ms: number, forceHours: boolean = false): string {
  const safeMs = Math.max(0, Math.floor(ms || 0));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0 || forceHours) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
}
