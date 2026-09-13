import { postConsultaMulti, q } from "./client.js";
import type { PerfilCredenciales } from "../../db/queries/perfiles.queries.js";

export interface RadicadoRemesa {
  radicado: string;
  peso: string;
  estado: string;
  propietario: string;
  origen: string;
  destino: string;
  manifiesto: string;
  propietarioNit: string;
}

/**
 * Gets the INGRESOID (radicado) and CANTIDADCARGADA (peso) of a remesa — proceso 3, tipo 3.
 * A remesa with history can return several <documento> with different estados (AC/CE) in
 * no particular order: prefer CE (cumplida), else the one with the highest INGRESOID
 * (most recent). Port of consultar_radicado_remesa.
 */
export async function consultarRadicadoRemesa(
  consecutivoRemesa: string,
  perfil: PerfilCredenciales
): Promise<{ ok: true; data: RadicadoRemesa } | { ok: false; error: string }> {
  const rndcXml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
  <acceso>
    <username>${perfil.rndcUsuario}</username>
    <password>${perfil.rndcPassword}</password>
  </acceso>
  <solicitud>
    <tipo>3</tipo>
    <procesoid>3</procesoid>
  </solicitud>
  <variables>INGRESOID,CONSECUTIVOREMESA,CANTIDADCARGADA,ESTADO,REMPROPIETARIO,REM_DESTI,REM_ORIG,NUMMANIFIESTOCARGA,NUMIDPROPIETARIO</variables>
  <documento>
    <NUMNITEMPRESATRANSPORTE>${q(perfil.nitSocio)}</NUMNITEMPRESATRANSPORTE>
    <CONSECUTIVOREMESA>${q(consecutivoRemesa)}</CONSECUTIVOREMESA>
  </documento>
</root>`;

  const res = await postConsultaMulti(rndcXml, 15000);
  if (!res.ok) return { ok: false, error: res.error };
  if (res.docs.length === 0) {
    return { ok: false, error: `Remesa no encontrada: ${consecutivoRemesa}` };
  }

  const ceDoc = res.docs.find((d) => (d.estado ?? "").trim().toUpperCase() === "CE");
  const doc =
    ceDoc ??
    res.docs.reduce((max, d) => (Number(d.ingresoid ?? 0) > Number(max.ingresoid ?? 0) ? d : max));

  const radicado = (doc.ingresoid ?? "").trim();
  if (!radicado) {
    return { ok: false, error: `Remesa no encontrada: ${consecutivoRemesa}` };
  }

  return {
    ok: true,
    data: {
      radicado,
      peso: (doc.cantidadcargada ?? "").trim(),
      estado: (doc.estado ?? "").trim().toUpperCase(),
      propietario: (doc.rempropietario ?? "").trim(),
      origen: (doc.rem_orig ?? "").trim(),
      destino: (doc.rem_desti ?? "").trim(),
      manifiesto: (doc.nummanifiestocarga ?? "").trim(),
      propietarioNit: (doc.numidpropietario ?? "").trim(),
    },
  };
}
