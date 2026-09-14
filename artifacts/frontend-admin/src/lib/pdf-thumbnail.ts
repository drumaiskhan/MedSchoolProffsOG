import * as pdfjsLib from 'pdfjs-dist';
// Vite-specific `?url` import: gives us the built worker file's final URL
// instead of trying to inline/parse it, which is what pdfjs-dist's worker
// needs (it runs in its own thread, not bundled into the main chunk).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Renders page 1 of a PDF File to a JPEG Blob, for the "add book" form's
// auto-thumbnail (see AdminBooks.tsx: used only when the admin uploaded a
// PDF but didn't also supply a manual cover image).
//
// Best-effort by design — matches the call site's comment: a corrupt PDF,
// a worker load failure, or any other error here should mean "no
// thumbnail", not "the book failed to save". Callers should not need
// their own try/catch around this; failures resolve to null instead of
// throwing.
export async function renderPdfFirstPageThumbnail(file: File, maxWidth = 480): Promise<Blob | null> {
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) return null;

    await page.render({ canvasContext, viewport }).promise;

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
    });
  } catch (err) {
    console.warn('renderPdfFirstPageThumbnail: falling back to no thumbnail', err);
    return null;
  }
}
