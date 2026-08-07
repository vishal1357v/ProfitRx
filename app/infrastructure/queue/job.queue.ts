export interface Job {
  id: string;
  name: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface IJobQueue {
  enqueue(job: Omit<Job, "id" | "attempts" | "createdAt">): Promise<string>;
  dequeue(): Promise<Job | null>;
  acknowledge(id: string): Promise<void>;
  fail(id: string, reason: string): Promise<void>;
}

export class MemoryJobQueue implements IJobQueue {
  private queue: Job[] = [];
  private inProgress: Map<string, Job> = new Map();

  async enqueue(jobData: Omit<Job, "id" | "attempts" | "createdAt">): Promise<string> {
    const job: Job = {
      ...jobData,
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      attempts: 0,
      createdAt: new Date()
    };
    this.queue.push(job);
    return job.id;
  }

  async dequeue(): Promise<Job | null> {
    const job = this.queue.shift();
    if (!job) return null;

    job.attempts++;
    this.inProgress.set(job.id, job);
    return job;
  }

  async acknowledge(id: string): Promise<void> {
    this.inProgress.delete(id);
  }

  async fail(id: string, reason: string): Promise<void> {
    const job = this.inProgress.get(id);
    if (!job) return;

    this.inProgress.delete(id);
    console.error(`[MemoryJobQueue] Job ${id} failed: ${reason}`);

    if (job.attempts < job.maxAttempts) {
      // Re-queue with exponential backoff (simplified here)
      this.queue.push(job);
    } else {
      console.error(`[MemoryJobQueue] Job ${id} completely failed after ${job.attempts} attempts.`);
    }
  }
}
