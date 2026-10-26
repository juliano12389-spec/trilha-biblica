import { useState } from 'react';

import { newRequestId } from '../lib/ids';

/**
 * Identifier for a write request that stays the same while its content does
 * and changes when the content changes. A retry of an unchanged request reuses
 * the id, so the backend can recognise it; an edited request gets a new id.
 */
export function useRequestId(contentKey: string): string {
  const [current, setCurrent] = useState(() => ({ key: contentKey, id: newRequestId() }));
  if (current.key !== contentKey) {
    // Derived state: recompute during render when the content changes.
    const next = { key: contentKey, id: newRequestId() };
    setCurrent(next);
    return next.id;
  }
  return current.id;
}
