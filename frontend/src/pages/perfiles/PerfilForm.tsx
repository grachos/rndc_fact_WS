import { useEffect, useState } from "react";
import type { FormEvent, InputHTMLAttributes } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UploadCloud, Trash2, FileCheck2 } from "lucide-react";
import type { PerfilInput, Perfil } from "@fe-tool/shared";
import { api, apiUpload, ApiError } from "../../lib/api";

const empty: PerfilInput = {
  nombre: "",
  nitSocio: "",
  prefijoRemesa: false,
  nitMonitoreo: "",
  rndcUsuario: "",
  rndcPassword: "",
  rndcUsuarioCorregir: "",
  rndcPasswordCorregir: "",
  rndcUsuarioMonitoreo: "",
  rndcPasswordMonitoreo: "",
};

function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        {...props}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

export function PerfilForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<PerfilInput>(empty);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  function reload() {
    if (!id) return;
    api.get<Perfil>(`/perfiles/${id}`).then((p) => {
      setPerfil(p);
      setForm({
        nombre: p.nombre,
        nitSocio: p.nitSocio,
        prefijoRemesa: p.prefijoRemesa,
        nitMonitoreo: p.nitMonitoreo ?? "",
        rndcUsuario: p.rndcUsuario,
        rndcPassword: "",
        rndcUsuarioCorregir: p.rndcUsuarioCorregir ?? "",
        rndcPasswordCorregir: "",
        rndcUsuarioMonitoreo: p.rndcUsuarioMonitoreo ?? "",
        rndcPasswordMonitoreo: "",
      });
    });
  }

  useEffect(reload, [id]);

  function set<K extends keyof PerfilInput>(key: K, value: PerfilInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/perfiles/${id}`, form);
        navigate("/perfiles");
      } else {
        const created = await api.post<Perfil>("/perfiles", form);
        // Redirect into edit mode so the XML template can be uploaded right away.
        navigate(`/perfiles/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadTemplate(file: File) {
    if (!id) return;
    setError(null);
    setUploadingTemplate(true);
    try {
      const form = new FormData();
      form.append("archivo", file);
      const res = await apiUpload(`/perfiles/${id}/xml-template`, form);
      setPerfil(await res.json());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir la plantilla");
    } finally {
      setUploadingTemplate(false);
    }
  }

  async function onDeleteTemplate() {
    if (!id) return;
    setError(null);
    try {
      setPerfil(await api.delete<Perfil>(`/perfiles/${id}/xml-template`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la plantilla");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <form onSubmit={onSubmit} className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800">
          {isEdit ? "Editar perfil" : "Nuevo perfil"}
        </h2>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <section className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <Field label="Nombre del perfil" required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
          <Field label="NIT del socio (NUMNITEMPRESATRANSPORTE)" required value={form.nitSocio} onChange={(e) => set("nitSocio", e.target.value)} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.prefijoRemesa}
              onChange={(e) => set("prefijoRemesa", e.target.checked)}
            />
            Prefijo &quot;0&quot; en consecutivo de remesa
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Credenciales RNDC (normales)</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Usuario RNDC" required value={form.rndcUsuario} onChange={(e) => set("rndcUsuario", e.target.value)} />
            <Field
              label={isEdit ? "Contraseña RNDC (dejar en blanco para no cambiar)" : "Contraseña RNDC"}
              type="password"
              required={!isEdit}
              value={form.rndcPassword ?? ""}
              onChange={(e) => set("rndcPassword", e.target.value)}
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Credenciales de corrección (opcional)</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Usuario corrección" value={form.rndcUsuarioCorregir ?? ""} onChange={(e) => set("rndcUsuarioCorregir", e.target.value)} />
            <Field label="Contraseña corrección" type="password" value={form.rndcPasswordCorregir ?? ""} onChange={(e) => set("rndcPasswordCorregir", e.target.value)} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Credenciales de monitoreo / GPS (opcional)</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="NIT monitoreo (EMF)" value={form.nitMonitoreo ?? ""} onChange={(e) => set("nitMonitoreo", e.target.value)} />
            <Field label="Usuario monitoreo" value={form.rndcUsuarioMonitoreo ?? ""} onChange={(e) => set("rndcUsuarioMonitoreo", e.target.value)} />
            <Field label="Contraseña monitoreo" type="password" value={form.rndcPasswordMonitoreo ?? ""} onChange={(e) => set("rndcPasswordMonitoreo", e.target.value)} />
          </div>
        </section>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear y continuar"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/perfiles")}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      </form>

      {isEdit && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-600">Plantilla XML</h3>
          <p className="mb-3 text-xs text-slate-500">
            Sube una factura electrónica real y ya válida de esta empresa (un XML que el RNDC/DIAN ya aceptó). Cada
            factura nueva se genera editando el número, CUFE, fecha, cliente y remesas de esta plantilla — todo lo
            demás (firma, certificado, autorización DIAN, dirección) se conserva tal cual.
          </p>
          {perfil?.hasXmlTemplate ? (
            <div className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              <span className="flex items-center gap-2">
                <FileCheck2 size={16} /> {perfil.xmlTemplateNombre}
              </span>
              <button type="button" onClick={onDeleteTemplate} className="flex items-center gap-1 text-red-600 hover:underline">
                <Trash2 size={14} /> Quitar
              </button>
            </div>
          ) : (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Sin plantilla — no podrás generar facturas para este perfil hasta que subas una.
            </p>
          )}
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 py-6 text-sm text-slate-500 hover:border-slate-400">
            <UploadCloud size={16} />
            {uploadingTemplate ? "Subiendo…" : perfil?.hasXmlTemplate ? "Reemplazar plantilla" : "Subir plantilla XML"}
            <input
              type="file"
              accept=".xml"
              className="hidden"
              disabled={uploadingTemplate}
              onChange={(e) => e.target.files?.[0] && onUploadTemplate(e.target.files[0])}
            />
          </label>
        </section>
      )}
    </div>
  );
}
