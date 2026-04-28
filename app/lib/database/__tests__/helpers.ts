import { vi } from "vitest";
import type { DatabaseContext } from "../types";

/**
 * Mock Supabase query-builder chain. Every builder method returns the same
 * object so callers can chain .from().select().eq().order() freely. The
 * terminal value is whatever `result` is set to — it is awaitable (thenable)
 * and also used by .maybeSingle() / .single().
 *
 * Per-call arguments are recorded into the `calls` array so tests can assert
 * which filters / orders / ranges the code-under-test applied.
 */
export interface BuilderCall {
  method: string;
  args: unknown[];
}

export interface MockBuilder {
  calls: BuilderCall[];
  result: { data: unknown; error: unknown; count?: number };
  // Chainable methods
  from: (table: string) => MockBuilder;
  select: (cols?: unknown, options?: unknown) => MockBuilder;
  eq: (col: string, val: unknown) => MockBuilder;
  neq: (col: string, val: unknown) => MockBuilder;
  in: (col: string, vals: unknown[]) => MockBuilder;
  or: (filter: string) => MockBuilder;
  not: (col: string, op: string, val: unknown) => MockBuilder;
  order: (col: string, opts?: unknown) => MockBuilder;
  limit: (n: number) => MockBuilder;
  range: (start: number, end: number) => MockBuilder;
  textSearch: (col: string, query: string) => MockBuilder;
  insert: (row: unknown) => MockBuilder;
  update: (row: unknown) => MockBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  // Thenable — `await builder` resolves to { data, error, count? }
  then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => void;
}

export function makeBuilder(
  result: { data?: unknown; error?: unknown; count?: number } = {}
): MockBuilder {
  const state: { result: { data: unknown; error: unknown; count?: number } } = {
    result: {
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count,
    },
  };

  const calls: BuilderCall[] = [];

  const builder = {} as MockBuilder;
  builder.calls = calls;

  Object.defineProperty(builder, "result", {
    get: () => state.result,
    set: (v: { data: unknown; error: unknown; count?: number }) => {
      state.result = v;
    },
  });

  const chainable = [
    "from",
    "select",
    "eq",
    "neq",
    "in",
    "or",
    "not",
    "order",
    "limit",
    "range",
    "textSearch",
    "insert",
    "update",
  ] as const;

  for (const method of chainable) {
    (builder as any)[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }

  builder.maybeSingle = () => {
    calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve({
      data: state.result.data,
      error: state.result.error,
    });
  };

  builder.single = () => {
    calls.push({ method: "single", args: [] });
    return Promise.resolve({
      data: state.result.data,
      error: state.result.error,
    });
  };

  // Thenable — resolves to full result (including count) so callers that
  // await the builder directly get the same shape as Supabase returns.
  builder.then = (resolve, reject) => {
    try {
      resolve(state.result);
    } catch (e) {
      if (reject) reject(e);
    }
  };

  return builder;
}

/**
 * A full supabase mock — keeps a map of table → builder so different tables
 * can return different results. Also supports .rpc(name) → configured result.
 */
export interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  _builders: Map<string, MockBuilder>;
  _rpcResults: Map<string, { data: unknown; error: unknown }>;
}

export function makeSupabase(config?: {
  tables?: Record<string, { data?: unknown; error?: unknown; count?: number }>;
  rpc?: Record<string, { data?: unknown; error?: unknown }>;
}): MockSupabase {
  const builders = new Map<string, MockBuilder>();
  const rpcResults = new Map<string, { data: unknown; error: unknown }>();

  for (const [table, result] of Object.entries(config?.tables ?? {})) {
    builders.set(table, makeBuilder(result));
  }

  for (const [name, result] of Object.entries(config?.rpc ?? {})) {
    rpcResults.set(name, {
      data: result.data ?? null,
      error: result.error ?? null,
    });
  }

  const from = vi.fn((table: string) => {
    if (!builders.has(table)) {
      builders.set(table, makeBuilder({ data: [], error: null }));
    }
    const b = builders.get(table)!;
    b.calls.push({ method: "from", args: [table] });
    return b;
  });

  const rpc = vi.fn((name: string, _params?: unknown) => {
    const result = rpcResults.get(name) ?? { data: null, error: null };
    return Promise.resolve(result);
  });

  return {
    from,
    rpc,
    _builders: builders,
    _rpcResults: rpcResults,
  };
}

export function makeCtx(
  supabase: MockSupabase = makeSupabase()
): DatabaseContext {
  return {
    supabase: supabase as unknown as any,
    context: { requestId: "test-request" },
  };
}
