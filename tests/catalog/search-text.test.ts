import { describe, expect, it } from "vitest";
import { normalizeArabicText, buildSearchText } from "@/modules/catalog/search-text";

describe("normalizeArabicText", () => {
  it("unifies hamza variants to bare alef", () => {
    expect(normalizeArabicText("أحمد")).toBe(normalizeArabicText("احمد"));
    expect(normalizeArabicText("إحمد")).toBe(normalizeArabicText("احمد"));
    expect(normalizeArabicText("آحمد")).toBe(normalizeArabicText("احمد"));
  });

  it("normalizes taa marbuta to haa", () => {
    expect(normalizeArabicText("سيارة")).toBe("سياره");
  });

  it("normalizes alef maqsura to yaa", () => {
    expect(normalizeArabicText("مستشفى")).toBe("مستشفي");
  });

  it("strips diacritics (tashkeel)", () => {
    expect(normalizeArabicText("مَرْحَبًا")).toBe("مرحبا");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeArabicText("  لابتوب   ديل  ")).toBe("لابتوب ديل");
  });
});

describe("buildSearchText", () => {
  it("joins title and description before normalizing", () => {
    expect(buildSearchText("سيارة", "بحالة ممتازة")).toBe("سياره بحاله ممتازه");
  });

  it("handles a missing description", () => {
    expect(buildSearchText("سيارة", undefined)).toBe("سياره");
    expect(buildSearchText("سيارة", null)).toBe("سياره");
  });
});
