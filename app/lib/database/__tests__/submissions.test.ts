import { describe, it, expect, vi } from "vitest";
import * as submissions from "../submissions";
import { makeSupabase, makeCtx } from "./helpers";

const baseEquipmentSubmission = {
  user_id: "u1",
  name: "Blade X",
  manufacturer: "m",
  category: "blade" as const,
  specifications: {},
  approval_count: 0,
};

const basePlayerSubmission = {
  user_id: "u1",
  name: "Test",
  approval_count: 0,
};

describe("submissions.getSubmissionTableName", () => {
  it.each([
    ["equipment", "equipment_submissions"],
    ["player", "player_submissions"],
    ["player_edit", "player_edits"],
    ["video", "video_submissions"],
    ["equipment_edit", "equipment_edits"],
  ] as const)("maps %s → %s", (input, expected) => {
    expect(submissions.getSubmissionTableName(input)).toBe(expected);
  });

  it("throws on unknown submission type", () => {
    expect(() => submissions.getSubmissionTableName("bogus" as any)).toThrow(
      /Unknown submission type/
    );
  });
});

describe("submissions.submitEquipment", () => {
  it("inserts with status=pending and returns the created row", async () => {
    const inserted = {
      ...baseEquipmentSubmission,
      id: "new-id",
      status: "pending",
    };
    const supabase = makeSupabase({
      tables: { equipment_submissions: { data: inserted } },
    });
    const result = await submissions.submitEquipment(
      makeCtx(supabase),
      baseEquipmentSubmission
    );
    expect(result).toEqual(inserted);
    const b = supabase._builders.get("equipment_submissions")!;
    expect(b.calls).toContainEqual({
      method: "insert",
      args: [{ ...baseEquipmentSubmission, status: "pending" }],
    });
    expect(b.calls).toContainEqual({ method: "single", args: [] });
  });

  it("returns null on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { equipment_submissions: { error: { message: "boom" } } },
    });
    expect(
      await submissions.submitEquipment(
        makeCtx(supabase),
        baseEquipmentSubmission
      )
    ).toBeNull();
    spy.mockRestore();
  });
});

describe("submissions.getUserEquipmentSubmissions", () => {
  it("filters by user_id and orders by created_at desc", async () => {
    const rows = [{ id: "s1" }];
    const supabase = makeSupabase({
      tables: { equipment_submissions: { data: rows } },
    });
    expect(
      await submissions.getUserEquipmentSubmissions(makeCtx(supabase), "u1")
    ).toEqual(rows);
    const b = supabase._builders.get("equipment_submissions")!;
    expect(b.calls).toContainEqual({ method: "eq", args: ["user_id", "u1"] });
  });
});

describe("submissions.submitPlayer", () => {
  it("inserts with status=pending and returns the created row", async () => {
    const inserted = {
      ...basePlayerSubmission,
      id: "p-id",
      status: "pending",
    };
    const supabase = makeSupabase({
      tables: { player_submissions: { data: inserted } },
    });
    expect(
      await submissions.submitPlayer(makeCtx(supabase), basePlayerSubmission)
    ).toEqual(inserted);
  });

  it("returns null on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { player_submissions: { error: { message: "x" } } },
    });
    expect(
      await submissions.submitPlayer(makeCtx(supabase), basePlayerSubmission)
    ).toBeNull();
    spy.mockRestore();
  });
});

describe("submissions.getUserPlayerSubmissions", () => {
  it("returns data on success", async () => {
    const supabase = makeSupabase({
      tables: { player_submissions: { data: [{ id: "a" }] } },
    });
    expect(
      await submissions.getUserPlayerSubmissions(makeCtx(supabase), "u1")
    ).toEqual([{ id: "a" }]);
  });
});

describe("submissions.getDiscordMessageId", () => {
  it.each([
    ["equipment", "equipment_submissions"],
    ["player", "player_submissions"],
    ["player_edit", "player_edits"],
    ["video", "video_submissions"],
  ] as const)("queries %s table", async (type, table) => {
    const supabase = makeSupabase({
      tables: { [table]: { data: [{ id: "s1", discord_message_id: "m1" }] } },
    });
    const result = await submissions.getDiscordMessageId(
      makeCtx(supabase),
      type,
      "s1"
    );
    expect(result).toBe("m1");
  });

  it("returns null when count query fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: {
        equipment_submissions: { error: { message: "denied" } },
      },
    });
    expect(
      await submissions.getDiscordMessageId(
        makeCtx(supabase),
        "equipment",
        "s1"
      )
    ).toBeNull();
    spy.mockRestore();
  });

  it("returns null and warns when record is missing", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { equipment_submissions: { data: [] } },
    });
    expect(
      await submissions.getDiscordMessageId(
        makeCtx(supabase),
        "equipment",
        "missing"
      )
    ).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns first discord_message_id when multiple rows found", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: {
        equipment_submissions: {
          data: [
            { id: "s1", discord_message_id: "first" },
            { id: "s1", discord_message_id: "second" },
          ],
        },
      },
    });
    expect(
      await submissions.getDiscordMessageId(
        makeCtx(supabase),
        "equipment",
        "s1"
      )
    ).toBe("first");
    spy.mockRestore();
  });

  it("returns null when record has no discord_message_id", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: {
        equipment_submissions: {
          data: [{ id: "s1", discord_message_id: null }],
        },
      },
    });
    expect(
      await submissions.getDiscordMessageId(
        makeCtx(supabase),
        "equipment",
        "s1"
      )
    ).toBeNull();
    spy.mockRestore();
  });
});
