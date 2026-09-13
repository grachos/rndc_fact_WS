import { Router } from "express";
import bcrypt from "bcryptjs";
import { createUserSchema, updateUserSchema } from "@fe-tool/shared";
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  updateUser,
} from "../db/queries/users.queries.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("admin"));

usersRouter.get("/", async (_req, res) => {
  res.json(await listUsers());
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const user = await createUser({ email: parsed.data.email, passwordHash, role: parsed.data.role });
    res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
    }
    throw err;
  }
});

usersRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined;
  const user = await updateUser(id, { role: parsed.data.role, passwordHash });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(user);
});

usersRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.sub) {
    return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
  }
  const existing = await findUserById(id);
  if (!existing) return res.status(404).json({ error: "Usuario no encontrado" });
  await deleteUser(id);
  res.status(204).end();
});
