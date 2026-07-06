/* ==========================================================================
   Web Worker: ejecuta la extracción de paleta en un hilo aparte para que la
   interfaz nunca se congele. La lógica del algoritmo vive en palette-core.js,
   compartida con la página principal y con las pruebas.

   Recibe:  { pixels: Uint8ClampedArray (RGBA), k: número de colores }
   Devuelve: { ok, colors } o { ok:false, error }
   ========================================================================== */
importScripts("palette-core.js");

self.onmessage = function (e) {
  const { pixels, k } = e.data;
  try {
    const colors = self.extractPalette(pixels, k);
    self.postMessage({ ok: true, colors: colors });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
