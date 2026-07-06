/* ==========================================================================
   Extractor de Paletas — lógica de la interfaz web (BenaviDev)
   Todo ocurre en el navegador: carga de imagen, extracción (Web Worker),
   muestra de la paleta, copiar y exportar (PNG/JSON/TXT).
   ========================================================================== */
"use strict";

// Tamaño máximo (lado mayor) al que reducimos la imagen para analizarla.
const MAX_ANALYSIS_SIZE = 240;

// Estado de la aplicación.
const state = {
  colors: [],
  fileName: "",
  imageEl: null,
  working: false,
};

// Referencias del DOM.
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const previewCard = $("previewCard");
const previewImg = $("previewImg");
const fileNameLabel = $("fileName");
const countSelect = $("countSelect");
const extractBtn = $("extractBtn");
const statusLabel = $("statusLabel");
const percentLabel = $("percentLabel");
const progressBar = $("progressBar");
const paletteGrid = $("paletteGrid");
const emptyPalette = $("emptyPalette");
const copyAllBtn = $("copyAllBtn");
const exportBtn = $("exportBtn");
const toast = $("toast");

// Diálogo de exportación.
const exportOverlay = $("exportOverlay");
const formatSelect = $("formatSelect");
const nameInput = $("nameInput");
const extLabel = $("extLabel");
const cancelExport = $("cancelExport");
const confirmExport = $("confirmExport");

// Worker de k-means.
const worker = new Worker("kmeans-worker.js");

/* -------------------------------------------------- Carga de imagen */
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
});

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadFile(file);
});

