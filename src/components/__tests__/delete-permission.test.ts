import { describe, it, expect } from "vitest";
import { canDeleteWithRoles } from "../delete-button";

describe("who can delete records", () => {
  it("allows admins", () => expect(canDeleteWithRoles(["admin"])).toBe(true));
  it("allows managers", () => expect(canDeleteWithRoles(["manager"])).toBe(true));
  it("blocks cashiers, store keepers and accountants", () =>
    expect(canDeleteWithRoles(["cashier", "storekeeper", "accountant"])).toBe(false));
});
