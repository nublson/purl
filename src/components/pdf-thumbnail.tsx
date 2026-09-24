"use client";

import * as React from "react";

type PdfThumbnailProps = {
  url: string;
};

type RenderState = "loading" | "done" | "error";

export function PdfThumbnail({ url }: PdfThumbnailProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [renderState, setRenderState] = React.useState<RenderState>("loading");

  React.useEffect(() => {
    let isActive = true;
    let renderTask: { cancel: () => void } | null = null;
    let loadingTask: { destroy: () => void; promise: Promise<unknown> } | null =
      null;

    const render = async () => {
      setRenderState("loading");

      try {
        const pdfjsLib = await import("pdfjs-dist");
        const workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

        const proxyUrl = `/api/pdf-proxy?url=${encodeURIComponent(url)}`;
        loadingTask = pdfjsLib.getDocument(proxyUrl);
        const pdf = (await loadingTask.promise) as {
          getPage: (pageNumber: number) => Promise<{
            getViewport: (options: { scale: number }) => {
              width: number;
              height: number;
            };
            render: (options: {
              canvas: HTMLCanvasElement;
              canvasContext: CanvasRenderingContext2D;
              viewport: { width: number; height: number };
            }) => { promise: Promise<void>; cancel: () => void };
          }>;
        };
        const page = await pdf.getPage(1);
        const initialViewport = page.getViewport({ scale: 1 });
        const targetWidth = 320;
        const scale = targetWidth / initialViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || !isActive) return;

        const context = canvas.getContext("2d");
        if (!context) {
          setRenderState("error");
          return;
        }

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        const nextRenderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        renderTask = nextRenderTask;
        await nextRenderTask.promise;

        if (!isActive) return;
        setRenderState("done");
      } catch {
        if (!isActive) return;
        setRenderState("error");
      }
    };

    render();

    return () => {
      isActive = false;
      renderTask?.cancel();
      loadingTask?.destroy();
    };
  }, [url]);

  if (renderState === "error") return null;

  return (
    <>
      {renderState === "loading" && (
        <div className="w-full aspect-video animate-pulse bg-muted rounded-t-md" />
      )}
      <canvas
        ref={canvasRef}
        className={
          renderState === "done"
            ? "w-full aspect-video object-cover object-top rounded-t-md"
            : "hidden"
        }
      />
    </>
  );
}
