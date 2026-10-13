// Test-only replacement for expo-crypto (native module) using Node's crypto.
import { randomUUID as nodeRandomUUID } from 'node:crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}
