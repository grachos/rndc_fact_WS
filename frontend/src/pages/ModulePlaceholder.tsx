interface Props {
  label: string;
}

export function ModulePlaceholder({ label }: Props) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
      <p className="text-lg font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-sm">🚧 Próximamente — este módulo aún no ha sido migrado.</p>
    </div>
  );
}
