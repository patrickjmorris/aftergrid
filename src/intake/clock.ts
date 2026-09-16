// Time and retry, both injectable. Intake waits in two places — between polls and between retries of a
// transient API error — and neither may be a real sleep in a test: a test that waits is a test nobody runs.
// Every timestamp intake writes also comes from here, so a run's log is reproducible under a fake clock.
import { GitHubError } from "../publication/github.ts";

export type Clock = {
  now(): Date;
  /** Resolve after `ms` of this clock's time. The test clock records the wait and returns immediately. */
  sleep(ms: number): Promise<void>;
};

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      (timer as { unref?: () => void }).unref?.();
    }),
};

export type TestClock = Clock & {
  /** Every sleep asked for, in order. Nothing actually waited. */
  readonly slept: number[];
  advance(ms: number): void;
};

/** A clock that never waits: sleeps are recorded and advance the clock instead. */
export function createTestClock(start: string | Date = "2026-09-15T12:00:00.000Z"): TestClock {
  let t = (typeof start === "string" ? new Date(start) : start).getTime();
  const slept: number[] = [];
  return {
    slept,
    now: () => new Date(t),
    advance: (ms: number) => { t += ms; },
    async sleep(ms: number) { slept.push(ms); t += ms; },
  };
}

/** Timestamp format used in every intake artifact: ISO-8601 UTC with milliseconds. */
export const stamp = (clock: Clock): string => clock.now().toISOString();

const TRANSIENT_CLASSES = new Set(["rate_limited", "server_error", "network"]);

/**
 * Transient means "the same call could succeed later": HTTP 429, any 5xx, or a network failure. A 404, a 401 or
 * a malformed body is not retried — repeating it only produces the same answer more expensively.
 */
export function isTransient(e: unknown): boolean {
  if (e instanceof GitHubError) {
    if (TRANSIENT_CLASSES.has(e.errorClass)) return true;
    return e.status === 429 || (typeof e.status === "number" && e.status >= 500);
  }
  const message = e instanceof Error ? e.message : String(e);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message);
}

export type RetryOptions = {
  maxAttempts: number;
  clock: Clock;
  /** Base backoff in milliseconds; doubled per attempt and capped. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Called before each wait, so the caller can log the retry with its own ids. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  /** Called before every attempt after the first: a non-null result short-circuits, so a create that already
   *  landed before the error is reused instead of repeated. */
  recover?: () => Promise<unknown | null>;
};

/**
 * Retry a transient failure with exponential backoff measured on the injected clock. The `recover` hook is how
 * "retry the create" stops meaning "create a second pull request": it is asked, before every retry, whether the
 * thing already exists.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  const cap = opts.maxDelayMs ?? 30_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, opts.maxAttempts); attempt++) {
    if (attempt > 1 && opts.recover) {
      const recovered = await opts.recover();
      if (recovered !== null && recovered !== undefined) return recovered as T;
    }
    try { return await fn(attempt); }
    catch (e) {
      lastError = e;
      if (!isTransient(e) || attempt >= Math.max(1, opts.maxAttempts)) throw e;
      const delayMs = Math.min(cap, base * 2 ** (attempt - 1));
      opts.onRetry?.({ attempt, delayMs, error: e });
      await opts.clock.sleep(delayMs);
    }
  }
  throw lastError;
}
