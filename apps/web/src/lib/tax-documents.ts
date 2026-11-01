/** Browser-only document processing. No document or extracted text is sent to an API. */
export async function readTaxDocument(file: File, progress: (message: string) => void, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a document smaller than 10 MB.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf && !['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PDF, PNG or JPEG document.');
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let loading: { destroy(): Promise<void> } | null = null;
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new DOMException('Reading cancelled.', 'AbortError')); });
  signal?.addEventListener('abort', rejectAbort!, { once: true });
  const recognize = async (image: File | HTMLCanvasElement) => {
    signal?.throwIfAborted();
    if (!worker) {
      const created = await createWorker('eng', 1, {
      workerPath: '/document-tools/worker.min.js', corePath: '/document-tools/core', langPath: '/document-tools/lang', cacheMethod: 'none',
      logger: (status) => progress(`Reading document: ${Math.round(status.progress * 100)}%`),
      });
      if (signal?.aborted) { await created.terminate(); signal.throwIfAborted(); }
      worker = created;
    }
    return (await worker.recognize(image)).data.text;
  };
  const process = async () => {
    signal?.throwIfAborted();
    if (!isPdf) {
      const bitmap = await createImageBitmap(file);
      const pixels = bitmap.width * bitmap.height;
      bitmap.close();
      signal?.throwIfAborted();
      if (pixels > 20000000) throw new Error('Image is too large. Resize it below 20 megapixels.');
      return await recognize(file);
    }
    const pdfjs = await import('pdfjs-dist');
    signal?.throwIfAborted();
    pdfjs.GlobalWorkerOptions.workerSrc = '/document-tools/pdf.worker.min.mjs';
    const data = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
    const task = pdfjs.getDocument({ data, wasmUrl: '/document-tools/pdf-wasm/', standardFontDataUrl: '/document-tools/pdf-fonts/', cMapUrl: '/document-tools/pdf-cmaps/', cMapPacked: true });
    loading = task;
    const pdf = await task.promise;
    try {
      if (pdf.numPages > 15) throw new Error('Choose a PDF with at most 15 pages.');
      const pages: string[] = [];
      let scannedPages = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        signal?.throwIfAborted();
        progress(`Reading page ${number} of ${pdf.numPages}`);
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const lines = new Map<number, { x: number; text: string }[]>();
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = Math.round(item.transform[5]);
          const row = lines.get(y) ?? [];
          row.push({ x: item.transform[4], text: item.str }); lines.set(y, row);
        }
        let text = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ')).join('\n');
        if (text.trim().length < 20) {
          if (++scannedPages > 6) throw new Error('Split scanned PDFs into documents of at most six pages.');
          const viewport = page.getViewport({ scale: 1.5 });
          if (viewport.width * viewport.height > 8000000) throw new Error('Scanned page is too large to process safely.');
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          try { await page.render({ canvas, viewport }).promise; text = await recognize(canvas); }
          finally { canvas.width = 0; canvas.height = 0; }
        }
        pages.push(text);
        page.cleanup();
      }
      return pages.join('\n\n');
    } finally { /* The outer cleanup also runs when loading or OCR is cancelled. */ }
  };
  try {
    if (signal?.aborted) rejectAbort!();
    return await Promise.race([process(), aborted]);
  } finally {
    signal?.removeEventListener('abort', rejectAbort!);
    await Promise.allSettled([
      worker ? (worker as Awaited<ReturnType<typeof createWorker>>).terminate() : Promise.resolve(),
      loading ? (loading as { destroy(): Promise<void> }).destroy() : Promise.resolve(),
    ]);
  }
}
