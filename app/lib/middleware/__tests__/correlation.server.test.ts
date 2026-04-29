import { describe, it, expect, vi, beforeEach } from "vitest";
import { withLoaderCorrelation } from "../correlation.server";
import { Logger } from "~/lib/logger.server";

// TT-109: thrown Response (status < 500) is React Router's idiomatic
// "return a 4xx" pattern — not an error. The correlation wrapper used
// to log these via Logger.error, which fanned out to the Discord
// alerter on every 404. Verify the new branch keeps real exceptions
// loud while suppressing client-error responses.

describe("withLoaderCorrelation error logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT log Logger.error when a loader throws a 4xx Response", async () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    const wrapped = withLoaderCorrelation(
      async (_args: { request: Request }) => {
        throw new Response("Not Found", { status: 404 });
      }
    );

    await expect(
      wrapped({ request: new Request("https://x.test/missing") })
    ).rejects.toBeInstanceOf(Response);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("DOES log Logger.error when a loader throws a 500 Response", async () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    const wrapped = withLoaderCorrelation(
      async (_args: { request: Request }) => {
        throw new Response("DB down", { status: 500 });
      }
    );

    await expect(
      wrapped({ request: new Request("https://x.test/boom") })
    ).rejects.toBeInstanceOf(Response);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("DOES log Logger.error when a loader throws a real Error", async () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    const wrapped = withLoaderCorrelation(
      async (_args: { request: Request }) => {
        throw new Error("boom");
      }
    );

    await expect(
      wrapped({ request: new Request("https://x.test/oops") })
    ).rejects.toThrow("boom");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
