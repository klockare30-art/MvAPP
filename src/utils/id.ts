import { randomUUID } from 'expo-crypto';

/** Stable RFC 4122 v4 identifier used for every entity. */
export function newId(): string {
  return randomUUID();
}
