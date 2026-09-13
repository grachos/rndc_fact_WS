import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { usePerfilStore } from "../../store/perfilStore";
import { DataTable } from "../../components/DataTable";

type PorRemesaResp = {
  modo: "remesa";
  resultados: ({ consecutivo: string; ok: true; campos: Record<string, string> } | { consecutivo: string; ok: false; error: string })[];
};
type PorFacturaResp = {
  modo: "factura";
  resultados: ({ factura: string; ok: true; remesas: Record<string, string>[] } | { factura: string; ok: false; error: string })[];
};

export function ConsultarFacturaPorRemesa() {
  const { perfilActivoId } = usePerfilStore();
  const [generador, setGenerador] = useState("");
  const [remesas, setRemesas] = useState("");
  const [facturas, setFacturas] = useState("");
  const [resultado, setResultado] = useState<PorRemesaResp | PorFacturaResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function consultar() {
    if (!perfilActivoId) return;
    if (!generador.trim()) {
      setError("Escribe el NIT del generador.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ perfilId: String(perfilActivoId), generador: generador.trim() });
      if (facturas.trim()) params.set("facturas", facturas.trim());
      else if (remesas.trim()) params.set("remesas", remesas.trim());
      else {
        setError("Escribe una o varias remesas, o números de factura.");
        setLoading(false);
        return;
      }
      const data = await api.get<PorRemesaResp | PorFacturaResp>(`/facturacion/consultar-factura-remesa?${params}`);
      setResultado(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al consultar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">Consultar factura por remesa</h2>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!perfilActivoId && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">Selecciona un perfil activo arriba primero.</p>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          NIT del generador
          <input value={generador} onChange={(e) => setGenerador(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          N° de remesa(s)
          <textarea value={remesas} onChange={(e) => setRemesas(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <p className="text-center text-xs text-slate-400">— o —</p>
        <label className="block text-sm font-medium text-slate-700">
          N° de factura(s)
          <textarea value={facturas} onChange={(e) => setFacturas(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button
          type="button"
          disabled={loading || !perfilActivoId}
          onClick={consultar}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {loading ? "Consultando…" : "Consultar"}
        </button>
      </section>

      {resultado && resultado.modo === "remesa" && (
        <>
          <DataTable
            rows={resultado.resultados.filter((r): r is Extract<typeof r, { ok: true }> => r.ok).map((r) => r.campos)}
          />
          {resultado.resultados
            .filter((r): r is Extract<typeof r, { ok: false }> => !r.ok)
            .map((r) => (
              <p key={r.consecutivo} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {r.consecutivo}: {r.error}
              </p>
            ))}
        </>
      )}
      {resultado &&
        resultado.modo === "factura" &&
        resultado.resultados.map((r) => {
          if (r.ok) {
            return (
              <div key={r.factura} className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-600">Factura {r.factura}</h3>
                <DataTable rows={r.remesas} />
              </div>
            );
          }
          return (
            <p key={r.factura} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {r.factura}: {r.error}
            </p>
          );
        })}
    </div>
  );
}
