import "express-async-errors";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { perfilesRouter } from "./routes/perfiles.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { facturacionRouter } from "./routes/facturacion.routes.js";

export const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" })); // generous limit: base64 XML/PDF uploads go through JSON in later phases

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/perfiles", perfilesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/facturacion", facturacionRouter);

// Centralized error handler — keeps route handlers free of try/catch boilerplate.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});
