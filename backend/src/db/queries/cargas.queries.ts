import { gunzipSync, gzipSync } from "node:zlib";
import type { CargaRndcReporte } from "@fe-tool/shared";
import { pool } from "../pool.js";

interface CargaRow {
  id: number;
  fuente: "carga" | "generada";
  estado: "exitosa" | "fallida" | "sin_subir";
  origen: "manual" | "excel" | null;
  perfil_id: number;
  perfil_nombre: string;
  usuario_id: number;
  usuario_email: string;
  archivo: string;
  numero_factura: string;
  mensaje: string;
  remesas: number;
  tiene_xml: boolean;
  created_at: Date;
}

function toReporte(row: CargaRow): CargaRndcReporte {
  return {
    id: row.id,
    fuente: row.fuente,
    estado: row.estado,
    origen: row.origen,
    perfilId: row.perfil_id,
    perfilNombre: row.perfil_nombre,
    usuarioId: row.usuario_id,
    usuarioEmail: row.usuario_email,
    archivo: row.archivo,
    numeroFactura: row.numero_factura,
    exito: row.estado === "exitosa",
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

/** Records an invoice generated in the app (manual form or Excel batch), with its XML. */
export async function insertGenerada(input: {
  perfilId: number;
  usuarioId: number;
  numeroFactura: string;
  origen: "manual" | "excel";
  archivo: string;
  remesas: number;
  xml: string;
}): Promise<void> {
  await pool.query(
    `insert into facturas_generadas (perfil_id, usuario_id, numero_factura, origen, archivo, remesas, xml_gz)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.perfilId,
      input.usuarioId,
      input.numeroFactura,
      input.origen,
      input.archivo,
      input.remesas,
      gzipSync(Buffer.from(input.xml, "utf-8")),
    ]
  );
}

export async function getGeneradaXml(id: number): Promise<{ archivo: string; xml: Buffer } | null> {
  const { rows } = await pool.query<{ archivo: string; xml_gz: Buffer | null }>(
    "select archivo, xml_gz from facturas_generadas where id = $1",
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
  estado?: "exitosa" | "fallida" | "sin_subir";
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
}

/**
 * Upload attempts plus generated invoices that were never uploaded. A generated invoice
 * counts as uploaded once there is an upload of the same number for the same empresa
 * made after it was generated; only its latest generation is listed.
 */
export async function listCargas(filtros: ListCargasFiltros): Promise<CargaRndcReporte[]> {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (filtros.perfilId !== undefined) {
    params.push(filtros.perfilId);
    condiciones.push(`r.perfil_id = $${params.length}`);
  }
  if (filtros.estado) {
    params.push(filtros.estado);
    condiciones.push(`r.estado = $${params.length}`);
  }
  if (filtros.desde) {
    params.push(filtros.desde);
    condiciones.push(`(r.created_at at time zone 'America/Bogota')::date >= $${params.length}::date`);
  }
  if (filtros.hasta) {
    params.push(filtros.hasta);
    condiciones.push(`(r.created_at at time zone 'America/Bogota')::date <= $${params.length}::date`);
  }

  const where = condiciones.length > 0 ? `where ${condiciones.join(" and ")}` : "";
  const { rows } = await pool.query<CargaRow>(
    `with cargas as (
       select c.id, 'carga'::text as fuente,
              case when c.exito then 'exitosa' else 'fallida' end as estado,
              (select g.origen from facturas_generadas g
                where g.perfil_id = c.perfil_id and g.numero_factura = c.numero_factura
                order by g.created_at desc limit 1) as origen,
              c.perfil_id, c.usuario_id, c.archivo, c.numero_factura, c.mensaje, c.remesas,
              (c.xml_gz is not null) as tiene_xml, c.created_at
       from cargas_rndc c
     ),
     generadas as (
       select distinct on (g.perfil_id, g.numero_factura)
              g.id, 'generada'::text as fuente, 'sin_subir'::text as estado, g.origen,
              g.perfil_id, g.usuario_id, g.archivo, g.numero_factura,
              'Generada en la aplicación; aún no se ha subido al RNDC.'::text as mensaje, g.remesas,
              (g.xml_gz is not null) as tiene_xml, g.created_at
       from facturas_generadas g
       order by g.perfil_id, g.numero_factura, g.created_at desc
     )
     select r.*, p.nombre as perfil_nombre, u.email as usuario_email
     from (
       select * from cargas
       union all
       select * from generadas g
        where not exists (
          select 1 from cargas_rndc c
           where c.perfil_id = g.perfil_id and c.numero_factura = g.numero_factura
             and c.created_at >= g.created_at
        )
     ) r
     join perfiles p on p.id = r.perfil_id
     join users u on u.id = r.usuario_id
     ${where}
     order by r.created_at desc
     limit 5000`,
    params
  );
  return rows.map(toReporte);
}
