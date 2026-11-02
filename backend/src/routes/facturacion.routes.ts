import { Router, type Request } from "express";
import multer from "multer";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { generarXmlInputSchema } from "@fe-tool/shared";
import { getPerfilCredenciales, getPerfilXmlTemplate } from "../db/queries/perfiles.queries.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { generarFacturaConTemplate, generarFacturaDesdeTemplate, SinPlantillaError } from "../services/xml/generarFactura.js";
import { PlantillaSinLineaRemesaError } from "../services/xml/templateEditor.js";
import { FacturaInvalidaError, validarFactura } from "../services/xml/validarFactura.js";
import {
  consultarFactura,
  consultarFacturaPorRemesa,
  consultarFacturasPorFecha,
  consultarRemesasPorFactura,
} from "../services/rndc/facturas.js";
import { consultarRadicadoRemesa } from "../services/rndc/remesas.js";
import { enviarFacturaRndc, parseFacturaXml } from "../services/rndc86/upload.js";
import { autoMapear, parsearFacturas, validar, type Mapping, type FiltroGen } from "../services/excel/batchGenerar.js";
import {
  actualizarCarga,
  getCargaXml,
  getGeneradaXml,
  insertCarga,
  insertGenerada,
  listCargas,
} from "../db/queries/cargas.queries.js";
import { puedeUsarPerfil } from "../db/queries/usuarioPerfiles.queries.js";

export const facturacionRouter = Router();
facturacionRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const SIN_ACCESO = "No tienes asignada esta empresa. Pide a un administrador que te la asigne.";

async function loadPerfilOr404(req: Request, perfilId: number) {
  if (!(await puedeUsarPerfil(req.user!, perfilId))) {
    throw Object.assign(new Error(SIN_ACCESO), { status: 403 });
  }
  const perfil = await getPerfilCredenciales(perfilId);
  if (!perfil) throw Object.assign(new Error("Perfil no encontrado"), { status: 404 });
  return perfil;
}

// ── Generar XML (manual) ─────────────────────────────────────────────────────

facturacionRouter.post("/generar-xml", async (req, res) => {
  const parsed = generarXmlInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  if (!(await puedeUsarPerfil(req.user!, parsed.data.perfilId))) {
    return res.status(403).json({ error: SIN_ACCESO });
  }
  try {
    const result = await generarFacturaDesdeTemplate(parsed.data);
    await insertGenerada({
      perfilId: parsed.data.perfilId,
      usuarioId: req.user!.sub,
      numeroFactura: parsed.data.numeroFactura,
      origen: "manual",
      archivo: result.filename,
      remesas: parsed.data.remesas.length,
      xml: result.xml,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof SinPlantillaError || err instanceof PlantillaSinLineaRemesaError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof FacturaInvalidaError) return res.status(400).json({ error: err.message, errores: err.errores });
    throw err;
  }
});

// Auto-fill radicado/peso for a remesa from RNDC (used while filling the manual form).
facturacionRouter.get("/consultar-radicado/:consecutivo", async (req, res) => {
  const perfilId = Number(req.query.perfilId);
  const perfil = await loadPerfilOr404(req, perfilId).catch((e) => {
    res.status(e.status ?? 500).json({ error: e.message });
    return null;
  });
  if (!perfil) return;
  const result = await consultarRadicadoRemesa(req.params.consecutivo!, perfil);
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result.data);
});

// ── Generar facturas vía Excel ───────────────────────────────────────────────

facturacionRouter.post("/excel/columnas", upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sube un archivo Excel." });
  const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json(sheet!, { defval: "" }) as Record<string, unknown>[];
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  res.json({ columns, autoMapeo: autoMapear(columns), filas: rows.length });
});

