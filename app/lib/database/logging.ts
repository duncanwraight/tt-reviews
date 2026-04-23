import { Logger } from "~/lib/logger.server";
import { withDatabaseCorrelation } from "~/lib/middleware/correlation.server";
import type { DatabaseContext } from "./types";

/**
 * Execute a Supabase query with correlation + logging + error translation.
 *
 * fn returns a Supabase query builder which is thenable but TypeScript doesn't
 * recognize PostgrestBuilder as PromiseLike, hence the 'any' return type.
 */
export async function withLogging<T>(
  ctx: DatabaseContext,
  operation: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any
): Promise<T> {
  const context = ctx.context || { requestId: "unknown" };

  return withDatabaseCorrelation(
    operation,
    async () => {
      const result = await fn();

      if (result.error) {
        Logger.error(
          `Database operation failed: ${operation}`,
          context,
          new Error(result.error.message || "Database error"),
          { operation, ...metadata, error_details: result.error }
        );
        throw new Error(
          result.error.message || `Database operation ${operation} failed`
        );
      }

      Logger.debug(`Database operation completed: ${operation}`, context, {
        operation,
        result_count: Array.isArray(result.data)
          ? result.data.length
          : result.data
            ? 1
            : 0,
        ...metadata,
      });

      return result.data;
    },
    context,
    metadata
  );
}
