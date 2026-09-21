import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FileSpreadsheet,
  UploadCloud,
  Search,
  Link2,
  Package,
  Pencil,
  Ban,
  CheckCircle2,
  Repeat,
  ClipboardList,
  Clock,
  Stamp,
  ShieldAlert,
  XCircle,
  FileCode,
  Wrench,
  FileScan,
  GitCompare,
  BarChart3,
} from "lucide-react";

export interface ModuleRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Placeholder pages render "próximamente" until their phase is built. */
  placeholder?: boolean;
  /** Hidden from non-admins in the sidebar, and the route itself redirects them away. */
  adminOnly?: boolean;
}

export interface ModuleGroup {
  key: string;
  label: string;
  modules: ModuleRoute[];
}

export const moduleGroups: ModuleGroup[] = [
  {
    key: "facturacion",
    label: "🧾 Facturación",
    modules: [
      { path: "/facturacion/generar-xml", label: "Generar XML", icon: FileText },
      { path: "/facturacion/generar-excel", label: "Generar facturas vía Excel", icon: FileSpreadsheet },
      { path: "/facturacion/cargar-rndc", label: "Cargar facturas a RNDC", icon: UploadCloud },
      { path: "/facturacion/consultar-factura", label: "Consultar factura", icon: Search },
      { path: "/facturacion/consultar-factura-remesa", label: "Consultar factura por remesa", icon: Link2 },
      { path: "/facturacion/reporte-cargas", label: "Reporte de cargas RNDC", icon: BarChart3, adminOnly: true },
    ],
  },
  {
    key: "remesas",
    label: "📋 Remesas",
    modules: [
      { path: "/remesas/consultar", label: "Consultar remesas", icon: Package, placeholder: true },
      { path: "/remesas/corregir", label: "Corregir remesa", icon: Pencil, placeholder: true },
      { path: "/remesas/anular-cumplido", label: "Anular cumplido remesa", icon: Ban, placeholder: true },
      { path: "/remesas/cumplir", label: "Cumplir remesa", icon: CheckCircle2, placeholder: true },
      { path: "/remesas/auto-cambio-generador", label: "Auto cambio-generador", icon: Repeat, placeholder: true },
    ],
  },
  {
    key: "manifiesto",
    label: "📑 Manifiesto",
    modules: [
      { path: "/manifiesto/consultar", label: "Consultar manifiesto", icon: ClipboardList, placeholder: true },
      { path: "/manifiesto/tiempos", label: "Consultar tiempos logísticos", icon: Clock, placeholder: true },
      { path: "/manifiesto/cumplir", label: "Cumplir manifiesto", icon: Stamp, placeholder: true },
      { path: "/manifiesto/corregir-fopat", label: "Corregir FOPAT manifiesto", icon: ShieldAlert, placeholder: true },
      { path: "/manifiesto/anular-cumplido", label: "Anular cumplido manifiesto", icon: XCircle, placeholder: true },
    ],
  },
  {
    key: "otros",
    label: "🔩 Otros",
    modules: [
      { path: "/otros/editar-xml", label: "Editar XML", icon: FileCode, placeholder: true },
      { path: "/otros/reconstruir-xml", label: "Reconstruir XML", icon: Wrench, placeholder: true },
      { path: "/otros/extraer-rg", label: "Extraer datos RG", icon: FileScan, placeholder: true },
      { path: "/otros/cruzar-remesas", label: "Cruzar remesas", icon: GitCompare, placeholder: true },
    ],
  },
];

export const allModules = moduleGroups.flatMap((g) => g.modules);
