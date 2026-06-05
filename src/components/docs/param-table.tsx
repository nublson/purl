import { cn } from "@/lib/utils";

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface ParamTableProps {
  params: Param[];
  className?: string;
}

export function ParamTable({ params, className }: ParamTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
              Parameter
            </th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
              Type
            </th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {params.map((param, i) => (
            <tr
              key={param.name}
              className={cn(
                i < params.length - 1 && "border-b border-border",
              )}
            >
              <td className="px-4 py-3 font-mono text-xs">
                <span className="text-foreground">{param.name}</span>
                {param.required && (
                  <span className="ml-1 text-red-500">*</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {param.type}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {param.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
