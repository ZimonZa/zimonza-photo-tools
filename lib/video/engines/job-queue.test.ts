import { describe, expect, test } from "vitest";
import { ExportCanceledError } from "@/lib/video/errors";
import { createJobQueue } from "@/lib/video/engines/job-queue";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createJobQueue", () => {
  test("runs jobs one at a time, in the order they were queued", async () => {
    const run = createJobQueue();
    const log: string[] = [];
    const first = deferred();
    const a = run(async () => {
      log.push("a start");
      await first.promise;
      log.push("a end");
      return "a";
    });
    const b = run(async () => {
      log.push("b start");
      return "b";
    });
    await flush();
    expect(log).toEqual(["a start"]);
    first.resolve();
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(log).toEqual(["a start", "a end", "b start"]);
  });

  test("a failed job rejects only its own caller; the next one still runs", async () => {
    const run = createJobQueue();
    const a = run(async () => {
      throw new Error("boom");
    });
    const b = run(async () => "b");
    await expect(a).rejects.toThrow("boom");
    expect(await b).toBe("b");
  });

  test("a job whose signal aborts while it waits rejects at once and never runs", async () => {
    const run = createJobQueue();
    const first = deferred();
    const a = run(() => first.promise);
    const controller = new AbortController();
    let ran = false;
    const b = run(async () => {
      ran = true;
    }, controller.signal);
    controller.abort();
    await expect(b).rejects.toBeInstanceOf(ExportCanceledError);
    first.resolve();
    await a;
    await flush();
    expect(ran).toBe(false);
    // The queue keeps going.
    expect(await run(async () => "c")).toBe("c");
  });

  test("an already aborted signal rejects without waiting", async () => {
    const run = createJobQueue();
    const blocker = deferred();
    void run(() => blocker.promise);
    const controller = new AbortController();
    controller.abort();
    await expect(run(async () => "x", controller.signal)).rejects.toBeInstanceOf(ExportCanceledError);
    blocker.resolve();
  });

  test("an abort after the job started is left to the job; the caller gets the job's own result", async () => {
    const run = createJobQueue();
    const controller = new AbortController();
    const started = deferred();
    const finish = deferred<string>();
    const p = run(async () => {
      started.resolve();
      return finish.promise;
    }, controller.signal);
    await started.promise;
    controller.abort();
    finish.resolve("done anyway");
    expect(await p).toBe("done anyway");
  });
});
