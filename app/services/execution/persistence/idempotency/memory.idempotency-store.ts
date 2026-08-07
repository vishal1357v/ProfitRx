import { IdempotencyStore } from "./idempotency.store";

export class MemoryIdempotencyStore implements IdempotencyStore {
  private locks = new Map<string, { expiresAt: number }>();
  private completed = new Set<string>();

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing) {
      if (existing.expiresAt > now) {
        return false; // Lock is currently held
      }
      // Lock expired, we can take it
    }

    if (this.completed.has(key)) {
      return false; // Already completed
    }

    this.locks.set(key, { expiresAt: now + ttlMs });
    return true;
  }

  async hasCompleted(key: string): Promise<boolean> {
    return this.completed.has(key);
  }

  async markCompleted(key: string): Promise<void> {
    this.completed.add(key);
    this.locks.delete(key);
  }

  async releaseLock(key: string): Promise<void> {
    this.locks.delete(key);
  }

  // Utility for testing
  _clear() {
    this.locks.clear();
    this.completed.clear();
  }
}
