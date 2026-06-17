export type ProfileStatus = "invited" | "active" | "suspended";

export function requiresPasswordSetup(status: ProfileStatus | null | undefined): boolean {
  return status === "invited";
}

export function canEnterApp(status: ProfileStatus | null | undefined): boolean {
  return status === "active";
}
