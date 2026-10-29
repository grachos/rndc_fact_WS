import type { JwtPayload } from "@fe-tool/shared";
import { pool } from "../pool.js";

export interface Asignaciones {
  perfilIds: number[];
  perfilPredeterminadoId: number | null;
}

export async function getAsignaciones(usuarioId: number): Promise<Asignaciones> {
  const { rows } = await pool.query<{ perfil_id: number; predeterminado: boolean }>(
    "select perfil_id, predeterminado from usuario_perfiles where usuario_id = $1 order by perfil_id",
    [usuarioId]
  );
  return {
    perfilIds: rows.map((r) => r.perfil_id),
    perfilPredeterminadoId: rows.find((r) => r.predeterminado)?.perfil_id ?? null,
  };
}

export async function getAsignacionesDeTodos(): Promise<Map<number, Asignaciones>> {
  const { rows } = await pool.query<{ usuario_id: number; perfil_id: number; predeterminado: boolean }>(
    "select usuario_id, perfil_id, predeterminado from usuario_perfiles order by perfil_id"
  );
  const mapa = new Map<number, Asignaciones>();
  for (const r of rows) {
    const a = mapa.get(r.usuario_id) ?? { perfilIds: [], perfilPredeterminadoId: null };
    a.perfilIds.push(r.perfil_id);
    if (r.predeterminado) a.perfilPredeterminadoId = r.perfil_id;
    mapa.set(r.usuario_id, a);
  }
  return mapa;
}

/** Replaces the user's assigned empresas. The default must be one of them; if it isn't
 * given (or isn't in the list), the first assigned empresa becomes the default. */
export async function setAsignaciones(
  usuarioId: number,
  perfilIds: number[],
  predeterminadoId: number | null | undefined
): Promise<void> {
  const ids = [...new Set(perfilIds)];
  const predeterminado = predeterminadoId != null && ids.includes(predeterminadoId) ? predeterminadoId : ids[0] ?? null;

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from usuario_perfiles where usuario_id = $1", [usuarioId]);
    for (const perfilId of ids) {
      await client.query(
        "insert into usuario_perfiles (usuario_id, perfil_id, predeterminado) values ($1, $2, $3)",
        [usuarioId, perfilId, perfilId === predeterminado]
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function puedeUsarPerfil(user: JwtPayload, perfilId: number): Promise<boolean> {
  if (user.role === "admin") return true;
  const { rowCount } = await pool.query(
    "select 1 from usuario_perfiles where usuario_id = $1 and perfil_id = $2",
    [user.sub, perfilId]
  );
  return (rowCount ?? 0) > 0;
}