facturacionRouter.post("/excel/generar", upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sube un archivo Excel." });
  const perfilId = Number(req.body.perfilId);
  const mapping: Mapping = JSON.parse(req.body.mapping ?? "{}");
  const filtro: FiltroGen = req.body.filtro ?? "Todas (sin filtro)";
  const nitCliFijo = req.body.nitCliFijo ?? "";
  const digCliFijo = req.body.digCliFijo ?? "";
  const nomCliFijo = req.body.nomCliFijo ?? "";
  const autoConsultarRadicado = req.body.autoConsultarRadicado === "true";

  const perfil = await loadPerfilOr404(req, perfilId).catch((e) => {
    res.status(e.status ?? 500).json({ error: e.message });
    return null;
  });
  if (!perfil) return;

  const template = await getPerfilXmlTemplate(perfilId);
  if (!template) {
    return res.status(400).json({
      error: `Este perfil no tiene una plantilla XML cargada. Sube una factura real de ejemplo en Perfiles antes de generar.`,
    });
  }

  const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json(sheet!, { defval: "" }) as Record<string, unknown>[];

  const { ok, mensaje } = validar(rows, mapping, filtro);
  if (!ok) return res.status(400).json({ error: mensaje });

  const facturas = parsearFacturas(rows, mapping, filtro, nitCliFijo, digCliFijo, nomCliFijo);

  const zip = new JSZip();
  const generadasXml: { numeroFactura: string; remesas: number; xml: string }[] = [];
  const resumen: { numeroFactura: string; ok: boolean; error?: string; avisos?: string[] }[] = [];

  for (const factura of facturas) {
    try {
      if (autoConsultarRadicado) {
        for (const remesa of factura.remesas) {
          if (remesa.radicado) continue;
          const r = await consultarRadicadoRemesa(remesa.consecutivo, perfil);
          if (r.ok) {
            remesa.radicado = r.data.radicado;
            if (!remesa.peso || remesa.peso === "1") remesa.peso = r.data.peso || remesa.peso;
          }
        }
      }
      const datos = generarXmlInputSchema.parse({
        perfilId,
        numeroFactura: factura.numeroFactura,
        cufe: factura.cufe,
        fecha: factura.fecha,
        nitCliente: factura.nitCliente,
        digitoCliente: factura.digitoCliente,
        nombreCliente: factura.nombreCliente,
        valorTotal: factura.valorTotal,
        remesas: factura.remesas,
      });
      const { xml, avisos } = generarFacturaConTemplate(template.contenido, datos);
      zip.file(`FACTURA_${factura.numeroFactura}.xml`, xml);
      generadasXml.push({ numeroFactura: factura.numeroFactura, remesas: datos.remesas.length, xml });
      resumen.push({ numeroFactura: factura.numeroFactura, ok: true, avisos });
    } catch (err: any) {
      resumen.push({ numeroFactura: factura.numeroFactura, ok: false, error: String(err?.message ?? err) });
    }
  }

  const rechazadas = resumen
    .filter((r) => !r.ok)
    .map((r) => ({ numeroFactura: r.numeroFactura, error: r.error ?? "Error desconocido" }));
  const generadas = resumen.length - rechazadas.length;
  if (generadas === 0) {
    return res.status(400).json({
      error: `No se generó ninguna factura: las ${rechazadas.length} tienen errores.`,
      rechazadas,
    });
  }

  for (const g of generadasXml) {
    await insertGenerada({
      perfilId,
      usuarioId: req.user!.sub,
      numeroFactura: g.numeroFactura,
      origen: "excel",
      archivo: `FACTURA_${g.numeroFactura}.xml`,
      remesas: g.remesas,
      xml: g.xml,
    });
  }

  zip.file("_resumen.json", JSON.stringify(resumen, null, 2));
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="facturas_generadas.zip"');
  // Summary for the UI (the full list is also in _resumen.json inside the zip).
  res.setHeader("X-Facturas-Generadas", String(generadas));
  res.setHeader("X-Facturas-Rechazadas", String(rechazadas.length));
  res.setHeader(
    "X-Rechazos",
    encodeURIComponent(JSON.stringify(rechazadas.slice(0, 20).map((r) => ({ ...r, error: r.error.slice(0, 400) }))))
  );
  res.send(zipBuffer);
});

// ── Cargar facturas a RNDC (proceso 86) ──────────────────────────────────────

async function expandirArchivos(files: Express.Multer.File[]): Promise<{ nombre: string; contenido: Buffer }[]> {
  const salida: { nombre: string; contenido: Buffer }[] = [];
  for (const file of files) {
    if (file.originalname.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file.buffer);
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || !name.toLowerCase().endsWith(".xml")) continue;
        const contenido = await entry.async("nodebuffer");
        salida.push({ nombre: name.split("/").pop()!, contenido });
      }
    } else {
      salida.push({ nombre: file.originalname, contenido: file.buffer });
    }
  }
  return salida;
}

function problemasDeCarga(contenido: Buffer): string[] {
  return validarFactura(contenido.toString("utf-8"), { permitirLineasSinRemesa: true });
}

facturacionRouter.post("/cargar-rndc/preview", upload.array("archivos"), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const expandidos = await expandirArchivos(files);
  const previews = expandidos.map((f) => ({
    ...parseFacturaXml(f.nombre, f.contenido),
    problemas: problemasDeCarga(f.contenido),
  }));
  res.json(previews);
});

