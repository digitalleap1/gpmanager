/**
 * Typed wrappers around the GPOMS user-management endpoints.
 *
 * Reads (list / roles) are open to managers — the assignee pickers across the
 * app rely on `listUsers`. All mutations are admin-only on the backend.
 */

import { api } from "@/lib/api";
import type {
  MessageResponse,
  RoleRead,
  UserAdminRead,
  UserCreate,
  UserUpdate,
} from "@/lib/types";

export function listUsers(search?: string): Promise<UserAdminRead[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return api.get<UserAdminRead[]>(`/users${qs}`);
}

export function listRoles(): Promise<RoleRead[]> {
  return api.get<RoleRead[]>("/users/roles");
}

export function createUser(data: UserCreate): Promise<UserAdminRead> {
  return api.post<UserAdminRead>("/users", data);
}

export function updateUser(
  id: string,
  data: UserUpdate,
): Promise<UserAdminRead> {
  return api.patch<UserAdminRead>(`/users/${id}`, data);
}

export function resetUserPassword(
  id: string,
  new_password: string,
): Promise<MessageResponse> {
  return api.post<MessageResponse>(`/users/${id}/reset-password`, {
    new_password,
  });
}

export function deleteUser(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}`);
}
