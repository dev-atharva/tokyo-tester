"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import {
  createInitialAdmin,
  isSetupComplete,
  normalizeEmail,
} from "./server/service";
import type { AuthActionState } from "./types";

function getRedirectTarget(value: FormDataEntryValue | null, fallback: string) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  return value;
}

function readTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!(await isSetupComplete())) {
    return { error: "Initial setup is required before anyone can sign in." };
  }

  const email = normalizeEmail(readTrimmedString(formData, "email"));
  const password = readTrimmedString(formData, "password");
  const redirectTo = getRedirectTarget(formData.get("redirectTo"), "/workflow");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    return { error: null, redirectTo };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password.", redirectTo: null };
    }

    throw error;
  }
}

export async function setupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(readTrimmedString(formData, "email"));
  const name = readTrimmedString(formData, "name");
  const password = readTrimmedString(formData, "password");
  const confirmPassword = readTrimmedString(formData, "confirmPassword");
  const redirectTo = getRedirectTarget(
    formData.get("redirectTo"),
    `/login?email=${encodeURIComponent(email)}&setup=success`,
  );

  if (!name || !email || !password || !confirmPassword) {
    return { error: "All setup fields are required." };
  }

  if (!email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters long." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    await createInitialAdmin({
      email,
      name,
      password,
    });

    return { error: null, redirectTo };
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message, redirectTo: null };
    }

    throw error;
  }
}
