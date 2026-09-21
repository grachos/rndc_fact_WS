import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Users, Building2, ChevronDown } from "lucide-react";
import { moduleGroups } from "../routes";
import { useAuthStore } from "../store/authStore";

export function Sidebar() {
  const location = useLocation();
  const { user } = useAuthStore();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const active = moduleGroups.find((g) => g.modules.some((m) => m.path === location.pathname));
    return active ? { [active.key]: true } : {};
  });

  return (
    <aside className="flex h-full w-72 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="px-4 py-4">
        <h1 className="text-lg font-semibold text-slate-800">Fact-RNDC-Alt</h1>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        <NavLink
          to="/perfiles"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
            }`
          }
        >
          <Building2 size={16} />
          Perfiles
        </NavLink>

        {user?.role === "admin" && (
          <NavLink
            to="/admin/usuarios"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
              }`
            }
          >
            <Users size={16} />
            Usuarios
          </NavLink>
        )}

        <div className="my-2 border-t border-slate-100" />

        {moduleGroups.map((group) => {
          const isOpen = Boolean(openGroups[group.key]);
          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => setOpenGroups((s) => ({ ...s, [group.key]: !s[group.key] }))}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {group.label}
                <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="ml-2 space-y-0.5 border-l border-slate-100 pl-2">
                  {group.modules
                    .filter((m) => !m.adminOnly || user?.role === "admin")
                    .map((m) => (
                    <NavLink
                      key={m.path}
                      to={m.path}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                          isActive ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"
                        }`
                      }
                    >
                      <m.icon size={15} />
                      <span className="truncate">{m.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
