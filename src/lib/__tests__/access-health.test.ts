import { describe, expect, it } from "vitest";
import { buildAccessHealthRows } from "@/lib/auth/access-health";

describe("buildAccessHealthRows", () => {
  it("flags auth users with no profile as missing_profile", () => {
    const [row] = buildAccessHealthRows({
      authUsers: [
        {
          id: "u1",
          email: "owner@example.com",
          created_at: "2026-01-01",
          invited_at: null,
          email_confirmed_at: "2026-01-01",
          last_sign_in_at: "2026-01-02",
        },
      ],
      profiles: [],
      roles: [{ user_id: "u1", role: "owner" }],
      invites: [],
    });
    expect(row.health).toBe("missing_profile");
    expect(row.profileStatus).toBe("missing");
    expect(row.role).toBe("owner");
  });

  it("keeps invited profiles pending until accepted", () => {
    const [row] = buildAccessHealthRows({
      authUsers: [
        {
          id: "u2",
          email: "erin@example.com",
          created_at: "2026-01-01",
          invited_at: "2026-01-01",
          email_confirmed_at: "2026-01-01",
          last_sign_in_at: "2026-01-02",
        },
      ],
      profiles: [
        {
          id: "u2",
          email: "erin@example.com",
          full_name: "Erin",
          status: "invited",
          accepted_at: null,
          last_login_at: null,
        },
      ],
      roles: [],
      invites: [{ email: "erin@example.com", status: "invited", created_at: "2026-01-01" }],
    });
    expect(row.health).toBe("pending_setup");
    expect(row.issues).toContain("Password setup is not complete.");
  });

  it("flags profile rows without auth users as orphan profiles", () => {
    const [row] = buildAccessHealthRows({
      authUsers: [],
      profiles: [
        {
          id: "p1",
          email: "old@example.com",
          full_name: "Old User",
          status: "active",
          accepted_at: "2026-01-01",
          last_login_at: null,
        },
      ],
      roles: [],
      invites: [],
    });
    expect(row.health).toBe("orphan_profile");
  });
});
