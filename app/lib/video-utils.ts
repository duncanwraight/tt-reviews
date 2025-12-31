/**
 * Utility functions for working with video content
 */

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  // Handle various YouTube URL formats
  const patterns = [
    // youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
    // youtu.be/VIDEO_ID
    /(?:youtu\.be\/)([^&\n?#]+)/,
    // youtube.com/embed/VIDEO_ID
    /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
    // youtube.com/v/VIDEO_ID
    /(?:youtube\.com\/v\/)([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get YouTube thumbnail URL for a video ID
 */
export function getYouTubeThumbnailUrl(videoId: string, quality: 'default' | 'medium' | 'high' | 'maxres' = 'maxres'): string {
  const qualityMap = {
    'default': 'default',
    'medium': 'mqdefault', 
    'high': 'hqdefault',
    'maxres': 'maxresdefault'
  };
  
  const qualityParam = qualityMap[quality] || 'maxresdefault';
  return `https://img.youtube.com/vi/${videoId}/${qualityParam}.jpg`;
}

/**
 * Check if a URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  
  const youtubePatterns = [
    /^https?:\/\/(www\.)?youtube\.com/,
    /^https?:\/\/youtu\.be/,
    /^https?:\/\/(www\.)?youtube-nocookie\.com/
  ];
  
  return youtubePatterns.some(pattern => pattern.test(url));
}

/**
 * Create YouTube embed URL from video ID
 */
export function createYouTubeEmbedUrl(videoId: string, autoplay: boolean = false): string {
  const params = new URLSearchParams();
  if (autoplay) {
    params.set('autoplay', '1');
  }
  
  const paramString = params.toString();
  return `https://www.youtube.com/embed/${videoId}${paramString ? '?' + paramString : ''}`;
}