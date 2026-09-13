import { Router } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, type LoginResponse } from "@fe-tool/shared";
import { findUserByEmail, findUserById } from "../db/queries/users.queries.js";
import { signToken } from "../services/security/jwt.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
  }
  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos" });
  }

  const response: LoginResponse = { token: signToken(user), user };
  res.json(response);
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.user!.sub);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(user);
});
