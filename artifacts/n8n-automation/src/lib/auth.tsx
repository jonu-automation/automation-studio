import type { ComponentProps } from "react";
import * as Clerk from "@clerk/react";
import { Redirect } from "wouter";

const localMode = import.meta.env.VITE_LOCAL_MODE === "true";
const localUser = { id: "local-owner", firstName: "Local owner", imageUrl: "", emailAddresses: [{ emailAddress: "owner@localhost" }] };
const localClerk = {
  signOut: async (_options?: { redirectUrl?: string }) => {},
  addListener: (listener: (state: { user: typeof localUser }) => void) => {
    listener({ user: localUser });
    return () => {};
  },
};
export function ClerkProvider(props: ComponentProps<typeof Clerk.ClerkProvider>) {
  return localMode ? <>{props.children}</> : <Clerk.ClerkProvider {...props} />;
}
export function Show(props: ComponentProps<typeof Clerk.Show>) {
  if (localMode) return props.when === "signed-in" ? <>{props.children}</> : null;
  return <Clerk.Show {...props} />;
}
export function SignIn(props: ComponentProps<typeof Clerk.SignIn>) {
  return localMode ? <Redirect to="/dashboard" /> : <Clerk.SignIn {...props} />;
}
export function SignUp(props: ComponentProps<typeof Clerk.SignUp>) {
  return localMode ? <Redirect to="/dashboard" /> : <Clerk.SignUp {...props} />;
}
export function useUser() {
  return localMode ? { user: localUser } : Clerk.useUser();
}
export function useClerk() {
  return localMode ? localClerk : Clerk.useClerk();
}
