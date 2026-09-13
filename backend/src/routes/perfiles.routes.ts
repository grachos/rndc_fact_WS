import { Router } from "express";
import multer from "multer";
import { perfilInputSchema } from "@fe-tool/shared";
import {
  clearPerfilXmlTemplate,
  createPerfil,
  deletePerfil,
  getPerfil,
  getPerfilXmlTemplate,
  listPerfiles,
  setPerfilXmlTemplate,
  updatePerfil,
} from "../db/queries/perfiles.queries.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";

export const perfilesRouter = Router();
perfilesRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Any authenticated staff member can list/view perfiles — they need to pick one to operate on.
perfilesRouter.get("/", async (_req, res) => {
  res.json(await listPerfiles());
});

perfilesRouter.get("/:id", async (req, res) => {
  const perfil = await getPerfil(Number(req.params.id));
  if (!perfil) return res.status(404).json({ error: "Perfil no encontrado" });
  res.json(perfil);
});

// Any staff member can view/download the template — only admins can change it (see below).
perfilesRouter.get("/:id/xml-template", async (req, res) => {
  const template = await getPerfilXmlTemplate(Number(req.params.id));
  if (!template) return res.status(404).json({ error: "Este perfil no tiene una plantilla XML cargada" });
  res.json(template);
});

// Managing RNDC credentials is admin-only.
perfilesRouter.use(requireRole("admin"));

perfilesRouter.post("/", async (req, res) => {
  const parsed = perfilInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const perfil = await createPerfil(parsed.data);
  res.status(201).json(perfil);
});

perfilesRouter.put("/:id", async (req, res) => {
  const parsed = perfilInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const perfil = await updatePerfil(Number(req.params.id), parsed.data);
  if (!perfil) return res.status(404).json({ error: "Perfil no encontrado" });
  res.json(perfil);
});

perfilesRouter.delete("/:id", async (req, res) => {
  const ok = await deletePerfil(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Perfil no encontrado" });
  res.status(204).end();
});

perfilesRouter.post("/:id/xml-template", upload.single("archivo"), async (req, res) => {
  const id = Number(req.params.id);
  const perfil = await getPerfil(id);
  if (!perfil) return res.status(404).json({ error: "Perfil no encontrado" });
  if (!req.file) return res.status(400).json({ error: "Sube un archivo XML." });

  const contenido = req.file.buffer.toString("utf-8");
  if (!contenido.includes("<![CDATA[") || !contenido.includes("<cac:InvoiceLine")) {
    return res.status(400).json({
      error: "El archivo no parece ser una factura UBL válida (falta el CDATA del Invoice o InvoiceLine).",
    });
  }
  await setPerfilXmlTemplate(id, contenido, req.file.originalname);
  res.json(await getPerfil(id));
});

perfilesRouter.delete("/:id/xml-template", async (req, res) => {
  const id = Number(req.params.id);
  const perfil = await getPerfil(id);
  if (!perfil) return res.status(404).json({ error: "Perfil no encontrado" });
  await clearPerfilXmlTemplate(id);
  res.json(await getPerfil(id));
});