facturacionRouter.post("/cargar-rndc/enviar", upload.array("archivos"), async (req, res) => {
  const perfilId = Number(req.body.perfilId);
  const perfil = await loadPerfilOr404(req, perfilId).catch((e) => {
    res.status(e.status ?? 500).json({ error: e.message });
    return null;
  });
  if (!perfil) return;

  const files = (req.files as Express.Multer.File[]) ?? [];
  const expandidos = await expandirArchivos(files);

  const resultados = [];
  for (const f of expandidos) {
    const preview = parseFacturaXml(f.nombre, f.contenido);
    const problemas = problemasDeCarga(f.contenido);
    const registro = {
      perfilId,
      usuarioId: req.user!.sub,
      archivo: f.nombre,
      numeroFactura: preview.nf,
      remesas: preview.remesas.length,
      xml: f.contenido,
    };
    if (problemas.length > 0) {
      const mensaje = `No se envió al RNDC porque el XML tiene errores: ${problemas.join(" | ")}`;
      await insertCarga({ ...registro, exito: false, mensaje });
      resultados.push({
        archivo: f.nombre,
        numeroFactura: preview.nf,
        exito: false,
        mensaje,
        remesas: preview.remesas.map((r) => ({ consecutivo: r.consecutivo, radicado: r.radicado })),
      });
      continue;
    }
    // Recorded BEFORE contacting the RNDC so every attempt leaves a trace, even if the
    // request is cut off while waiting for the RNDC's answer; updated with the real result.
    const cargaId = await insertCarga({
      ...registro,
      exito: false,
      mensaje: "Sin respuesta del RNDC: el envío se interrumpió antes de recibir respuesta. Consulta la factura en el RNDC antes de reenviarla.",
    });
    const envio = await enviarFacturaRndc(f.contenido, perfil.rndcUsuario, perfil.rndcPassword, perfil.nitSocio);
    await actualizarCarga(cargaId, { exito: envio.exito, mensaje: envio.mensaje });
    resultados.push({
      archivo: f.nombre,
      numeroFactura: preview.nf,
      exito: envio.exito,
      mensaje: envio.mensaje,
      remesas: preview.remesas.map((r) => {
        const err = envio.detalle?.find((d) => d.radicado === r.radicado);
        return { consecutivo: r.consecutivo, radicado: r.radicado, mensaje: err?.mensaje };
      }),
    });
  }
  res.json(resultados);
});

// ── Reporte de cargas RNDC ───────────────────────────────────────────────────

function filtrosReporte(req: Request) {
  const estado = ["exitosa", "fallida", "sin_subir"].includes(String(req.query.estado))
    ? (String(req.query.estado) as "exitosa" | "fallida" | "sin_subir")
    : undefined;
  return {
    perfilId: req.query.perfilId ? Number(req.query.perfilId) : undefined,
    estado,
    desde: req.query.desde ? String(req.query.desde) : undefined,
    hasta: req.query.hasta ? String(req.query.hasta) : undefined,
  };
}

facturacionRouter.get("/reporte-cargas", requireRole("admin"), async (req, res) => {
  res.json(await listCargas(filtrosReporte(req)));
});

const ESTADO_TXT = { exitosa: "Exitosa", fallida: "Fallida", sin_subir: "Generada, sin subir" } as const;
const ORIGEN_TXT = { manual: "Manual", excel: "Excel" } as const;

