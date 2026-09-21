import type { CargaRndcReporte } from "@fe-tool/shared";
import { pool } from "../pool.js";

interface CargaRow {
  id: number;
  perfil_id: number;
  perfil_nombre: string;
  usuario_id: number;
  usuario_email: string;
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
    archivo: row.archivo,
    numeroFactura: row.numero_factura,
    exito: row.exito,
    mensaje: row.mensaje,
    remesas: row.remesas,
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertCarga(input: {
  perfilId: number;
  usuarioId: number;
  archivo: string;
  numeroFactura: string;
  exito: boolean;
  mensaje: string;
  remesas: number;
}): Promise<void> {
  await pool.query(
    `insert into cargas_rndc (perfil_id, usuario_id, archivo, numero_factura, exito, mensaje, remesas)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [input.perfilId, input.usuarioId, input.archivo, input.numeroFactura, input.exito, input.mensaje, input.remesas]
  );
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
    condiciones.push(`c.created_at >= $${params.length}::date`);
  }
  if (filtros.hasta) {
    params.push(filtros.hasta);
    condiciones.push(`c.created_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = condiciones.length > 0 ? `where ${condiciones.join(" and ")}` : "";
  const { rows } = await pool.query<CargaRow>(
    `select c.id, c.perfil_id, p.nombre as perfil_nombre, c.usuario_id, u.email as usuario_email,
            c.archivo, c.numero_factura, c.exito, c.mensaje, c.remesas, c.created_at
     from cargas_rndc c
     join perfiles p on p.id = c.perfil_id
     join users u on u.id = c.usuario_id
     ${where}
     order by c.created_at desc
     limit 5000`,
    params
  );
  return rows.map(toReporte);
}
