import type { Perfil, PerfilInput } from "@fe-tool/shared";
import { pool } from "../pool.js";
import { decryptSecret, encryptSecret } from "../../services/security/crypto.js";

interface PerfilRow {
  id: number;
  nombre: string;
  nit_socio: string;
  prefijo_remesa: boolean;
  nit_monitoreo: string | null;
  rndc_usuario: string;
  rndc_password_enc: string;
  rndc_usuario_corregir: string | null;
  rndc_password_corregir_enc: string | null;
  rndc_usuario_monitoreo: string | null;
  rndc_password_monitoreo_enc: string | null;
  xml_template: string | null;
  xml_template_nombre: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Full decrypted credentials, used internally by RNDC service calls — never sent to the frontend. */
export interface PerfilCredenciales {
  id: number;
  nitSocio: string;
  prefijoRemesa: boolean;
  nitMonitoreo: string | null;
  rndcUsuario: string;
  rndcPassword: string;
  rndcUsuarioCorregir: string | null;
  rndcPasswordCorregir: string | null;
  rndcUsuarioMonitoreo: string | null;
  rndcPasswordMonitoreo: string | null;
}

function toPerfil(row: PerfilRow): Perfil {
  return {
    id: row.id,
    nombre: row.nombre,
    nitSocio: row.nit_socio,
    prefijoRemesa: row.prefijo_remesa,
    nitMonitoreo: row.nit_monitoreo,
    rndcUsuario: row.rndc_usuario,
    hasRndcCredenciales: Boolean(row.rndc_password_enc),
    rndcUsuarioCorregir: row.rndc_usuario_corregir,
    hasCorregirCredenciales: Boolean(row.rndc_password_corregir_enc),
    rndcUsuarioMonitoreo: row.rndc_usuario_monitoreo,
    hasMonitoreoCredenciales: Boolean(row.rndc_password_monitoreo_enc),
    hasXmlTemplate: Boolean(row.xml_template),
    xmlTemplateNombre: row.xml_template_nombre,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_COLUMNS = `id, nombre, nit_socio, prefijo_remesa, nit_monitoreo,
  rndc_usuario, rndc_password_enc, rndc_usuario_corregir, rndc_password_corregir_enc,
  rndc_usuario_monitoreo, rndc_password_monitoreo_enc,
  xml_template, xml_template_nombre, created_at, updated_at`;

export async function listPerfiles(): Promise<Perfil[]> {
  const { rows } = await pool.query<PerfilRow>(`select ${SELECT_COLUMNS} from perfiles order by nombre asc`);
  return rows.map(toPerfil);
}

export async function getPerfil(id: number): Promise<Perfil | null> {
  const { rows } = await pool.query<PerfilRow>(`select ${SELECT_COLUMNS} from perfiles where id = $1`, [id]);
  return rows[0] ? toPerfil(rows[0]) : null;
}

/** Decrypted credentials for internal RNDC calls. */
export async function getPerfilCredenciales(id: number): Promise<PerfilCredenciales | null> {
  const { rows } = await pool.query<PerfilRow>(`select ${SELECT_COLUMNS} from perfiles where id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    nitSocio: row.nit_socio,
    prefijoRemesa: row.prefijo_remesa,
    nitMonitoreo: row.nit_monitoreo,
    rndcUsuario: row.rndc_usuario,
    rndcPassword: decryptSecret(row.rndc_password_enc),
    rndcUsuarioCorregir: row.rndc_usuario_corregir,
    rndcPasswordCorregir: row.rndc_password_corregir_enc ? decryptSecret(row.rndc_password_corregir_enc) : null,
    rndcUsuarioMonitoreo: row.rndc_usuario_monitoreo,
    rndcPasswordMonitoreo: row.rndc_password_monitoreo_enc
      ? decryptSecret(row.rndc_password_monitoreo_enc)
      : null,
  };
}

/** The raw XML template content, used by the invoice generator. Not exposed on the
 * regular Perfil shape (can be tens of KB) — fetched only when actually generating. */
export async function getPerfilXmlTemplate(
  id: number
): Promise<{ contenido: string; nombre: string } | null> {
  const { rows } = await pool.query<{ xml_template: string | null; xml_template_nombre: string | null }>(
    "select xml_template, xml_template_nombre from perfiles where id = $1",
    [id]
  );
  const row = rows[0];
  if (!row?.xml_template) return null;
  return { contenido: row.xml_template, nombre: row.xml_template_nombre ?? "plantilla.xml" };
}

export async function setPerfilXmlTemplate(id: number, contenido: string, nombre: string): Promise<void> {
  await pool.query(
    "update perfiles set xml_template = $2, xml_template_nombre = $3, updated_at = now() where id = $1",
    [id, contenido, nombre]
  );
}

export async function clearPerfilXmlTemplate(id: number): Promise<void> {
  await pool.query(
    "update perfiles set xml_template = null, xml_template_nombre = null, updated_at = now() where id = $1",
    [id]
  );
}

export async function createPerfil(input: PerfilInput): Promise<Perfil> {
  if (!input.rndcPassword) {
    throw new Error("rndcPassword es obligatorio al crear un perfil");
  }
  const { rows } = await pool.query<PerfilRow>(
    `insert into perfiles (
       nombre, nit_socio, prefijo_remesa, nit_monitoreo,
       rndc_usuario, rndc_password_enc,
       rndc_usuario_corregir, rndc_password_corregir_enc,
       rndc_usuario_monitoreo, rndc_password_monitoreo_enc
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${SELECT_COLUMNS}`,
    [
      input.nombre,
      input.nitSocio,
      input.prefijoRemesa ?? false,
      input.nitMonitoreo || null,
      input.rndcUsuario,
      encryptSecret(input.rndcPassword),
      input.rndcUsuarioCorregir || null,
      input.rndcPasswordCorregir ? encryptSecret(input.rndcPasswordCorregir) : null,
      input.rndcUsuarioMonitoreo || null,
      input.rndcPasswordMonitoreo ? encryptSecret(input.rndcPasswordMonitoreo) : null,
    ]
  );
  return toPerfil(rows[0]!);
}

export async function updatePerfil(id: number, input: PerfilInput): Promise<Perfil | null> {
  const { rows } = await pool.query<PerfilRow>(
    `update perfiles set
       nombre = $2, nit_socio = $3, prefijo_remesa = $4, nit_monitoreo = $5,
       rndc_usuario = $6,
       rndc_password_enc = coalesce($7, rndc_password_enc),
       rndc_usuario_corregir = $8,
       rndc_password_corregir_enc = coalesce($9, rndc_password_corregir_enc),
       rndc_usuario_monitoreo = $10,
       rndc_password_monitoreo_enc = coalesce($11, rndc_password_monitoreo_enc),
       updated_at = now()
     where id = $1
     returning ${SELECT_COLUMNS}`,
    [
      id,
      input.nombre,
      input.nitSocio,
      input.prefijoRemesa ?? false,
      input.nitMonitoreo || null,
      input.rndcUsuario,
      input.rndcPassword ? encryptSecret(input.rndcPassword) : null,
      input.rndcUsuarioCorregir || null,
      input.rndcPasswordCorregir ? encryptSecret(input.rndcPasswordCorregir) : null,
      input.rndcUsuarioMonitoreo || null,
      input.rndcPasswordMonitoreo ? encryptSecret(input.rndcPasswordMonitoreo) : null,
    ]
  );
  return rows[0] ? toPerfil(rows[0]) : null;
}

export async function deletePerfil(id: number): Promise<boolean> {
  const { rowCount } = await pool.query("delete from perfiles where id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
