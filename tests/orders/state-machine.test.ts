import { describe, expect, it } from "vitest";
import { canTransition, allowedNextStatuses, isTerminalStatus } from "@/modules/orders/state-machine";

describe("canTransition", () => {
  it("allows the seller to confirm a pending order", () => {
    expect(canTransition("PENDING", "CONFIRMED", "SELLER")).toBe(true);
  });

  it("does not allow the buyer to confirm a pending order", () => {
    expect(canTransition("PENDING", "CONFIRMED", "BUYER")).toBe(false);
  });

  it("allows both buyer and seller to cancel a pending order", () => {
    expect(canTransition("PENDING", "CANCELLED", "BUYER")).toBe(true);
    expect(canTransition("PENDING", "CANCELLED", "SELLER")).toBe(true);
  });

  it("rejects a transition that skips steps (PENDING straight to DELIVERED)", () => {
    expect(canTransition("PENDING", "DELIVERED", "SELLER")).toBe(false);
  });

  it("rejects a transition that doesn't exist at all, even for admin", () => {
    // COMPLETED has no outgoing transitions defined anywhere in the table —
    // admin override only works for edges that exist for *some* actor.
    expect(canTransition("COMPLETED", "PENDING", "ADMIN")).toBe(false);
  });

  it("lets admin perform a transition normally reserved for another actor", () => {
    // CONFIRMED -> PREPARING is SELLER-only in the table, but admin can
    // still act on it as a support/override capability.
    expect(canTransition("CONFIRMED", "PREPARING", "ADMIN")).toBe(true);
  });

  it("only the buyer or system can mark an order DELIVERED after OUT_FOR_DELIVERY", () => {
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "BUYER")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "SYSTEM")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "SELLER")).toBe(false);
  });

  it("only admin can move a RETURNED order to REFUNDED", () => {
    expect(canTransition("RETURNED", "REFUNDED", "ADMIN")).toBe(true);
    expect(canTransition("RETURNED", "REFUNDED", "BUYER")).toBe(false);
    expect(canTransition("RETURNED", "REFUNDED", "SELLER")).toBe(false);
  });
});

describe("allowedNextStatuses", () => {
  it("lists both CONFIRMED and CANCELLED for the seller on a PENDING order", () => {
    const statuses = allowedNextStatuses("PENDING", "SELLER");
    expect(statuses).toContain("CONFIRMED");
    expect(statuses).toContain("CANCELLED");
    expect(statuses).not.toContain("FAILED");
  });

  it("lists only CANCELLED for the buyer on a PENDING order", () => {
    const statuses = allowedNextStatuses("PENDING", "BUYER");
    expect(statuses).toEqual(["CANCELLED"]);
  });

  it("returns an empty list for a terminal status like COMPLETED", () => {
    expect(allowedNextStatuses("COMPLETED", "ADMIN")).toEqual([]);
  });

  it("lets the buyer choose between COMPLETED, RETURNED, and DISPUTED after DELIVERED", () => {
    const statuses = allowedNextStatuses("DELIVERED", "BUYER");
    expect(statuses.sort()).toEqual(["COMPLETED", "DISPUTED", "RETURNED"].sort());
  });
});

describe("isTerminalStatus", () => {
  it.each(["CANCELLED", "FAILED", "COMPLETED", "REFUNDED"] as const)(
    "%s is terminal",
    (status) => {
      expect(isTerminalStatus(status)).toBe(true);
    },
  );

  it.each(["PENDING", "CONFIRMED", "PREPARING", "DELIVERED", "DISPUTED", "RETURNED"] as const)(
    "%s is not terminal",
    (status) => {
      expect(isTerminalStatus(status)).toBe(false);
    },
  );
});
