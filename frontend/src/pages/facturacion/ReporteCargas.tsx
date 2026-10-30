import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, CloudDownload } from "lucide-react";
import type { CargaRndcReporte, Perfil } from "@fe-tool/shared";
import { api, ApiError } from "../../lib/api";

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "true", label: "Exitosas" },
  { value: "false", label: "Fallidas" },
];

function toCsvValue(v: string | number | boolean): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function descargarCsv(filas: CargaRndcReporte[]) {
  const encabezados = [
    "Fecha",
    "Perfil",
    "Usuario",
    "Archivo",
    "N° Factura",
    "Estado",
    "Respuesta WS (RNDC)",
    "Remesas",
  ];
  const lineas = [
    encabezados.join(","),
    ...filas.map((f) =>
      [
        f.createdAt,
        f.perfilNombre,
        f.usuarioEmail,
        f.archivo,
        f.numeroFactura,
        f.exito ? "Exitosa" : "Fallida",
        f.mensaje,
        f.remesas,
      ]
        .map(toCsvValue)
        .join(",")
    ),
  ];
  const blob = new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte_cargas_rndc_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function hoyColombia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Recovers past uploads the app didn't log, from the invoices the RNDC has registered. */
function ImportarDelRndc({ perfiles, alTerminar }: { perfiles: Perfil[]; alTerminar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(() => sumarDias(hoyColombia(), -30));
  const [hasta, setHasta] = useState(hoyColombia);
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [resumen, setResumen] = useState<{ encontradas: number; nuevas: number; avisos: string[] } | null>(null);

  async function importar() {
    setCorriendo(true);
    setResumen(null);
    const total = { encontradas: 0, nuevas: 0, avisos: [] as string[] };
    try {
      for (const p of perfiles) {
        for (let ini = desde; ini <= hasta; ini = sumarDias(ini, 7)) {
          const fin = sumarDias(ini, 6) < hasta ? sumarDias(ini, 6) : hasta;
          setProgreso(`${p.nombre}: ${ini} a ${fin}…`);
          try {
            const r = await api.post<{ encontradas: number; nuevas: number; aviso?: string }>(
              "/facturacion/reporte-cargas/importar-rndc",
              { perfilId: p.id, desde: ini, hasta: fin }
            );
            total.encontradas += r.encontradas;
            total.nuevas += r.nuevas;
            // Days with no invoices come back as "no records" from the RNDC — not worth showing.
            if (r.aviso && !/RNDC11|no\s+(se\s+)?encontr|no hay registros/i.test(r.aviso)) {
              total.avisos.push(`${p.nombre} (${ini} a ${fin}): ${r.aviso}`);
            }
          } catch (err) {
            total.avisos.push(`${p.nombre} (${ini} a ${fin}): ${err instanceof ApiError ? err.message : "error de conexión"}`);
          }
        }
      }
    } finally {
      setResumen(total);
      setProgreso("");
      setCorriendo(false);
      alTerminar();
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <CloudDownload size={16} />
        Importar del RNDC
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">
      <p className="text-slate-700">
        Trae al reporte las facturas que el RNDC tiene registradas para cada empresa en el rango de fechas de factura
        (las que se enviaron antes de que el reporte las registrara). Quedan como{" "}
        <strong>"Importada del RNDC"</strong>: el RNDC no guarda qué usuario de la aplicación las envió. No duplica
        las que ya están en el reporte.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          Desde (fecha de factura)
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-600">
          Hasta
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <button
          type="button"
          disabled={corriendo || !desde || !hasta || perfiles.length === 0}
          onClick={importar}
          className="rounded-md bg-sky-700 px-3 py-1.5 font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {corriendo ? "Importando…" : `Importar (${perfiles.length} empresa(s))`}
        </button>
        {!corriendo && (
          <button type="button" onClick={() => setAbierto(false)} className="px-2 py-1.5 text-slate-500 hover:text-slate-700">
            Cerrar
          </button>
        )}
      </div>
      {progreso && <p className="text-slate-600">Consultando {progreso}</p>}
      {resumen && (
        <div className="space-y-1">
          <p className="font-medium text-slate-800">
            {resumen.encontradas} factura(s) encontradas en el RNDC · {resumen.nuevas} nueva(s) agregadas al reporte.
          </p>
          {resumen.avisos.length > 0 && (
            <ul className="list-disc pl-5 text-amber-800">
              {resumen.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function ReporteCargas() {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [filas, setFilas] = useState<CargaRndcReporte[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [perfilId, setPerfilId] = useState("");
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    api.get<Perfil[]>("/perfiles").then(setPerfiles).catch(() => {});
  }, []);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (perfilId) params.set("perfilId", perfilId);
      if (estado) params.set("exito", estado);
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      const qs = params.toString();
      const data = await api.get<CargaRndcReporte[]>(`/facturacion/reporte-cargas${qs ? `?${qs}` : ""}`);
      setFilas(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = filas.length;
    const exitosas = filas.filter((f) => f.exito).length;
    const fallidas = total - exitosas;
    const tasa = total > 0 ? Math.round((exitosas / total) * 100) : 0;
    return { total, exitosas, fallidas, tasa };
  }, [filas]);

  const porUsuario = useMemo(() => {
    const mapa = new Map<string, { usuario: string; total: number; exitosas: number; fallidas: number }>();
    for (const f of filas) {
      const entry = mapa.get(f.usuarioEmail) ?? { usuario: f.usuarioEmail, total: 0, exitosas: 0, fallidas: 0 };
      entry.total += 1;
      if (f.exito) entry.exitosas += 1;
      else entry.fallidas += 1;
      mapa.set(f.usuarioEmail, entry);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [filas]);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Reporte de cargas a RNDC</h2>
        <button
          type="button"
          disabled={filas.length === 0}
          onClick={() => descargarCsv(filas)}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          <Download size={16} />
          Descargar CSV
        </button>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ImportarDelRndc perfiles={perfiles} alTerminar={cargar} />

      <section className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5">
        <label className="text-xs text-slate-600 sm:col-span-2">
          Perfil
          <select
            value={perfilId}
            onChange={(e) => setPerfilId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Estado
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {ESTADOS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-end sm:col-span-5">
          <button
            type="button"
            onClick={cargar}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Cargando…" : "Aplicar filtros"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total cargas</p>
          <p className="text-2xl font-semibold text-slate-800">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-green-700">Exitosas</p>
          <p className="text-2xl font-semibold text-green-800">{stats.exitosas}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700">Fallidas</p>
          <p className="text-2xl font-semibold text-red-800">{stats.fallidas}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Tasa de éxito</p>
          <p className="text-2xl font-semibold text-slate-800">{stats.tasa}%</p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
          Actividad por usuario
        </h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Facturas cargadas</th>
              <th className="px-3 py-2">Exitosas</th>
              <th className="px-3 py-2">Fallidas</th>
              <th className="px-3 py-2">Tasa de éxito</th>
            </tr>
          </thead>
          <tbody>
            {porUsuario.map((u) => (
              <tr key={u.usuario} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{u.usuario}</td>
                <td className="px-3 py-2">{u.total}</td>
                <td className="px-3 py-2 text-green-700">{u.exitosas}</td>
                <td className="px-3 py-2 text-red-700">{u.fallidas}</td>
                <td className="px-3 py-2">{u.total > 0 ? Math.round((u.exitosas / u.total) * 100) : 0}%</td>
              </tr>
            ))}
            {porUsuario.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                  Sin actividad para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Perfil</th>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Archivo</th>
              <th className="px-3 py-2">N° Factura</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Respuesta WS (RNDC)</th>
              <th className="px-3 py-2">Remesas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {new Date(f.createdAt).toLocaleString("es-CO")}
                </td>
                <td className="px-3 py-2">{f.perfilNombre}</td>
                <td className="px-3 py-2">{f.usuarioEmail}</td>
                <td className="px-3 py-2">{f.archivo}</td>
                <td className="px-3 py-2">{f.numeroFactura}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.exito ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {f.exito ? "Exitosa" : "Fallida"}
                  </span>
                </td>
                <td className="max-w-md px-3 py-2 text-slate-600">{f.mensaje}</td>
                <td className="px-3 py-2">{f.remesas}</td>
              </tr>
            ))}
            {filas.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  Sin cargas registradas para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
