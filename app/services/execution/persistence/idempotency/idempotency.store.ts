export interface IdempotencyStore {
  /**
   * Attempts to acquire a lock for a specific execution.
   * Returns true if lock was acquired (first time execution).
   * Returns false if lock already exists (concurrent or duplicate execution).
   */
  acquireLock(key: string, ttlMs: number): Promise<boolean>;

  /**
   * Checks if an execution has already been successfully completed.
   */
  hasCompleted(key: string): Promise<boolean>;

  /**
   * Marks an execution as completed.
   */
  markCompleted(key: string): Promise<void>;

  /**
   * Releases a lock so the execution can be retried later.
   */
  releaseLock(key: string): Promise<void>;
}
