/**
 * Cleans a social media input, extracting the handle from a URL or raw text.
 * @param input The raw input string (e.g., URL, @handle, handle).
 * @returns The cleaned social media handle.
 */
export const cleanSocialMediaHandle = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  try {
    // Check if it's a valid URL, even without protocol
    const urlInput = input.startsWith('http') ? input : `https://${input}`;
    const url = new URL(urlInput);
    // Get last part of path, remove trailing slash and query params
    return url.pathname.split('/').filter(Boolean).pop() || '';
  } catch (e) {
    // Not a valid URL, assume it's a handle
    // Remove query parameters if any are left from partial URLs
    const handle = input.split('?')[0];
    // Remove the leading '@'
    return handle.startsWith('@') ? handle.substring(1).trim() : handle.trim();
  }
};
