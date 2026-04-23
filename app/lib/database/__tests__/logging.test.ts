import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withLogging } from "../logging";
import type { DatabaseContext } from "../types";
import { Logger } from "~/lib/logger.server";

/**
 * Unit tests for the withLogging helper — the shared wrapper every database
 * submodule uses to attach correlation, translate Supabase { data, error }
 * envelopes into throws, and emit debug/error logs.
 */

const ctx: DatabaseContext = {
  // supabase client isn't used by withLogging itself — the helper only
  // invokes the passed fn and inspects its result envelope.
   
  supabase: {} as any,
  context: { requestId: "test-req-1" },
};

describe("withLogging", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    debugSpy = vi.spyOn(Logger, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("returns data on success and logs debug", async () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = await withLogging<typeof data>(
      ctx,
      "test_op",
      async () => ({ data, error: null }),
      { foo: "bar" }
    );

    expect(result).toEqual(data);
    expect(debugSpy).toHaveBeenCalledWith(
      "Database operation completed: test_op",
      expect.objectContaining({ requestId: "test-req-1" }),
      expect.objectContaining({
        operation: "test_op",
        result_count: 2,
        foo: "bar",
      })
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("counts single object result as 1, null as 0", async () => {
    await withLogging(ctx, "op_single", async () => ({
      data: { id: 1 },
      error: null,
    }));
    expect(debugSpy).toHaveBeenLastCalledWith(
      "Database operation completed: op_single",
      expect.anything(),
      expect.objectContaining({ result_count: 1 })
    );

    await withLogging(ctx, "op_null", async () => ({ data: null, error: null }));
    expect(debugSpy).toHaveBeenLastCalledWith(
      "Database operation completed: op_null",
      expect.anything(),
      expect.objectContaining({ result_count: 0 })
    );
  });

  it("throws and logs error when result has an error", async () => {
    await expect(
      withLogging(ctx, "bad_op", async () => ({
        data: null,
        error: { message: "duplicate key" },
      }))
    ).rejects.toThrow("duplicate key");

    expect(errorSpy).toHaveBeenCalledWith(
      "Database operation failed: bad_op",
      expect.objectContaining({ requestId: "test-req-1" }),
      expect.any(Error),
      expect.objectContaining({
        operation: "bad_op",
        error_details: { message: "duplicate key" },
      })
    );
    // Success-path debug (`Database operation completed: ...`) must not fire.
    const successDebugs = debugSpy.mock.calls.filter(([msg]) =>
      String(msg).startsWith("Database operation completed")
    );
    expect(successDebugs).toHaveLength(0);
  });

  it("falls back to generic error message when error has no message", async () => {
    await expect(
      withLogging(ctx, "no_msg_op", async () => ({
        data: null,
        error: {},
      }))
    ).rejects.toThrow("Database operation no_msg_op failed");
  });

  it("uses 'unknown' requestId when ctx.context is undefined", async () => {
    const noCtx: DatabaseContext = {
       
      supabase: {} as any,
    };
    await withLogging(noCtx, "op", async () => ({ data: [], error: null }));
    expect(debugSpy).toHaveBeenCalledWith(
      "Database operation completed: op",
      expect.objectContaining({ requestId: "unknown" }),
      expect.anything()
    );
  });
});
