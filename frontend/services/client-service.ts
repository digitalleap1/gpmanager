/**
 * Typed wrappers around the GPOMS client endpoints.
 *
 * Reads (list / detail) are open to managers; deletes are admin-only on the
 * backend (a 403 should be surfaced to the user).
 */

import { api } from "@/lib/api";
import type {
  ClientCreate,
  ClientDetail,
  ClientListItem,
  ClientUpdate,
} from "@/lib/types";

export function listClients(): Promise<ClientListItem[]> {
  return api.get<ClientListItem[]>("/clients");
}

export function getClient(id: string): Promise<ClientDetail> {
  return api.get<ClientDetail>(`/clients/${id}`);
}

export function createClient(data: ClientCreate): Promise<ClientDetail> {
  return api.post<ClientDetail>("/clients", data);
}

export function updateClient(
  id: string,
  data: ClientUpdate,
): Promise<ClientDetail> {
  return api.patch<ClientDetail>(`/clients/${id}`, data);
}

export function deleteClient(id: string): Promise<void> {
  return api.delete<void>(`/clients/${id}`);
}
