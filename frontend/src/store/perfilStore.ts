import { create } from "zustand";
import type { Perfil } from "@fe-tool/shared";
import { api } from "../lib/api";

interface PerfilState {
  perfilActivoId: number | null;
  /** Empresas the logged-in user can work with (all of them for admins). */
  perfiles: Perfil[];
  setPerfilActivo: (id: number | null) => void;
  setPerfiles: (perfiles: Perfil[]) => void;
  /** Re-fetches the user's empresas (call after creating/editing/deleting one) and keeps
   * the active one valid: current choice if still allowed, else default, else the first. */
  recargarPerfiles: () => Promise<void>;
}

const STORAGE_KEY = "fe-tool-perfil-activo";

export const usePerfilStore = create<PerfilState>((set) => ({
  perfilActivoId: (() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : null;
  })(),
  perfiles: [],
  setPerfilActivo: (id) => {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
    set({ perfilActivoId: id });
  },
  setPerfiles: (perfiles) => set({ perfiles }),
  recargarPerfiles: async () => {
    let list: Perfil[];
    try {
      list = await api.get<Perfil[]>("/perfiles");
    } catch {
      list = [];
    }
    set({ perfiles: list });
    const { perfilActivoId, setPerfilActivo } = usePerfilStore.getState();
    if (perfilActivoId === null || !list.some((p) => p.id === perfilActivoId)) {
      setPerfilActivo((list.find((p) => p.predeterminado) ?? list[0])?.id ?? null);
    }
  },
}));

export function perfilActivo(perfiles: Perfil[], id: number | null): Perfil | null {
  return perfiles.find((p) => p.id === id) ?? null;
}
