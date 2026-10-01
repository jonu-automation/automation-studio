import { getAuth } from "@clerk/express";
import type { Request } from "express";

export const localMode = process.env.LOCAL_MODE === "true";
if (localMode && process.env.NODE_ENV === "production") {
  throw new Error("LOCAL_MODE is for loopback development only; it cannot run in production.");
}
export function requestAuth(req: Request) {
  return localMode
    ? { userId: "local-owner", sessionClaims: { email: "owner@localhost" } }
    : getAuth(req);
}
