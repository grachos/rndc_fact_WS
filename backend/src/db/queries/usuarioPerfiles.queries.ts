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

/** Operadores (not admins — they use every empresa anyway) assigned to an empresa. */
export async function getOperadoresDePerfil(perfilId: number): Promise<number[]> {
  const { rows } = await pool.query<{ usuario_id: number }>(
    `select up.usuario_id from usuario_perfiles up join users u on u.id = up.usuario_id
     where up.perfil_id = $1 and u.role = 'operador' order by up.usuario_id`,
    [perfilId]
  );
  return rows.map((r) => r.usuario_id);
}

export async function contarOperadoresPorPerfil(): Promise<Map<number, number>> {
  const { rows } = await pool.query<{ perfil_id: number; n: string }>(
    `select up.perfil_id, count(*)::text as n from usuario_perfiles up join users u on u.id = up.usuario_id
     where u.role = 'operador' group by up.perfil_id`
  );
  return new Map(rows.map((r) => [r.perfil_id, Number(r.n)]));
}

/** Sets exactly which operadores can use an empresa. A newly added operador with no
 * default empresa gets this one as default; one who loses their default gets another
 * of their remaining empresas as default. */
export async function setOperadoresDePerfil(perfilId: number, usuarioIds: number[]): Promise<void> {
  const ids = [...new Set(usuarioIds)];
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: quitados } = await client.query<{ usuario_id: number }>(
      `delete from usuario_perfiles up using users u
       where u.id = up.usuario_id and up.perfil_id = $1 and u.role = 'operador' and not (up.usuario_id = any($2::int[]))
       returning up.usuario_id`,
      [perfilId, ids]
    );
    for (const usuarioId of ids) {
      await client.query(
        `insert into usuario_perfiles (usuario_id, perfil_id, predeterminado)
         select $1, $2, not exists (select 1 from usuario_perfiles where usuario_id = $1 and predeterminado)
         from users where id = $1 and role = 'operador'
         on conflict (usuario_id, perfil_id) do nothing`,
        [usuarioId, perfilId]
      );
    }
    for (const { usuario_id } of quitados) {
      await client.query(
        `update usuario_perfiles set predeterminado = true
         where usuario_id = $1 and perfil_id = (select min(perfil_id) from usuario_perfiles where usuario_id = $1)
           and not exists (select 1 from usuario_perfiles where usuario_id = $1 and predeterminado)`,
        [usuario_id]
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
