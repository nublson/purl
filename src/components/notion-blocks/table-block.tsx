import type { ReactNode } from "react";
import type { NotionBlock } from "@/lib/notion";
import { RichText } from "./rich-text";
import type { NotionRenderContext } from "./types";

const CELL = "border px-4 py-2 text-left align-top";
const HEADER_CELL = `${CELL} bg-card font-semibold text-foreground`;

export function TableBlock({
  block,
  context,
}: {
  block: NotionBlock;
  context: NotionRenderContext;
}) {
  if (block.type !== "table") return null;
  const { has_column_header, has_row_header } = block.table;
  const rows = (block.children ?? []).filter((r) => r.type === "table_row");
  if (rows.length === 0) return null;

  const cells = (row: NotionBlock) =>
    row.type === "table_row" ? row.table_row.cells : [];

  const renderRow = (row: NotionBlock, head: boolean): ReactNode => (
    <tr key={row.id}>
      {cells(row).map((cell, i) =>
        head ? (
          <th key={i} scope="col" className={HEADER_CELL}>
            <RichText text={cell} context={context} />
          </th>
        ) : i === 0 && has_row_header ? (
          <th key={i} scope="row" className={HEADER_CELL}>
            <RichText text={cell} context={context} />
          </th>
        ) : (
          <td key={i} className={CELL}>
            <RichText text={cell} context={context} />
          </td>
        ),
      )}
    </tr>
  );

  const [first, ...rest] = rows;
  return (
    <div
      role="region"
      aria-label="Table"
      tabIndex={0}
      className="max-w-3xl overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table className="w-full border-collapse text-sm text-muted-foreground">
        {has_column_header ? (
          <>
            <thead>{renderRow(first, true)}</thead>
            <tbody>{rest.map((r) => renderRow(r, false))}</tbody>
          </>
        ) : (
          <tbody>{rows.map((r) => renderRow(r, false))}</tbody>
        )}
      </table>
    </div>
  );
}
