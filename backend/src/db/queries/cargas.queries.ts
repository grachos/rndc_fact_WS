import type { CargaRndcReporte } from "@fe-tool/shared";
import { pool } from "../pool.js";

interface CargaRow {
  id: number;
  perfil_id: number;
  perfil_nombre: string;
  usuario_id: number | null;
  usuario_email: string;
  origen: "app" | "rndc";
  archivo: string;
  numero_factura: string;
  exito: boolean;
  mensaje: string;
  remesas: number;
  created_at: Date;
}

function toReporte(row: CargaRow): CargaRndcReporte {
  return {
    id: row.id,
    perfilId: row.perfil_id,
    perfilNombre: row.perfil_nombre,
    usuarioId: row.usuario_id,
    usuarioEmail: row.usuario_email,
    origen: row.origen,
    archivo: row.archivo,
    numeroFactura: row.numero_factura,
    exito: row.exito,
    mensaje: row.mensaje,
    remesas: row.remesas,
    createdAt: row.created_at.toISOString(),
  };
}

const USUARIO_IMPORTADA = `'Importada del RNDC (usuario no registrado)'`;

export interface CargaImportada {
  numeroFactura: string;
  /** Local Colombia time "YYYY-MM-DD HH:MM:SS" of when it reached the RNDC, or null if unknown. */
  fecha: string | null;
  exito: boolean;
  mensaje: string;
  remesas: number;
}

/** Inserts invoices found in the RNDC that the app hasn't logged yet. Skips ones already
 * imported and ones the app itself logged as a successful upload. Returns how many were new. */
export async function importarCargas(perfilId: number, cargas: CargaImportada[]): Promise<number> {
  let nuevas = 0;
  for (const c of cargas) {
    const { rowCount } = await pool.query(
      `insert into cargas_rndc (perfil_id, usuario_id, origen, archivo, numero_factura, exito, mensaje, remesas, created_at)
       select $1, null, 'rndc', '—', $2, $3, $4, $5,
              coalesce($6::timestamp at time zone 'America/Bogota', now())
       where not exists (
         select 1 from cargas_rndc where perfil_id = $1 and numero_factura = $2 and origen = 'app' and exito
       )
       on conflict (perfil_id, numero_factura) where origen = 'rndc' do nothing`,
      [perfilId, c.numeroFactura, c.exito, c.mensaje, c.remesas, c.fecha]
    );
    nuevas += rowCount ?? 0;
  }
  return nuevas;
}

export async function insertCarga(input: {
  perfilId: number;
  usuarioId: number;
  archivo: string;
  numeroFactura: string;
  exito: boolean;
  mensaje: string;
  remesas: number;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `insert into cargas_rndc (perfil_id, usuario_id, archivo, numero_factura, exito, mensaje, remesas)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [input.perfilId, input.usuarioId, input.archivo, input.numeroFactura, input.exito, input.mensaje, input.remesas]
  );
  return rows[0]!.id;
}

export async function actualizarCarga(id: number, resultado: { exito: boolean; mensaje: string }): Promise<void> {
  await pool.query("update cargas_rndc set exito = $2, mensaje = $3 where id = $1", [id, resultado.exito, resultado.mensaje]);
}

export interface ListCargasFiltros {
  perfilId?: number;
  exito?: boolean;
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
}

export async function listCargas(filtros: ListCargasFiltros): Promise<CargaRndcReporte[]> {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (filtros.perfilId !== undefined) {
    params.push(filtros.perfilId);
    condiciones.push(`c.perfil_id = $${params.length}`);
  }
  if (filtros.exito !== undefined) {
    params.push(filtros.exito);
    condiciones.push(`c.exito = $${params.length}`);
  }
  if (filtros.desde) {
    params.push(filtros.desde);
    condiciones.push(`(c.created_at at time zone 'America/Bogota')::date >= $${params.length}::date`);
  }
  if (filtros.hasta) {
    params.push(filtros.hasta);
    condiciones.push(`(c.created_at at time zone 'America/Bogota')::date <= $${params.length}::date`);
  }

  const where = condiciones.length > 0 ? `where ${condiciones.join(" and ")}` : "";
  const { rows } = await pool.query<CargaRow>(
    `select c.id, c.perfil_id, p.nombre as perfil_nombre, c.usuario_id,
            coalesce(u.email, ${USUARIO_IMPORTADA}) as usuario_email, c.origen,
            c.archivo, c.numero_factura, c.exito, c.mensaje, c.remesas, c.created_at
     from cargas_rndc c
     join perfiles p on p.id = c.perfil_id
     left join users u on u.id = c.usuario_id
     ${where}
     order by c.created_at desc
     limit 5000`,
    params
  );
  return rows.map(toReporte);
}
