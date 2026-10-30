import { gunzipSync, gzipSync } from "node:zlib";
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
  tiene_xml: boolean;
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
    tieneXml: row.tiene_xml,
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
  /** The exact XML file that was sent (or blocked) — kept as evidence, gzip-compressed. */
  xml: Buffer;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `insert into cargas_rndc (perfil_id, usuario_id, archivo, numero_factura, exito, mensaje, remesas, xml_gz)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.perfilId,
      input.usuarioId,
      input.archivo,
      input.numeroFactura,
      input.exito,
      input.mensaje,
      input.remesas,
      gzipSync(input.xml),
    ]
  );
  return rows[0]!.id;
}

export async function getCargaXml(id: number): Promise<{ archivo: string; xml: Buffer } | null> {
  const { rows } = await pool.query<{ archivo: string; xml_gz: Buffer | null }>(
    "select archivo, xml_gz from cargas_rndc where id = $1",
    [id]
  );
  const row = rows[0];
  if (!row?.xml_gz) return null;
  return { archivo: row.archivo, xml: gunzipSync(row.xml_gz) };
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
    `select c.id, c.perfil_id, p.nombre as perfil_nombre, c.usuario_id, u.email as usuario_email,
            c.archivo, c.numero_factura, c.exito, c.mensaje, c.remesas,
            (c.xml_gz is not null) as tiene_xml, c.created_at
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
