/**
 * Typed wrappers around the GPOMS team-management endpoints (Phase 1 RBAC).
 *
 * Reads are open to managers; mutations are admin-only on the backend.
 */

import { api } from "@/lib/api";
import type {
  OrgHierarchy,
  TeamCreate,
  TeamListItem,
  TeamRead,
  TeamUpdate,
} from "@/lib/types";

export function listTeams(): Promise<TeamListItem[]> {
  return api.get<TeamListItem[]>("/teams");
}

export function getOrgHierarchy(): Promise<OrgHierarchy> {
  return api.get<OrgHierarchy>("/teams/hierarchy");
}

export function getTeam(id: string): Promise<TeamRead> {
  return api.get<TeamRead>(`/teams/${id}`);
}

export function createTeam(data: TeamCreate): Promise<TeamRead> {
  return api.post<TeamRead>("/teams", data);
}

export function updateTeam(id: string, data: TeamUpdate): Promise<TeamRead> {
  return api.patch<TeamRead>(`/teams/${id}`, data);
}

export function deleteTeam(id: string): Promise<void> {
  return api.delete<void>(`/teams/${id}`);
}

export function addTeamMembers(
  id: string,
  user_ids: string[],
): Promise<TeamRead> {
  return api.post<TeamRead>(`/teams/${id}/members`, { user_ids });
}

export function removeTeamMember(
  id: string,
  userId: string,
): Promise<TeamRead> {
  return api.delete<TeamRead>(`/teams/${id}/members/${userId}`);
}

export function moveTeamMember(
  id: string,
  user_id: string,
): Promise<TeamRead> {
  return api.post<TeamRead>(`/teams/${id}/move-member`, { user_id });
}