// The report (same filters as the screen) as an Excel file: invoice rows + per-user summary.
facturacionRouter.get("/reporte-cargas/excel", requireRole("admin"), async (req, res) => {
  const filas = await listCargas(filtrosReporte(req));

  const detalle = filas.map((f) => ({
    Fecha: new Date(f.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    Empresa: f.perfilNombre,
    Usuario: f.usuarioEmail,
    Archivo: f.archivo,
    "N° Factura": f.numeroFactura,
    Origen: f.origen ? ORIGEN_TXT[f.origen] : "Archivo externo",
    Estado: ESTADO_TXT[f.estado],
    "Respuesta WS (RNDC)": f.mensaje,
    Remesas: f.remesas,
  }));

  const porUsuario = new Map<string, { exitosas: number; fallidas: number; sinSubir: number }>();
  for (const f of filas) {
    const u = porUsuario.get(f.usuarioEmail) ?? { exitosas: 0, fallidas: 0, sinSubir: 0 };
    if (f.estado === "exitosa") u.exitosas += 1;
    else if (f.estado === "fallida") u.fallidas += 1;
    else u.sinSubir += 1;
    porUsuario.set(f.usuarioEmail, u);
  }
  const resumen = [...porUsuario.entries()].map(([usuario, u]) => {
    const cargadas = u.exitosas + u.fallidas;
    return {
      Usuario: usuario,
      "Facturas cargadas": cargadas,
      Exitosas: u.exitosas,
      Fallidas: u.fallidas,
      "Generadas sin subir": u.sinSubir,
      "Tasa de éxito": cargadas > 0 ? `${Math.round((u.exitosas / cargadas) * 100)}%` : "0%",
    };
  });

  const wb = XLSX.utils.book_new();
  const hojaDetalle = XLSX.utils.json_to_sheet(detalle, {
    header: ["Fecha", "Empresa", "Usuario", "Archivo", "N° Factura", "Origen", "Estado", "Respuesta WS (RNDC)", "Remesas"],
  });
  hojaDetalle["!cols"] = [20, 22, 28, 24, 14, 14, 20, 70, 9].map((wch) => ({ wch }));
  hojaDetalle["!autofilter"] = { ref: hojaDetalle["!ref"] ?? "A1:I1" };
  XLSX.utils.book_append_sheet(wb, hojaDetalle, "Facturas");
  const hojaResumen = XLSX.utils.json_to_sheet(resumen, {
    header: ["Usuario", "Facturas cargadas", "Exitosas", "Fallidas", "Generadas sin subir", "Tasa de éxito"],
  });
  hojaResumen["!cols"] = [30, 16, 10, 10, 18, 12].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, hojaResumen, "Por usuario");

  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="reporte_facturas_${fecha}.xlsx"`);
  res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
});

// Evidence: the exact XML of an upload attempt as it was sent (or blocked), or of a
// generated invoice (?fuente=generada).
facturacionRouter.get("/reporte-cargas/:id/xml", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const carga = req.query.fuente === "generada" ? await getGeneradaXml(id) : await getCargaXml(id);
  if (!carga) return res.status(404).json({ error: "Este registro no tiene el XML guardado." });
  const nombre = carga.archivo.replace(/[^\w.\-]/g, "_") || "factura.xml";
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(carga.xml);
});

// ── Consultar factura / por remesa ───────────────────────────────────────────

facturacionRouter.get("/consultar-factura", async (req, res) => {
  const perfilId = Number(req.query.perfilId);
  const perfil = await loadPerfilOr404(req, perfilId).catch((e) => {
    res.status(e.status ?? 500).json({ error: e.message });
    return null;
  });
  if (!perfil) return;

  const numerosRaw = String(req.query.numeros ?? "").trim();
  if (numerosRaw) {
    const numeros = [...new Set(numerosRaw.split(/[\s,]+/).filter(Boolean))];
    const resultados = [];
    for (const n of numeros) {
      const r = await consultarFactura(n, perfil);
      resultados.push(r.ok ? { numero: n, ok: true, campos: r.data } : { numero: n, ok: false, error: r.error });
    }
    return res.json(resultados);
  }

  const { fechaInicial, fechaFinal } = req.query;
  if (fechaInicial && fechaFinal) {
    const r = await consultarFacturasPorFecha(perfil, String(fechaInicial), String(fechaFinal));
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json(r.data.map((campos) => ({ ok: true, campos })));
  }

  res.status(400).json({ error: "Especifica 'numeros' o un rango 'fechaInicial'/'fechaFinal'." });
});

facturacionRouter.get("/consultar-factura-remesa", async (req, res) => {
  const perfilId = Number(req.query.perfilId);
  const perfil = await loadPerfilOr404(req, perfilId).catch((e) => {
    res.status(e.status ?? 500).json({ error: e.message });
    return null;
  });
  if (!perfil) return;

  const generador = String(req.query.generador ?? "").trim();
  if (!generador) return res.status(400).json({ error: "Falta el NIT del generador." });

  const remesasRaw = String(req.query.remesas ?? "").trim();
  const facturasRaw = String(req.query.facturas ?? "").trim();

  if (facturasRaw) {
    const facturas = [...new Set(facturasRaw.split(/[\s,]+/).filter(Boolean))];
    const resultados = [];
    for (const f of facturas) {
      const r = await consultarRemesasPorFactura(f, generador, perfil);
      resultados.push(r.ok ? { factura: f, ok: true, remesas: r.data } : { factura: f, ok: false, error: r.error });
    }
    return res.json({ modo: "factura", resultados });
  }

  if (remesasRaw) {
    const remesas = [...new Set(remesasRaw.split(/[\s,]+/).filter(Boolean))];
    const resultados = [];
    for (const c of remesas) {
      const r = await consultarFacturaPorRemesa(c, generador, perfil);
      resultados.push(r.ok ? { consecutivo: c, ok: true, campos: r.data } : { consecutivo: c, ok: false, error: r.error });
    }
    return res.json({ modo: "remesa", resultados });
  }

  res.status(400).json({ error: "Especifica 'remesas' o 'facturas'." });
});
