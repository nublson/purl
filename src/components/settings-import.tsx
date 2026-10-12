"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ChevronDown, Upload } from "reicon-react";
import { useFolders } from "@/hooks/use-folders";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { parseImportFile } from "@/lib/import";
import {
  doneSummary,
  importableCount,
  previewSummary,
} from "@/lib/import/import-summary";
import { runImport } from "@/lib/import/run-import";
import type {
  ImportFormat,
  ImportItem,
  ImportLinksResult,
} from "@/lib/import/types";
import { MAX_IMPORT_FILE_BYTES, MAX_SAVED_LINKS } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import type { UsageMeterData } from "./usage-item";

const UNRECOGNIZED_MESSAGE =
  "We couldn’t recognize this file. Use a bookmarks export from your browser, or a CSV from Raindrop or Pocket.";
const TOO_BIG_MESSAGE =
  "This file is over 5 MB. Export fewer bookmarks and try again.";
const EMPTY_MESSAGE = "No links found in this file.";
const READ_FAILED_MESSAGE = "We couldn’t read this file. Try again.";
const GENERIC_MESSAGE = "Something went wrong. Try again.";

const ACCEPT = ".html,.htm,.csv";

/** A file read and parsed in the browser. */
type ParsedFile = {
  format: ImportFormat;
  items: ImportItem[];
  skipped: number;
  folders: { name: string; count: number }[];
};

/** One import of a parsed file: what's sent and how far it got. */
type ImportRun = {
  parsed: ParsedFile;
  /** The items sent: the newest that fit in the room left. */
  items: ImportItem[];
  /** How many of `items` the server has answered for. */
  sent: number;
  totals: ImportLinksResult;
};

type ImportState =
  | { kind: "idle" }
  | { kind: "preview"; parsed: ParsedFile }
  | { kind: "importing"; run: ImportRun }
  | { kind: "done"; run: ImportRun }
  | { kind: "error"; message: string; run?: ImportRun };

function emptyTotals(): ImportLinksResult {
  return {
    imported: 0,
    duplicates: 0,
    invalid: 0,
    overLimit: 0,
    foldersCreated: 0,
    unfiledForFolderLimit: 0,
    limitReached: false,
  };
}

function addTotals(a: ImportLinksResult, b: ImportLinksResult): ImportLinksResult {
  return {
    imported: a.imported + b.imported,
    duplicates: a.duplicates + b.duplicates,
    invalid: a.invalid + b.invalid,
    overLimit: a.overLimit + b.overLimit,
    foldersCreated: a.foldersCreated + b.foldersCreated,
    unfiledForFolderLimit: a.unfiledForFolderLimit + b.unfiledForFolderLimit,
    limitReached: a.limitReached || b.limitReached,
  };
}

const formatCount = (n: number) => n.toLocaleString("en-US");

/**
 * The done wording. Links never sent (trimmed to the room left, or after the
 * server reported the limit reached) count as over the limit.
 */
function summaryFor(run: ImportRun) {
  const trimmed = run.parsed.items.length - run.sent;
  return doneSummary(
    { ...run.totals, overLimit: run.totals.overLimit + trimmed },
    run.parsed.skipped,
  );
}

const BUTTON_ROW = "flex flex-col gap-2 sm:flex-row";
const ROW_BUTTON = "w-full cursor-pointer sm:w-auto";

/**
 * Settings → Import: reads a bookmarks file (browser HTML, Raindrop or Pocket
 * CSV) in the browser, previews it, then sends it in chunks with `runImport`.
 */
