import type { Settings, SettingsInput } from "@fe-tool/shared";
import { pool } from "../pool.js";

interface SettingsRow {
  fopat_fecha_inicio: string;
  max_facturas_generar: number;
}

function toSettings(row: SettingsRow): Settings {
  return {
    fopatFechaInicio: row.fopat_fecha_inicio,
    maxFacturasGenerar: row.max_facturas_generar,
  };
}

export async function getSettings(): Promise<Settings> {
  const { rows } = await pool.query<SettingsRow>(
    "select fopat_fecha_inicio, max_facturas_generar from settings where id = true"
  );
  return toSettings(rows[0]!);
}

export async function updateSettings(input: SettingsInput): Promise<Settings> {
  const { rows } = await pool.query<SettingsRow>(
    `update settings set
       fopat_fecha_inicio = coalesce($1, fopat_fecha_inicio),
       max_facturas_generar = coalesce($2, max_facturas_generar)
     where id = true
     returning fopat_fecha_inicio, max_facturas_generar`,
    [input.fopatFechaInicio ?? null, input.maxFacturasGenerar ?? null]
  );
  return toSettings(rows[0]!);
}
