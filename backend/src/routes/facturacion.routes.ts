import { Router } from "express";
import multer from "multer";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { generarXmlInputSchema } from "@fe-tool/shared";
import { getPerfilCredenciales, getPerfilXmlTemplate } from "../db/queries/perfiles.queries.js";
import { requireAuth } from "../middleware/auth.js";
import { generarFacturaConTemplate, generarFacturaDesdeTemplate, SinPlantillaError } from "../services/xml/generarFactura.js";
import {
  consultarFactura,
  consultarFacturaPorRemesa,
  consultarFacturasPorFecha,
  consultarRemesasPorFactura,
} from "../services/rndc/facturas.js";
import { consultarRadicadoRemesa } from "../services/rndc/remesas.js";
import { enviarFacturaRndc, parseFacturaXml } from "../services/rndc86/upload.js";
import { autoMapear, parsearFacturas, validar, type Mapping, type FiltroGen } from "../services/excel/batchGenerar.js";
import { insertCarga, listCargas } from "../db/queries/cargas.queries.js";

export const facturacionRouter = Router();
facturacionRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function loadPerfilOr404(perfilId: number) {
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
  try {
    const result = await generarFacturaDesdeTemplate(parsed.data);
    res.json(result);
  } catch (err) {
    if (err instanceof SinPlantillaError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

// Auto-fill radicado/peso for a remesa from RNDC (used while filling the manual form).
facturacionRouter.get("/consultar-radicado/:consecutivo", async (req, res) => {
  const perfilId = Number(req.query.perfilId);
  const perfil = await loadPerfilOr404(perfilId).catch((e) => {
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

  const perfil = await loadPerfilOr404(perfilId).catch((e) => {
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
      resumen.push({ numeroFactura: factura.numeroFactura, ok: true, avisos });
    } catch (err: any) {
      resumen.push({ numeroFactura: factura.numeroFactura, ok: false, error: String(err?.message ?? err) });
    }
  }

  zip.file("_resumen.json", JSON.stringify(resumen, null, 2));
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="facturas_generadas.zip"');
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

facturacionRouter.post("/cargar-rndc/preview", upload.array("archivos"), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const expandidos = await expandirArchivos(files);
  const previews = expandidos.map((f) => parseFacturaXml(f.nombre, f.contenido));
  res.json(previews);
});

facturacionRouter.post("/cargar-rndc/enviar", upload.array("archivos"), async (req, res) => {
  const perfilId = Number(req.body.perfilId);
  const perfil = await loadPerfilOr404(perfilId).catch((e) => {
    res.status(e.status ?? 500).json({ error: e.message });
    return null;
  });
  if (!perfil) return;

  const files = (req.files as Express.Multer.File[]) ?? [];
  const expandidos = await expandirArchivos(files);

  const resultados = [];
  for (const f of expandidos) {
    const preview = parseFacturaXml(f.nombre, f.contenido);
    const envio = await enviarFacturaRndc(f.contenido, perfil.rndcUsuario, perfil.rndcPassword, perfil.nitSocio);
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
    await insertCarga({
      perfilId,
      usuarioId: req.user!.sub,
      archivo: f.nombre,
      numeroFactura: preview.nf,
      exito: envio.exito,
      mensaje: envio.mensaje,
      remesas: preview.remesas.length,
    });
  }
  res.json(resultados);
});

// ── Reporte de cargas RNDC ───────────────────────────────────────────────────

facturacionRouter.get("/reporte-cargas", async (req, res) => {
  const perfilId = req.query.perfilId ? Number(req.query.perfilId) : undefined;
  const exito =
    req.query.exito === "true" ? true : req.query.exito === "false" ? false : undefined;
  const desde = req.query.desde ? String(req.query.desde) : undefined;
  const hasta = req.query.hasta ? String(req.query.hasta) : undefined;
  const reporte = await listCargas({ perfilId, exito, desde, hasta });
  res.json(reporte);
});

// ── Consultar factura / por remesa ───────────────────────────────────────────

facturacionRouter.get("/consultar-factura", async (req, res) => {
  const perfilId = Number(req.query.perfilId);
  const perfil = await loadPerfilOr404(perfilId).catch((e) => {
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
  const perfil = await loadPerfilOr404(perfilId).catch((e) => {
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
