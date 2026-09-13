import { create } from "zustand";
import type { Perfil } from "@fe-tool/shared";

interface PerfilState {
  perfilActivoId: number | null;
  setPerfilActivo: (id: number | null) => void;
}

const STORAGE_KEY = "fe-tool-perfil-activo";

export const usePerfilStore = create<PerfilState>((set) => ({
  perfilActivoId: (() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : null;
  })(),
  setPerfilActivo: (id) => {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
    set({ perfilActivoId: id });
  },
}));

export function perfilActivo(perfiles: Perfil[], id: number | null): Perfil | null {
  return perfiles.find((p) => p.id === id) ?? null;
}
