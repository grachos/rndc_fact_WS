import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Perfil } from "@fe-tool/shared";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { ConfirmDialog } from "../../components/ConfirmDialog";

export function PerfilesList() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Perfil | null>(null);

  function reload() {
    api
      .get<Perfil[]>("/perfiles")
      .then(setPerfiles)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar perfiles"));
  }

  useEffect(reload, []);

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await api.delete(`/perfiles/${toDelete.id}`);
      setToDelete(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el perfil");
      setToDelete(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Perfiles</h2>
        {isAdmin && (
          <Link
            to="/perfiles/nuevo"
            className="flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
          >
            <Plus size={15} /> Nuevo perfil
          </Link>
        )}
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">NIT socio</th>
              <th className="px-4 py-2">Usuario RNDC</th>
              <th className="px-4 py-2">Prefijo remesa</th>
              <th className="px-4 py-2">Plantilla XML</th>
              {isAdmin && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{p.nombre}</td>
                <td className="px-4 py-2 text-slate-600">{p.nitSocio}</td>
                <td className="px-4 py-2 text-slate-600">{p.rndcUsuario}</td>
                <td className="px-4 py-2 text-slate-600">{p.prefijoRemesa ? "Sí" : "No"}</td>
                <td className="px-4 py-2">
                  {p.hasXmlTemplate ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Lista</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Falta</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Link to={`/perfiles/${p.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                        <Pencil size={15} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setToDelete(p)}
                        className="rounded p-1 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {perfiles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No hay perfiles registrados aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Eliminar perfil "${toDelete?.nombre}"`}
        description="Esta acción no se puede deshacer. Las credenciales RNDC asociadas se eliminarán."
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
