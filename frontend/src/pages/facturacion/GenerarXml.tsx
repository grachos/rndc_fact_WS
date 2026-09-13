import { useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import type { GenerarXmlInput, GenerarXmlResult, RemesaLinea } from "@fe-tool/shared";
import { api, ApiError } from "../../lib/api";
import { parseMonto } from "../../lib/numeros";
import { usePerfilStore } from "../../store/perfilStore";

function nuevaRemesa(): RemesaLinea {
  return { consecutivo: "", radicado: "", peso: "1", valor: 0, descripcionLinea: "Servicio de transporte" };
}

export function GenerarXml() {
  const { perfilActivoId } = usePerfilStore();
  const [numeroFactura, setNumeroFactura] = useState("");
  const [cufe, setCufe] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [nitCliente, setNitCliente] = useState("");
  const [digitoCliente, setDigitoCliente] = useState("");
  const [nombreCliente, setNombreCliente] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [remesas, setRemesas] = useState<RemesaLinea[]>([nuevaRemesa()]);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [consultando, setConsultando] = useState<number | null>(null);

  function setRemesa(idx: number, patch: Partial<RemesaLinea>) {
    setRemesas((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function consultarRadicado(idx: number) {
    if (!perfilActivoId) return;
    const consecutivo = remesas[idx]!.consecutivo;
    if (!consecutivo) return;
    setConsultando(idx);
    try {
      const data = await api.get<{ radicado: string; peso: string }>(
        `/facturacion/consultar-radicado/${encodeURIComponent(consecutivo)}?perfilId=${perfilActivoId}`
      );
      setRemesa(idx, { radicado: data.radicado, peso: data.peso || remesas[idx]!.peso });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo consultar el radicado");
    } finally {
      setConsultando(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!perfilActivoId) {
      setError("Selecciona un perfil activo arriba primero.");
      return;
    }
    setError(null);
    setAvisos([]);
    setSaving(true);
    try {
      const input: GenerarXmlInput = {
        perfilId: perfilActivoId,
        numeroFactura,
        cufe,
        fecha,
        nitCliente,
        digitoCliente,
        nombreCliente,
        valorTotal: parseMonto(valorTotal),
        remesas,
      };
      const result = await api.post<GenerarXmlResult>("/facturacion/generar-xml", input);
      setAvisos(result.avisos);
      const blob = new Blob([result.xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el XML");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">Generar XML</h2>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {avisos.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {avisos.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      )}
      {!perfilActivoId && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">Selecciona un perfil activo arriba primero.</p>
      )}

      <section className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-700">
          N° de factura
          <input required value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          CUFE
          <input required value={cufe} onChange={(e) => setCufe(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Fecha
          <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Valor total
          <input required value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </section>

      <section className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-700">
          NIT cliente
          <input required value={nitCliente} onChange={(e) => setNitCliente(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Dígito verificación
          <input required value={digitoCliente} onChange={(e) => setDigitoCliente(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="col-span-2 text-sm font-medium text-slate-700">
          Nombre cliente
          <input required value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-600">Remesas</h3>
          <button
            type="button"
            onClick={() => setRemesas((rs) => [...rs, nuevaRemesa()])}
            className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            <Plus size={13} /> Agregar remesa
          </button>
        </div>
        <div className="space-y-3">
          {remesas.map((r, idx) => (
            <div key={idx} className="grid grid-cols-6 items-end gap-2 rounded-md border border-slate-100 p-2">
              <label className="text-xs text-slate-500">
                Consecutivo
                <input required value={r.consecutivo} onChange={(e) => setRemesa(idx, { consecutivo: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                Radicado
                <input value={r.radicado} onChange={(e) => setRemesa(idx, { radicado: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                Peso
                <input value={r.peso} onChange={(e) => setRemesa(idx, { peso: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                Valor
                <input defaultValue={r.valor} onBlur={(e) => setRemesa(idx, { valor: parseMonto(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                Descripción
                <input value={r.descripcionLinea} onChange={(e) => setRemesa(idx, { descripcionLinea: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Consultar radicado/peso en el RNDC"
                  disabled={consultando === idx}
                  onClick={() => consultarRadicado(idx)}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Search size={14} />
                </button>
                <button
                  type="button"
                  disabled={remesas.length <= 1}
                  onClick={() => setRemesas((rs) => rs.filter((_, i) => i !== idx))}
                  className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
      >
        {saving ? "Generando…" : "Generar y descargar XML"}
      </button>
    </form>
  );
}
