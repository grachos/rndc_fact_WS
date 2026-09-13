import { Router } from "express";
import { settingsInputSchema } from "@fe-tool/shared";
import { getSettings, updateSettings } from "../db/queries/settings.queries.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get("/", async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.patch("/", requireRole("admin"), async (req, res) => {
  const parsed = settingsInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  res.json(await updateSettings(parsed.data));
});