export function SettingsImport({
  usage,
  closeDialog,
}: {
  usage: UsageMeterData | null;
  closeDialog: () => void;
}) {
  const router = useRouter();
  const { folders, refresh } = useFolders();
  const { notifyLinksChanged } = useLinksSyncActions();

  const [state, setStateValue] = React.useState<ImportState>({ kind: "idle" });
  // Mirrors `state` synchronously, so two clicks in one frame can't both
  // start an import.
  const stateRef = React.useRef<ImportState>(state);
  const setState = React.useCallback((next: ImportState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const [status, setStatus] = React.useState("");
  const [dragging, setDragging] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  // Bumped on every file chosen: a slow read that a newer one replaced is dropped.
  const readIdRef = React.useRef(0);

  // Closing the dialog unmounts the tab: stop sending (chunks sent stay saved).
  React.useEffect(() => () => controllerRef.current?.abort(), []);

  // Focus the heading of the preview once a file is read, and of the summary
  // once an import is done.
  React.useEffect(() => {
    if (state.kind === "preview" || state.kind === "done") {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-import-heading]")
        ?.focus();
    }
  }, [state]);

  const room = usage ? usage.saves.cap - usage.saves.used : MAX_SAVED_LINKS;

  // A function, so a check after an `await` isn't narrowed by one before it.
  const isImporting = () => stateRef.current.kind === "importing";

  const handleFile = async (file: File) => {
    if (isImporting()) return;
    const readId = ++readIdRef.current;

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setState({ kind: "error", message: TOO_BIG_MESSAGE });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      if (readId === readIdRef.current) {
        setState({ kind: "error", message: READ_FAILED_MESSAGE });
      }
      return;
    }
    // A newer file replaced this one, or an import started meanwhile.
    if (readId !== readIdRef.current || isImporting()) {
      return;
    }

    const result = parseImportFile(text);
    if (!result.ok) {
      setState({
        kind: "error",
        message: result.reason === "empty" ? EMPTY_MESSAGE : UNRECOGNIZED_MESSAGE,
      });
      return;
    }
    const { format, items, skipped, folders: fileFolders } = result;
    setState({
      kind: "preview",
      parsed: { format, items, skipped, folders: fileFolders },
    });
  };

  const chooseFile = () => inputRef.current?.click();

  /** Sends `run.items` from `run.sent` on, adding to `run.totals`. */
  const send = async (run: ImportRun) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let current: ImportRun = run;
    setState({ kind: "importing", run: current });

    let outcome: Awaited<ReturnType<typeof runImport>> | null = null;
    try {
      outcome = await runImport(run.items.slice(run.sent), {
        signal: controller.signal,
        onProgress: (done) => {
          current = { ...current, sent: run.sent + done };
          if (!controller.signal.aborted) {
            setState({ kind: "importing", run: current });
          }
        },
      });
    } catch {
      outcome = null;
    }

    // Some chunks may be saved even when the run failed or was stopped.
    refresh();
    notifyLinksChanged();
    if (controller.signal.aborted) return;
    controllerRef.current = null;

    if (!outcome) {
      // The totals of chunks already answered are lost with the thrown
      // error; what's sent is still known, so Try again resumes after it.
      setStatus("");
      setState({ kind: "error", message: GENERIC_MESSAGE, run: current });
      return;
    }

    const finished: ImportRun = {
      ...current,
      totals: addTotals(run.totals, outcome.totals),
    };
    if (outcome.stopped === "error") {
      setStatus("");
      setState({
        kind: "error",
        message: outcome.error?.message ?? GENERIC_MESSAGE,
        run: finished,
      });
      return;
    }
    if (outcome.stopped === "aborted") return;

    setStatus(`${summaryFor(finished).title}.`);
    setState({ kind: "done", run: finished });
  };

  const startImport = () => {
    const current = stateRef.current;
    if (current.kind !== "preview") return;
    const { parsed } = current;
    const items = parsed.items.slice(0, importableCount(parsed.items.length, room));
    setStatus(
      `Importing ${formatCount(items.length)} ${items.length === 1 ? "link" : "links"}.`,
    );
    void send({ parsed, items, sent: 0, totals: emptyTotals() });
  };

  const retryImport = () => {
    const current = stateRef.current;
    if (current.kind !== "error" || !current.run) return;
    const remaining = current.run.items.length - current.run.sent;
    setStatus(
      `Importing ${formatCount(remaining)} ${remaining === 1 ? "link" : "links"}.`,
    );
    void send(current.run);
  };

  const reset = () => {
    readIdRef.current++;
    setStatus("");
    setState({ kind: "idle" });
  };

  return (
    <div ref={rootRef} className="w-full flex-1 flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-cy="import-file-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared, so choosing the same file again still fires a change.
          event.currentTarget.value = "";
          if (file) void handleFile(file);
        }}
      />

      {state.kind === "idle" && (
        <>
          <div
            className={cn(
              "flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors motion-reduce:transition-none",
              dragging && "border-foreground/40 bg-muted",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(event) => {
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <Button
              type="button"
              variant="secondary"
              className={ROW_BUTTON}
              onClick={chooseFile}
            >
              <Upload />
              Choose a file
            </Button>
            <Typography size="small">
              {dragging ? "Drop to import" : "or drop it here"}
            </Typography>
          </div>

          <ul className="flex flex-col gap-1.5">
            <Typography component="li" size="small">
              <span className="font-medium text-foreground">Browsers:</span>{" "}
              open the bookmark manager and choose Export.
            </Typography>
            <Typography component="li" size="small">
              <span className="font-medium text-foreground">Raindrop:</span>{" "}
              Settings → Backups → CSV. The full backup keeps your folders; a
              single collection’s export doesn’t.
            </Typography>
            <Typography component="li" size="small">
              <span className="font-medium text-foreground">Pocket:</span> the
              CSV from your Pocket export.
            </Typography>
          </ul>

          <Typography size="mini">
            Your file is read in your browser. Only the links, titles, folder
            names and dates are sent to Purl.
          </Typography>
        </>
      )}

      {state.kind === "preview" && (
        <PreviewView
          parsed={state.parsed}
          room={room}
          existingFolderNames={folders.map((folder) => folder.name)}
          onImport={startImport}
          onChooseAnother={chooseFile}
        />
      )}

      {state.kind === "importing" && (
        <ProgressView sent={state.run.sent} total={state.run.items.length} />
      )}

      {state.kind === "done" && (
        <section data-cy="import-summary" className="flex flex-col gap-4">
          <SummaryText summary={summaryFor(state.run)} />
          <div className={BUTTON_ROW}>
            <Button
              type="button"
              className={ROW_BUTTON}
              data-cy="import-view-links"
              onClick={() => {
                closeDialog();
                router.push("/home");
              }}
            >
              View links
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={ROW_BUTTON}
              onClick={reset}
            >
              Import another file
            </Button>
          </div>
        </section>
      )}

      {state.kind === "error" && (
        <div className="flex flex-col gap-4">
          <div
            role="alert"
            data-cy="import-error"
            className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          >
            <Typography size="small" className="text-foreground">
              {state.message}
            </Typography>
            {state.run && state.run.totals.imported > 0 && (
              <Typography size="small">
                {formatCount(state.run.totals.imported)}{" "}
                {state.run.totals.imported === 1 ? "link was" : "links were"}{" "}
                imported before this; trying again skips them.
              </Typography>
            )}
          </div>
          <div className={BUTTON_ROW}>
            {state.run && (
              <Button
                type="button"
                className={ROW_BUTTON}
                data-cy="import-retry"
                onClick={retryImport}
              >
                Try again
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className={ROW_BUTTON}
              data-cy="import-choose-another"
              onClick={chooseFile}
            >
              Choose another file
            </Button>
          </div>
        </div>
      )}

      <Typography
        component="p"
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {status}
      </Typography>
    </div>
  );
}

function PreviewView({
  parsed,
  room,
  existingFolderNames,
  onImport,
  onChooseAnother,
}: {
  parsed: ParsedFile;
  room: number;
  existingFolderNames: string[];
  onImport: () => void;
  onChooseAnother: () => void;
}) {
  const { heading, lines } = previewSummary(
    {
      format: parsed.format,
      itemCount: parsed.items.length,
      folders: parsed.folders,
      skipped: parsed.skipped,
    },
    room,
    existingFolderNames,
  );
  const nothingFits = importableCount(parsed.items.length, room) === 0;

  return (
    <section data-cy="import-preview" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Typography
          component="h3"
          tabIndex={-1}
          data-import-heading=""
          className="font-medium text-foreground tabular-nums outline-none"
        >
          {heading}
        </Typography>
        {lines.map((line) => (
          <Typography key={line} size="small" className="tabular-nums">
            {line}
          </Typography>
        ))}
      </div>

      {parsed.folders.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group -ml-2.5 cursor-pointer"
            >
              See folders
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {parsed.folders.map((folder) => (
                <Typography
                  key={folder.name}
                  component="li"
                  size="small"
                  className="flex justify-between gap-3"
                >
                  <span className="truncate text-foreground">{folder.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatCount(folder.count)}
                  </span>
                </Typography>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className={BUTTON_ROW}>
        <Button
          type="button"
          className={ROW_BUTTON}
          data-cy="import-submit"
          disabled={nothingFits}
          onClick={onImport}
        >
          Import
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={ROW_BUTTON}
          data-cy="import-choose-another"
          onClick={onChooseAnother}
        >
          Choose another file
        </Button>
      </div>
    </section>
  );
}

function ProgressView({ sent, total }: { sent: number; total: number }) {
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <section data-cy="import-progress" className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={sent}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <Typography size="small" className="tabular-nums">
        Importing {formatCount(sent)} of {formatCount(total)}
      </Typography>
    </section>
  );
}

function SummaryText({
  summary,
}: {
  summary: { title: string; lines: string[] };
}) {
  return (
    <div className="flex flex-col gap-1">
      <Typography
        component="h3"
        tabIndex={-1}
        data-import-heading=""
        className="font-medium text-foreground tabular-nums outline-none"
      >
        {summary.title}
      </Typography>
      {summary.lines.map((line) => (
        <Typography key={line} size="small" className="tabular-nums">
          {line}
        </Typography>
      ))}
    </div>
  );
}
