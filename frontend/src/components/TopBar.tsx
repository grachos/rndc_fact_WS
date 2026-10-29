import { useEffect } from "react";
import { LogOut } from "lucide-react";
import type { Perfil } from "@fe-tool/shared";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { usePerfilStore } from "../store/perfilStore";

export function TopBar() {
  const { user, logout } = useAuthStore();
  const { perfilActivoId, setPerfilActivo, perfiles, setPerfiles } = usePerfilStore();

  useEffect(() => {
    api
      .get<Perfil[]>("/perfiles")
      .then((list) => {
        setPerfiles(list);
        // Keep the current choice only if it's still one of this user's empresas;
        // otherwise fall back to their default, then to the first one.
        const actual = usePerfilStore.getState().perfilActivoId;
        if (actual === null || !list.some((p) => p.id === actual)) {
          const predeterminada = list.find((p) => p.predeterminado) ?? list[0];
          setPerfilActivo(predeterminada?.id ?? null);
        }
      })
      .catch(() => setPerfiles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <label htmlFor="perfil-activo" className="text-sm text-slate-500">
          Empresa:
        </label>
        <select
          id="perfil-activo"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={perfilActivoId ?? ""}
          onChange={(e) => setPerfilActivo(e.target.value ? Number(e.target.value) : null)}
        >
          {perfiles.length === 0 && (
            <option value="">{user?.role === "admin" ? "Sin empresas registradas" : "Sin empresas asignadas"}</option>
          )}
          {perfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {p.predeterminado ? " (predeterminada)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>
          {user?.email} <span className="text-slate-400">({user?.role})</span>
        </span>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
        >
          <LogOut size={15} />
          Salir
        </button>
      </div>
    </header>
  );
}
