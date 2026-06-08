/**
 * Typed wrappers around the GPOMS role & permission endpoints (Phase 1 RBAC).
 *
 * All mutations are admin-only on the backend.
 */

import { api } from "@/lib/api";
import type {
  PermissionGroup,
  RoleCreate,
  RoleDetail,
  RoleUpdate,
} from "@/lib/types";

export function listPermissions(): Promise<PermissionGroup[]> {
  return api.get<PermissionGroup[]>("/roles/permissions");
}

export function listRoles(): Promise<RoleDetail[]> {
  return api.get<RoleDetail[]>("/roles");
}

export function getRole(id: string): Promise<RoleDetail> {
  return api.get<RoleDetail>(`/roles/${id}`);
}

export function createRole(data: RoleCreate): Promise<RoleDetail> {
  return api.post<RoleDetail>("/roles", data);
}

export function updateRole(id: string, data: RoleUpdate): Promise<RoleDetail> {
  return api.patch<RoleDetail>(`/roles/${id}`, data);
}

export function deleteRole(id: string): Promise<void> {
  return api.delete<void>(`/roles/${id}`);
}
