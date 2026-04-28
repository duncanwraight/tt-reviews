import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  uploadEquipmentImage,
  UploadValidationError,
  MAX_UPLOAD_BYTES,
} from "../upload.server";
import type { R2BucketSurface } from "../review.server";

interface FakeEquipment {
  id: string;
  slug: string;
  image_key: string | null;
  image_etag: string | null;
  image_credit_text: string | null;
  image_credit_link: string | null;
  image_source_url: string | null;
  image_skipped_at: string | null;
  image_trim_kind: string | null;
}

class EqBuilder {
  private mode: "select" | "update" = "select";
  private filters: Array<{ col: string; val: unknown }> = [];
  private payload: Record<string, unknown> = {};
  constructor(private rows: FakeEquipment[]) {}
  select(_cols: string) {
    this.mode = "select";
    return this;
  }
  update(p: Record<string, unknown>) {
    this.mode = "update";
    this.payload = p;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    if (this.mode === "update") {
      for (const r of this.rows) {
        if (
          this.filters.every(
            f => (r as unknown as Record<string, unknown>)[f.col] === f.val
          )
        ) {
          Object.assign(r, this.payload);
        }
      }
      return Promise.resolve({ error: null });
    }
    return this;
  }
  maybeSingle() {
    const row = this.rows.find(r =>
      this.filters.every(
        f => (r as unknown as Record<string, unknown>)[f.col] === f.val
      )
    );
    return Promise.resolve({ data: row ?? null, error: null });
  }
}

function makeSupabase(rows: FakeEquipment[]) {
  return {
    from(table: string) {
      if (table === "equipment") return new EqBuilder(rows);
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

function makeBucket(): {
  bucket: R2BucketSurface;
  puts: Array<{ key: string; bytes: number; contentType: string | undefined }>;
  deletes: string[];
} {
  const puts: Array<{
    key: string;
    bytes: number;
    contentType: string | undefined;
  }> = [];
  const deletes: string[] = [];
  const bucket: R2BucketSurface = {
    put: async (key, body, options) => {
      const len =
        body instanceof ArrayBuffer
          ? body.byteLength
          : (body as Uint8Array).byteLength;
      puts.push({
        key,
        bytes: len,
        contentType: options?.httpMetadata?.contentType,
      });
      return undefined;
    },
    delete: async key => {
      deletes.push(key);
      return undefined;
    },
    get: async () => null,
  };
  return { bucket, puts, deletes };
}

function fakeFile(
  type: string,
  size: number,
  bytes: ArrayBuffer = new ArrayBuffer(size)
) {
  return {
    type,
    size,
    arrayBuffer: async () => bytes,
  };
}

const baseEquipment: FakeEquipment = {
  id: "eq-1",
  slug: "andro-nuzn-50",
  image_key: null,
  image_etag: null,
  image_credit_text: null,
  image_credit_link: null,
  image_source_url: null,
  image_skipped_at: null,
  image_trim_kind: null,
};

describe("uploadEquipmentImage validation", () => {
  it("rejects an unsupported MIME type", async () => {
    const supabase = makeSupabase([{ ...baseEquipment }]);
    const { bucket, puts } = makeBucket();
    await expect(
      uploadEquipmentImage(
        supabase,
        bucket,
        {
          equipmentId: "eq-1",
          slug: "andro-nuzn-50",
          file: fakeFile("application/pdf", 1024),
        },
        { randomId: () => "id-1" }
      )
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(puts).toHaveLength(0);
  });

  it("rejects an empty file", async () => {
    const supabase = makeSupabase([{ ...baseEquipment }]);
    const { bucket, puts } = makeBucket();
    await expect(
      uploadEquipmentImage(
        supabase,
        bucket,
        {
          equipmentId: "eq-1",
          slug: "andro-nuzn-50",
          file: fakeFile("image/jpeg", 0),
        },
        { randomId: () => "id-1" }
      )
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(puts).toHaveLength(0);
  });

  it("rejects a file larger than the size cap", async () => {
    const supabase = makeSupabase([{ ...baseEquipment }]);
    const { bucket, puts } = makeBucket();
    await expect(
      uploadEquipmentImage(
        supabase,
        bucket,
        {
          equipmentId: "eq-1",
          slug: "andro-nuzn-50",
          file: fakeFile("image/jpeg", MAX_UPLOAD_BYTES + 1),
        },
        { randomId: () => "id-1" }
      )
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(puts).toHaveLength(0);
  });
});

describe("uploadEquipmentImage replace logic", () => {
  it("uploads to manual/<id>.<ext>, sets image_key, skips delete when no previous key", async () => {
    const rows: FakeEquipment[] = [{ ...baseEquipment }];
    const supabase = makeSupabase(rows);
    const { bucket, puts, deletes } = makeBucket();

    const result = await uploadEquipmentImage(
      supabase,
      bucket,
      {
        equipmentId: "eq-1",
        slug: "andro-nuzn-50",
        file: fakeFile("image/png", 100),
      },
      { randomId: () => "abcd1234" }
    );

    expect(result.image_key).toBe(
      "equipment/andro-nuzn-50/manual/abcd1234.png"
    );
    expect(result.replacedKey).toBeNull();
    expect(puts).toEqual([
      {
        key: "equipment/andro-nuzn-50/manual/abcd1234.png",
        bytes: 100,
        contentType: "image/png",
      },
    ]);
    expect(deletes).toEqual([]);
    expect(rows[0].image_key).toBe(
      "equipment/andro-nuzn-50/manual/abcd1234.png"
    );
    expect(rows[0].image_credit_text).toBe("manual upload");
    expect(rows[0].image_credit_link).toBeNull();
    expect(rows[0].image_source_url).toBeNull();
    expect(rows[0].image_trim_kind).toBeNull();
    expect(rows[0].image_skipped_at).toBeNull();
  });

  it("deletes the previous R2 key after a successful replace", async () => {
    const rows: FakeEquipment[] = [
      {
        ...baseEquipment,
        image_key: "equipment/andro-nuzn-50/cand/old-key.jpg",
        image_credit_text: "revspin.net",
        image_skipped_at: "2026-01-01T00:00:00Z",
        image_trim_kind: "auto",
      },
    ];
    const supabase = makeSupabase(rows);
    const { bucket, puts, deletes } = makeBucket();

    const result = await uploadEquipmentImage(
      supabase,
      bucket,
      {
        equipmentId: "eq-1",
        slug: "andro-nuzn-50",
        file: fakeFile("image/webp", 1234),
      },
      { randomId: () => "newid" }
    );

    expect(result.replacedKey).toBe("equipment/andro-nuzn-50/cand/old-key.jpg");
    expect(puts.map(p => p.key)).toEqual([
      "equipment/andro-nuzn-50/manual/newid.webp",
    ]);
    expect(deletes).toEqual(["equipment/andro-nuzn-50/cand/old-key.jpg"]);
    // Stale state cleared, even though previous source was a sourced
    // candidate with credit + auto-trim.
    expect(rows[0].image_credit_text).toBe("manual upload");
    expect(rows[0].image_trim_kind).toBeNull();
    expect(rows[0].image_skipped_at).toBeNull();
  });

  it("throws when equipment row is missing", async () => {
    const supabase = makeSupabase([]);
    const { bucket, puts } = makeBucket();
    await expect(
      uploadEquipmentImage(
        supabase,
        bucket,
        {
          equipmentId: "missing",
          slug: "andro-nuzn-50",
          file: fakeFile("image/jpeg", 200),
        },
        { randomId: () => "id-1" }
      )
    ).rejects.toThrow(/equipment not found/);
    expect(puts).toHaveLength(0);
  });
});
