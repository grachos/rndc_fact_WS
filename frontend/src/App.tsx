import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/auth/Login";
import { PerfilesList } from "./pages/perfiles/PerfilesList";
import { PerfilForm } from "./pages/perfiles/PerfilForm";
import { UsersList } from "./pages/admin/UsersList";
import { ModulePlaceholder } from "./pages/ModulePlaceholder";
import { GenerarXml } from "./pages/facturacion/GenerarXml";
import { GenerarExcel } from "./pages/facturacion/GenerarExcel";
import { CargarRndc } from "./pages/facturacion/CargarRndc";
import { ConsultarFactura } from "./pages/facturacion/ConsultarFactura";
import { ConsultarFacturaPorRemesa } from "./pages/facturacion/ConsultarFacturaPorRemesa";
import { ReporteCargas } from "./pages/facturacion/ReporteCargas";
import { allModules } from "./routes";

const facturacionPages: Record<string, JSX.Element> = {
  "/facturacion/generar-xml": <GenerarXml />,
  "/facturacion/generar-excel": <GenerarExcel />,
  "/facturacion/cargar-rndc": <CargarRndc />,
  "/facturacion/consultar-factura": <ConsultarFactura />,
  "/facturacion/consultar-factura-remesa": <ConsultarFacturaPorRemesa />,
  "/facturacion/reporte-cargas": <ReporteCargas />,
};

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/perfiles" replace />} />
        <Route path="/perfiles" element={<PerfilesList />} />
        <Route
          path="/perfiles/nuevo"
          element={
            <ProtectedRoute adminOnly>
              <PerfilForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/perfiles/:id"
          element={
            <ProtectedRoute adminOnly>
              <PerfilForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/usuarios"
          element={
            <ProtectedRoute adminOnly>
              <UsersList />
            </ProtectedRoute>
          }
        />

        {allModules.map((m) => (
          <Route
            key={m.path}
            path={m.path}
            element={facturacionPages[m.path] ?? <ModulePlaceholder label={m.label} />}
          />
        ))}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
