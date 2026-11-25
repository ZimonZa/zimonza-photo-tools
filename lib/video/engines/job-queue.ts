import { ExportCanceledError } from "@/lib/video/errors";

/** Runs `job` once every job queued before it has settled; see `createJobQueue`. */
export type JobQueue = <T>(job: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

/**
 * A queue that runs async jobs one at a time, in the order they were queued. A failed job rejects
 * only its own caller. A job whose `signal` aborts before its turn rejects with
 * `ExportCanceledError` at once and never runs; once a job has started, aborting it is its own
 * business.
 */
export function createJobQueue(): JobQueue {
  let tail: Promise<void> = Promise.resolve();
  return <T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) return Promise.reject(new ExportCanceledError());
    let started = false;
    const result = tail.then(() => {
      if (signal?.aborted) throw new ExportCanceledError();
      started = true;
      return job();
    });
    tail = result.then(
      () => undefined,
      () => undefined
    );
    if (!signal) return result;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        if (!started) reject(new ExportCanceledError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      result.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (e) => {
          signal.removeEventListener("abort", onAbort);
          reject(e);
        }
      );
    });
  };
}
