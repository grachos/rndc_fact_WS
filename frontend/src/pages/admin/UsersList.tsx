import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import type { Perfil, Role, User } from "@fe-tool/shared";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface Asignacion {
  perfilIds: number[];
  perfilPredeterminadoId: number | null;
}

const SIN_ASIGNACION: Asignacion = { perfilIds: [], perfilPredeterminadoId: null };

function EmpresasPicker({
  perfiles,
  role,
  value,
  onChange,
}: {
  perfiles: Perfil[];
  role: Role;
  value: Asignacion;
  onChange: (v: Asignacion) => void;
}) {
  function toggle(id: number) {
    const seleccionada = value.perfilIds.includes(id);
    const perfilIds = seleccionada ? value.perfilIds.filter((x) => x !== id) : [...value.perfilIds, id];
    let predeterminado = value.perfilPredeterminadoId;
    if (seleccionada && predeterminado === id) predeterminado = perfilIds[0] ?? null;
    if (!seleccionada && predeterminado === null) predeterminado = id;
    onChange({ perfilIds, perfilPredeterminadoId: predeterminado });
  }

  return (
    <fieldset className="w-full">
      <legend className="text-sm text-slate-700">Empresas asignadas</legend>
      <p className="mb-2 text-xs text-slate-500">
        {role === "admin"
          ? "Los administradores pueden usar todas las empresas; la predeterminada es la que aparece seleccionada al iniciar sesión."
          : "El operador solo podrá ver y usar estas empresas. Si tiene varias, elige con cuál trabajar en la barra superior; la predeterminada aparece seleccionada al iniciar sesión."}
      </p>
      {perfiles.length === 0 ? (
        <p className="text-sm text-amber-700">Aún no hay empresas registradas. Créalas en "Empresas".</p>
      ) : (
        <div className="grid gap-1 sm:grid-cols-2">
          {perfiles.map((p) => {
            const checked = value.perfilIds.includes(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                  {p.nombre} <span className="text-xs text-slate-400">NIT {p.nitSocio}</span>
                </label>
                <label className={`flex items-center gap-1 text-xs ${checked ? "text-slate-600" : "text-slate-300"}`}>
                  <input
                    type="radio"
                    disabled={!checked}
                    checked={checked && value.perfilPredeterminadoId === p.id}
                    onChange={() => onChange({ ...value, perfilPredeterminadoId: p.id })}
                  />
                  Predeterminada
                </label>
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function UsersList() {
  const { user: me } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("operador");
  const [asignacion, setAsignacion] = useState<Asignacion>(SIN_ASIGNACION);
  const [saving, setSaving] = useState(false);

  const [editRole, setEditRole] = useState<Role>("operador");
  const [editPassword, setEditPassword] = useState("");
  const [editAsignacion, setEditAsignacion] = useState<Asignacion>(SIN_ASIGNACION);
  const [savingEdit, setSavingEdit] = useState(false);

  function reload() {
    api.get<User[]>("/users").then(setUsers).catch((err) => setError(err instanceof ApiError ? err.message : "Error"));
  }

  useEffect(() => {
    reload();
    api.get<Perfil[]>("/perfiles").then(setPerfiles).catch(() => setPerfiles([]));
  }, []);

  const nombreEmpresa = (id: number) => perfiles.find((p) => p.id === id)?.nombre ?? `#${id}`;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/users", { email, password, role, ...asignacion });
      setEmail("");
      setPassword("");
      setRole("operador");
      setAsignacion(SIN_ASIGNACION);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario");
    } finally {
      setSaving(false);
    }
  }

  function onStartEdit(u: User) {
    setEditing(u);
    setEditRole(u.role);
    setEditPassword("");
    setEditAsignacion({ perfilIds: u.perfilIds ?? [], perfilPredeterminadoId: u.perfilPredeterminadoId ?? null });
    setShowForm(false);
    setError(null);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setSavingEdit(true);
    try {
      const body: { role: Role; password?: string } & Asignacion = { role: editRole, ...editAsignacion };
      if (editPassword) body.password = editPassword;
      await api.patch(`/users/${editing.id}`, body);
      setEditing(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el usuario");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await api.delete(`/users/${toDelete.id}`);
      setToDelete(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el usuario");
      setToDelete(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Usuarios</h2>
        <button
          type="button"
          onClick={() => {
            setShowForm((s) => !s);
            setEditing(null);
          }}
          className="flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
        >
          <Plus size={15} /> Nuevo usuario
        </button>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <label className="text-sm text-slate-700">
            Correo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700">
            Contraseña
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700">
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <EmpresasPicker perfiles={perfiles} role={role} value={asignacion} onChange={setAsignacion} />
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {saving ? "Creando…" : "Crear"}
          </button>
        </form>
      )}

      {editing && (
        <form
          onSubmit={onSaveEdit}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <p className="w-full text-sm font-medium text-slate-700">Editando {editing.email}</p>
          <label className="text-sm text-slate-700">
            Rol
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as Role)}
              className="mt-1 block rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Nueva contraseña (opcional)
            <input
              type="password"
              minLength={8}
              placeholder="Dejar en blanco para no cambiar"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              className="mt-1 block w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <EmpresasPicker perfiles={perfiles} role={editRole} value={editAsignacion} onChange={setEditAsignacion} />
          <button
            type="submit"
            disabled={savingEdit}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {savingEdit ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Empresas</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2 font-medium text-slate-800">{u.email}</td>
                <td className="px-4 py-2 text-slate-600">{u.role}</td>
                <td className="px-4 py-2 text-slate-600">
                  {u.role === "admin" && <span className="text-slate-400">Todas</span>}
                  {u.role !== "admin" && (u.perfilIds?.length ?? 0) === 0 && (
                    <span className="text-amber-700">Sin empresas asignadas</span>
                  )}
                  {u.role !== "admin" &&
                    u.perfilIds?.map((id) => (
                      <span
                        key={id}
                        className={`mb-1 mr-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                          id === u.perfilPredeterminadoId ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"
                        }`}
                        title={id === u.perfilPredeterminadoId ? "Predeterminada" : undefined}
                      >
                        {nombreEmpresa(id)}
                      </span>
                    ))}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onStartEdit(u)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                    title="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  {u.id !== me?.id && (
                    <button
                      type="button"
                      onClick={() => setToDelete(u)}
                      className="ml-1 rounded p-1 text-red-500 hover:bg-red-50"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Eliminar usuario "${toDelete?.email}"`}
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
