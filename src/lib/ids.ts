import { randomUUID } from 'expo-crypto';

/**
 * Identifier for one submission attempt. The same value is reused on retries,
 * so the backend can recognise a repeated request and avoid a duplicate write.
 */
export function newRequestId(): string {
  return randomUUID();
}
