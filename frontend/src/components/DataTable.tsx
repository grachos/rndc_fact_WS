interface Props {
  rows: Record<string, unknown>[];
  emptyLabel?: string;
}

/** Generic key/value table for RNDC "raw fields" responses — renders whatever columns show up. */
export function DataTable({ rows, emptyLabel = "Sin resultados." }: Props) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-400">{emptyLabel}</p>;
  }
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-2 text-slate-700">
                  {String(row[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
