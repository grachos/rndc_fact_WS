import { useRef, useState } from "react";
import { Download, UploadCloud } from "lucide-react";
import { apiUpload, ApiError } from "../../lib/api";
import { usePerfilStore } from "../../store/perfilStore";

const CAMPOS: [string, string, boolean][] = [
  ["col_nf", "Número de factura", true],
  ["col_cufe", "CUFE", true],
  ["col_fecha", "Fecha de generación", true],
  ["col_consec", "Consecutivo / Remesa", true],
  ["col_radicado", "Radicado (opcional)", false],
  ["col_val_rem", "Valor unitario remesa ($)", true],
  ["col_val_fac", "Valor total factura ($)", true],
  ["col_peso", "Peso KGM (opcional)", false],
  ["col_desc_lin", "Descripción línea (opcional)", false],
  ["col_nit_cli", "NIT cliente (opcional)", false],
  ["col_nom_cli", "Nombre cliente (opcional)", false],
  ["col_novedad", "Novedad remesa (opcional)", false],
  ["col_estado", "Estado (opcional)", false],
];

const FILTROS = [
  "Todas (sin filtro)",
  "Solo Reconstruir = Sí",
  "Reconstruir = Sí y Novedad vacía",
  "Reconstruir Sí / condiciones ideales",
  "Coinciden remesas, NO coincide valor",
  "Coincide valor, NO coinciden remesas",
  "NO coinciden remesas",
  "NO coincide valor",
];

export function GenerarExcel() {
  const { perfilActivoId } = usePerfilStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState(FILTROS[0]!);
  const [nitCliFijo, setNitCliFijo] = useState("");
  const [digCliFijo, setDigCliFijo] = useState("");
  const [nomCliFijo, setNomCliFijo] = useState("");
  const [autoConsultarRadicado, setAutoConsultarRadicado] = useState(true);
  const [loadingCols, setLoadingCols] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{
    generadas: number;
    rechazadas: { numeroFactura: string; error: string }[];
    totalRechazadas: number;
  } | null>(null);

  async function onFileChange(f: File) {
    setFile(f);
    setError(null);
    setLoadingCols(true);
    try {
      const form = new FormData();
      form.append("archivo", f);
      const res = await apiUpload("/facturacion/excel/columnas", form);
      const data = await res.json();
      setColumns(data.columns);
      setMapping(data.autoMapeo);
      setFilas(data.filas);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo leer el archivo");
    } finally {
      setLoadingCols(false);
    }
  }

  async function onGenerar() {
    if (!file || !perfilActivoId) return;
    setError(null);
    setResultado(null);
    setGenerating(true);
    try {
      const form = new FormData();
      form.append("archivo", file);
      form.append("perfilId", String(perfilActivoId));
      form.append("mapping", JSON.stringify(mapping));
      form.append("filtro", filtro);
      form.append("nitCliFijo", nitCliFijo);
      form.append("digCliFijo", digCliFijo);
      form.append("nomCliFijo", nomCliFijo);
      form.append("autoConsultarRadicado", String(autoConsultarRadicado));
      const res = await apiUpload("/facturacion/excel/generar", form);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "facturas_generadas.zip";
      a.click();
      URL.revokeObjectURL(url);
      let rechazadas: { numeroFactura: string; error: string }[] = [];
      try {
        rechazadas = JSON.parse(decodeURIComponent(res.headers.get("X-Rechazos") ?? "%5B%5D"));
      } catch {
        rechazadas = [];
      }
      setResultado({
        generadas: Number(res.headers.get("X-Facturas-Generadas") ?? 0),
        rechazadas,
        totalRechazadas: Number(res.headers.get("X-Facturas-Rechazadas") ?? rechazadas.length),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el lote");
      if (err instanceof ApiError && Array.isArray(err.body?.rechazadas)) {
        setResultado({ generadas: 0, rechazadas: err.body.rechazadas, totalRechazadas: err.body.rechazadas.length });
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Generar facturas vía Excel</h2>
        <a
          href="/plantilla_generar_facturas.xlsx"
          download
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <Download size={16} />
          Descargar plantilla Excel
        </a>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {resultado && (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          {resultado.generadas > 0 && (
            <p className="text-green-700">{resultado.generadas} factura(s) generada(s) en el .zip.</p>
          )}
          {resultado.totalRechazadas > 0 && (
            <>
              <p className="font-medium text-red-700">
                {resultado.totalRechazadas} factura(s) NO se generaron porque tienen errores — corrígelas y vuelve a
                generar:
              </p>
              <ul className="space-y-2">
                {resultado.rechazadas.map((r) => (
                  <li key={r.numeroFactura} className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                    <span className="font-medium">Factura {r.numeroFactura}</span>
                    <p className="whitespace-pre-line text-xs">{r.error}</p>
                  </li>
                ))}
              </ul>
              {resultado.totalRechazadas > resultado.rechazadas.length && (
                <p className="text-xs text-slate-500">
                  Se muestran las primeras {resultado.rechazadas.length}; la lista completa está en _resumen.json dentro
                  del .zip.
                </p>
              )}
            </>
          )}
        </section>
      )}
      {!perfilActivoId && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">Selecciona una empresa en la barra superior primero.</p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 py-8 text-sm text-slate-500 hover:border-slate-400">
          <UploadCloud size={18} />
          {file ? file.name : "Sube un Excel (.xlsx)"}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileChange(e.target.files[0])}
          />
        </label>
        {loadingCols && <p className="mt-2 text-sm text-slate-400">Leyendo columnas…</p>}
        {filas !== null && <p className="mt-2 text-sm text-slate-500">{filas} filas detectadas.</p>}
      </section>

      {columns.length > 0 && (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-600">Mapeo de columnas</h3>
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS.map(([key, label, required]) => (
                <label key={key} className="text-xs text-slate-600">
                  {label}
                  {required && <span className="text-red-500"> *</span>}
                  <select
                    value={mapping[key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— No usar —</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4">
            <label className="text-sm font-medium text-slate-700">
              Filtro
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                {FILTROS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={autoConsultarRadicado} onChange={(e) => setAutoConsultarRadicado(e.target.checked)} />
              Auto-consultar radicado/peso en el RNDC
            </label>
            <label className="text-sm font-medium text-slate-700">
              NIT cliente por defecto
              <input value={nitCliFijo} onChange={(e) => setNitCliFijo(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Dígito verificación por defecto
              <input value={digCliFijo} onChange={(e) => setDigCliFijo(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="col-span-2 text-sm font-medium text-slate-700">
              Nombre cliente por defecto
              <input value={nomCliFijo} onChange={(e) => setNomCliFijo(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </section>

          <button
            type="button"
            disabled={generating || !perfilActivoId}
            onClick={onGenerar}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {generating ? "Generando lote…" : "Generar y descargar .zip"}
          </button>
        </>
      )}
    </div>
  );
}
