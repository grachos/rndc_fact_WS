import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { usePerfilStore } from "../../store/perfilStore";
import { DataTable } from "../../components/DataTable";

type Resultado = { ok: true; numero?: string; campos: Record<string, string> } | { ok: false; numero?: string; error: string };

export function ConsultarFactura() {
  const { perfilActivoId } = usePerfilStore();
  const [numeros, setNumeros] = useState("");
  const [fechaInicial, setFechaInicial] = useState("");
  const [fechaFinal, setFechaFinal] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function consultar() {
    if (!perfilActivoId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ perfilId: String(perfilActivoId) });
      if (numeros.trim()) {
        params.set("numeros", numeros.trim());
      } else if (fechaInicial && fechaFinal) {
        params.set("fechaInicial", fechaInicial);
        params.set("fechaFinal", fechaFinal);
      } else {
        setError("Escribe uno o varios números de factura, o un rango de fechas.");
        setLoading(false);
        return;
      }
      const data = await api.get<Resultado[]>(`/facturacion/consultar-factura?${params}`);
      setResultados(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al consultar");
    } finally {
      setLoading(false);
    }
  }

  const filas = resultados.filter((r): r is Extract<Resultado, { ok: true }> => r.ok).map((r) => r.campos);
  const errores = resultados.filter((r): r is Extract<Resultado, { ok: false }> => !r.ok);

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">Consultar factura</h2>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!perfilActivoId && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">Selecciona un perfil activo arriba primero.</p>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          N° de factura(s) — separados por coma, espacio o salto de línea
          <textarea
            value={numeros}
            onChange={(e) => setNumeros(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-center text-xs text-slate-400">— o por rango de fecha (si no escribes número) —</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">
            Desde
            <input type="date" value={fechaInicial} onChange={(e) => setFechaInicial(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Hasta
            <input type="date" value={fechaFinal} onChange={(e) => setFechaFinal(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <button
          type="button"
          disabled={loading || !perfilActivoId}
          onClick={consultar}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {loading ? "Consultando…" : "Consultar"}
        </button>
      </section>

      {errores.length > 0 && (
        <div className="space-y-1">
          {errores.map((e, i) => (
            <p key={i} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {e.numero ? `${e.numero}: ` : ""}
              {e.error}
            </p>
          ))}
        </div>
      )}

      <DataTable rows={filas} emptyLabel="Sin facturas consultadas todavía." />
    </div>
  );
}
