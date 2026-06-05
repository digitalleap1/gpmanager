/**
 * Typed wrappers around the GPOMS auth endpoints.
 * `login` persists tokens; `logout` best-effort calls the endpoint then clears.
 */

import { api } from "@/lib/api";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/auth-tokens";
import type {
  ForgotPasswordResponse,
  LoginResponse,
  MessageResponse,
  UpdateProfileRequest,
  User,
} from "@/lib/types";

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const data = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function logout(): Promise<void> {
  const refresh_token = getRefreshToken();
  // Best-effort: tell the backend to revoke, but always clear locally.
  try {
    if (refresh_token) {
      await api.post<void>("/auth/logout", { refresh_token });
    }
  } catch {
    // Ignore network/401 errors — we clear tokens regardless.
  } finally {
    clearTokens();
  }
}

export function getMe(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function updateProfile(data: UpdateProfileRequest): Promise<User> {
  return api.patch<User>("/auth/me", data);
}

export function changePassword(
  current_password: string,
  new_password: string,
): Promise<MessageResponse> {
  return api.post<MessageResponse>("/auth/change-password", {
    current_password,
    new_password,
  });
}

export function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return api.post<ForgotPasswordResponse>("/auth/forgot-password", { email });
}

export function resetPassword(
  token: string,
  new_password: string,
): Promise<MessageResponse> {
  return api.post<MessageResponse>("/auth/reset-password", {
    token,
    new_password,
  });
}
