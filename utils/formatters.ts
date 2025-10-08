/**
 * Cleans a social media input, extracting the handle from a URL or raw text.
 * @param input The raw input string (e.g., URL, @handle, handle).
 * @returns The cleaned social media handle.
 */
export const cleanSocialMediaHandle = (input: string): string => {
  if (!input || typeof input !== 'string') return '';

  const cleanedInput = input.trim();

  // If it looks like a URL for the specific social media, parse it as a URL
  if (cleanedInput.includes('instagram.com') || cleanedInput.includes('tiktok.com')) {
    try {
      // Ensure there's a protocol for the URL constructor to work reliably
      const urlInput = cleanedInput.startsWith('http') ? cleanedInput : `https://${cleanedInput}`;
      const url = new URL(urlInput);
      // Get the last non-empty part of the path, which should be the username
      return url.pathname.split('/').filter(Boolean).pop() || '';
    } catch (e) {
      // If URL parsing fails, fall back to handle cleaning
    }
  }

  // If it's not a recognizable URL, treat it as a handle.
  // Remove query parameters that might exist in partial links
  const handle = cleanedInput.split('?')[0];
  // Remove leading '@' and any slashes, and return the result.
  return handle.replace(/^@/, '').replace(/\//g, '');
};