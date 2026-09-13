import { useState } from "react";
import { UploadCloud } from "lucide-react";
import type { CargarRndcResultado } from "@fe-tool/shared";
import { apiUpload, ApiError } from "../../lib/api";
import { usePerfilStore } from "../../store/perfilStore";

interface Preview {
  archivo: string;
  nf: string;
  cufe: string;
  cliente: string;
  clienteNit: string;
  remesas: { consecutivo: string; radicado: string; valor: string }[];
  error?: string;
}

export function CargarRndc() {
  const { perfilActivoId } = usePerfilStore();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [resultados, setResultados] = useState<CargarRndcResultado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(list: FileList) {
    const arr = Array.from(list);
    setFiles(arr);
    setResultados([]);
    setConfirmado(false);
    setError(null);
    const form = new FormData();
    arr.forEach((f) => form.append("archivos", f));
    try {
      const res = await apiUpload("/facturacion/cargar-rndc/preview", form);
      setPreviews(await res.json());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo leer los archivos");
    }
  }

  async function onEnviar() {
    if (!perfilActivoId || files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("archivos", f));
      form.append("perfilId", String(perfilActivoId));
      const res = await apiUpload("/facturacion/cargar-rndc/enviar", form);
      setResultados(await res.json());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir las facturas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">Cargar facturas a RNDC</h2>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!perfilActivoId && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">Selecciona un perfil activo arriba primero.</p>
      )}

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 bg-white py-8 text-sm text-slate-500 hover:border-slate-400">
        <UploadCloud size={18} />
        {files.length > 0 ? `${files.length} archivo(s) seleccionados` : "Sube XML o ZIP (varios, mezclados)"}
        <input type="file" multiple accept=".xml,.zip" className="hidden" onChange={(e) => e.target.files && onFiles(e.target.files)} />
      </label>

      {previews.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">Archivo</th>
                <th className="px-3 py-2">N° Factura</th>
                <th className="px-3 py-2">CUFE</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Remesas</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((p) => (
                <tr key={p.archivo} className="border-t border-slate-100">
                  <td className="px-3 py-2">{p.archivo}</td>
                  <td className="px-3 py-2">{p.nf}</td>
                  <td className="px-3 py-2">{p.cufe}</td>
                  <td className="px-3 py-2">{p.cliente}</td>
                  <td className="px-3 py-2">{p.remesas.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previews.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
            Confirmo que quiero subir estas facturas al RNDC (operación real, no reversible)
          </label>
          <button
            type="button"
            disabled={!confirmado || loading || !perfilActivoId}
            onClick={onEnviar}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {loading ? "Subiendo…" : "Subir al RNDC"}
          </button>
        </div>
      )}

      {resultados.length > 0 && (
        <div className="space-y-3">
          {resultados.map((r) => (
            <div key={r.archivo} className={`rounded-lg border p-3 ${r.exito ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <p className="text-sm font-medium text-slate-800">
                {r.archivo} — Factura {r.numeroFactura}
              </p>
              <p className={`text-sm ${r.exito ? "text-green-700" : "text-red-700"}`}>{r.mensaje}</p>
              {r.remesas.length > 0 && (
                <ul className="mt-1 text-xs text-slate-500">
                  {r.remesas.map((rem) => (
                    <li key={rem.consecutivo}>
                      Remesa {rem.consecutivo}
                      {rem.radicado ? ` (radicado ${rem.radicado})` : ""}
                      {rem.mensaje ? ` — ${rem.mensaje}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
