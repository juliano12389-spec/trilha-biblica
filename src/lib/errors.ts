/**
 * Extracts a user-facing message from anything thrown by the app or by supabase-js.
 * supabase-js throws PostgrestError objects, which are plain objects rather than Error
 * instances, so an instanceof check would drop the message raised by the database.
 */
export function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === 'object' && caught !== null && 'message' in caught) {
    const message = (caught as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