function loadFile(file) {
  if (!file.type.startsWith("image/")) {
    showToast("Ese archivo no es una imagen compatible.", true);
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast("No se pudo leer el archivo.", true);
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => showToast("No se pudo cargar la imagen (¿archivo dañado?).", true);
    img.onload = () => {
      state.imageEl = img;
      state.fileName = file.name;
      previewImg.src = reader.result;
      fileNameLabel.textContent = file.name;
      previewCard.hidden = false;
      extractBtn.disabled = false;
      clearPalette();
      setStatus("Imagen lista. Pulsa «Extraer paleta».", "");
      progressBar.style.width = "0%";
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* -------------------------------------------------- Extracción */
extractBtn.addEventListener("click", () => {
  if (state.working || !state.imageEl) return;
  const k = parseInt(countSelect.value, 10);

  state.working = true;
  extractBtn.disabled = true;
  setStatus("Analizando colores...", "");
  progressBar.classList.add("indeterminate");

  // Reducimos la imagen en un canvas y extraemos los píxeles RGBA.
  let pixels;
  try {
    pixels = getScaledPixels(state.imageEl, MAX_ANALYSIS_SIZE);
  } catch (err) {
    finishError("No se pudieron leer los píxeles de la imagen.");
    return;
  }

  worker.postMessage({ pixels, k }, [pixels.buffer]);
});

worker.onmessage = (e) => {
  progressBar.classList.remove("indeterminate");
  state.working = false;
  extractBtn.disabled = false;

  if (!e.data.ok) {
    finishError(e.data.error || "No se pudo extraer la paleta.");
    return;
  }
  state.colors = e.data.colors;
  renderPalette(state.colors);
  progressBar.style.width = "100%";
  percentLabel.textContent = "100%";
  setStatus("¡Listo! " + state.colors.length + " colores extraídos.", "100%");
  copyAllBtn.disabled = false;
  exportBtn.disabled = false;
};

function finishError(msg) {
  progressBar.classList.remove("indeterminate");
  progressBar.style.width = "0%";
  percentLabel.textContent = "";
  state.working = false;
  extractBtn.disabled = false;
  setStatus("No se pudo extraer la paleta.", "");
  showToast(msg, true);
}

/* Reduce la imagen a max px (lado mayor) y devuelve los píxeles RGBA. */
function getScaledPixels(img, maxSize) {
  let w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data; // Uint8ClampedArray RGBA
}

/* -------------------------------------------------- Paleta */
function clearPalette() {
  state.colors = [];
  paletteGrid.innerHTML = "";
  emptyPalette.style.display = "block";
  copyAllBtn.disabled = true;
  exportBtn.disabled = true;
}

function renderPalette(colors) {
  paletteGrid.innerHTML = "";
  emptyPalette.style.display = colors.length ? "none" : "block";

  // Columnas según cantidad (compacto con muchos colores).
  const n = colors.length;
  paletteGrid.classList.remove("cols-6", "cols-8");
  let compact = false;
  if (n > 12 && n <= 24) { paletteGrid.classList.add("cols-6"); }
  else if (n > 24) { paletteGrid.classList.add("cols-8"); compact = true; }

  colors.forEach((c) => {
    const dark = isDark(c.rgb);
    const textMain = dark ? "#ffffff" : "#0e1311";
    const textDim = dark ? "#e8efe9" : "#26342b";

    const el = document.createElement("div");
    el.className = "swatch" + (compact ? " compact" : "");
    el.style.backgroundColor = c.hex;
    el.title = "Clic para copiar el HEX";
    el.innerHTML =
      '<span class="swatch-hex" style="color:' + textMain + '">' + c.hex + '</span>' +
      '<span class="swatch-rgb" style="color:' + textDim + '">rgb(' + c.rgb.join(", ") + ')</span>' +
      '<span class="swatch-pct" style="color:' + textDim + '">' + c.percentage + '%</span>';

    el.addEventListener("click", () => {
      copyText(c.hex);
      const hexEl = el.querySelector(".swatch-hex");
      const original = hexEl.textContent;
      hexEl.textContent = "¡Copiado!";
      el.classList.add("flash");
      setStatus("Copiado " + c.hex + " al portapapeles.", percentLabel.textContent);
      setTimeout(() => {
        hexEl.textContent = original;
        el.classList.remove("flash");
      }, 850);
    });
    paletteGrid.appendChild(el);
  });
}

function isDark(rgb) {
  const [r, g, b] = rgb;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/* -------------------------------------------------- Copiar */
copyAllBtn.addEventListener("click", () => {
  if (!state.colors.length) return;
  const text = state.colors
    .map((c) => c.hex + "  rgb(" + c.rgb.join(", ") + ")  (" + c.percentage + "%)")
    .join("\n");
  copyText(text);
  showToast("Paleta completa copiada al portapapeles.");
});

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}

/* -------------------------------------------------- Exportar */
exportBtn.addEventListener("click", () => {
  if (!state.colors.length) return;
  const base = state.fileName
    ? "paleta-" + state.fileName.replace(/\.[^.]+$/, "")
    : "paleta";
  nameInput.value = base;
  formatSelect.value = "png";
  extLabel.textContent = ".png";
  exportOverlay.hidden = false;
  nameInput.focus();
});

formatSelect.addEventListener("change", () => {
  extLabel.textContent = "." + formatSelect.value;
});
cancelExport.addEventListener("click", () => { exportOverlay.hidden = true; });
exportOverlay.addEventListener("click", (e) => {
  if (e.target === exportOverlay) exportOverlay.hidden = true;
});

confirmExport.addEventListener("click", () => {
  const fmt = formatSelect.value;
  let name = (nameInput.value || "paleta").trim();
  if (!name.toLowerCase().endsWith("." + fmt)) name += "." + fmt;

  if (fmt === "png") exportPNG(name);
  else if (fmt === "json") exportJSON(name);
  else exportTXT(name);

  exportOverlay.hidden = true;
  showToast("Paleta exportada: " + name);
});

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON(filename) {
  const data = {
    generado_por: "Extractor de Paletas — BenaviDev",
    total_colores: state.colors.length,
    colores: state.colors.map((c) => ({
      hex: c.hex, rgb: c.rgb, percentage: c.percentage,
    })),
  };
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

function exportTXT(filename) {
  const lines = ["Paleta de colores — generada por BenaviDev", "=".repeat(44), ""];
  state.colors.forEach((c, i) => {
    lines.push(
      String(i + 1).padStart(2) + ".  " + c.hex + "   " +
      ("rgb(" + c.rgb.join(", ") + ")").padEnd(20) + "  (" + c.percentage + "%)"
    );
  });
  lines.push("");
  download(new Blob([lines.join("\n")], { type: "text/plain" }), filename);
}

/* PNG con las muestras en cuadrícula (equivale a export_png de Python). */
function exportPNG(filename) {
  const colors = state.colors;
  const n = colors.length;
  const width = 1000;

  let cols;
  if (n <= 8) cols = n;
  else if (n <= 16) cols = 4;
  else if (n <= 32) cols = 6;
  else cols = 8;
  const rows = Math.ceil(n / cols);

  const cellW = Math.floor(width / cols);
  const swatchH = Math.max(90, Math.floor(cellW * 0.7));
  const labelH = 78;
  const cellH = swatchH + labelH;
  const totalW = cellW * cols;
  const totalH = cellH * rows;

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e1311";
  ctx.fillRect(0, 0, totalW, totalH);

  const hexSize = Math.max(15, Math.min(26, Math.floor(cellW / 6)));
  const rgbSize = Math.max(11, Math.min(18, Math.floor(cellW / 9)));

  colors.forEach((c, i) => {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x0 = col * cellW;
    const y0 = r * cellH;

    ctx.fillStyle = c.hex;
    ctx.fillRect(x0 + 6, y0 + 6, cellW - 12, swatchH - 6);

    const cx = x0 + cellW / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8efe9";
    ctx.font = "700 " + hexSize + 'px "Ubuntu", sans-serif';
    ctx.fillText(c.hex, cx, y0 + swatchH + 12 + hexSize);
    ctx.fillStyle = "#8a978d";
    ctx.font = "500 " + rgbSize + 'px "Ubuntu", sans-serif';
    ctx.fillText("rgb(" + c.rgb.join(", ") + ")", cx, y0 + swatchH + 44 + rgbSize);
  });

  canvas.toBlob((blob) => download(blob, filename), "image/png");
}

/* -------------------------------------------------- Utilidades UI */
function setStatus(text, percent) {
  statusLabel.textContent = text;
  percentLabel.textContent = percent || "";
}

let toastTimer = null;
function showToast(text, isError) {
  toast.textContent = text;
  toast.className = "toast" + (isError ? " error" : "");
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}
