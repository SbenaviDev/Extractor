/* ==========================================================================
   Núcleo del extractor de paletas (k-means + k-means++), en JavaScript puro.
   Equivale al motor palette.py de la app de escritorio.

   Se comparte entre:
     - kmeans-worker.js  (lo carga con importScripts para correr en un hilo)
     - la página de autotest (lo carga con <script> para verificarlo)

   Expone la función global: extractPalette(rgba, k)
     - rgba: Uint8ClampedArray con los píxeles en formato RGBA
     - k:    número de colores dominantes a detectar
   Devuelve un array de { rgb:[r,g,b], hex, percentage, weight } ordenado por peso.
   ========================================================================== */
(function (root) {
  "use strict";

  function extractPalette(rgba, k) {
    // 1. Píxeles RGB, fusionando el alfa sobre blanco para no contaminar.
    const n = rgba.length / 4;
    const pts = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rgba[i * 4 + 3] / 255;
      pts[i * 3]     = rgba[i * 4]     * a + 255 * (1 - a);
      pts[i * 3 + 1] = rgba[i * 4 + 1] * a + 255 * (1 - a);
      pts[i * 3 + 2] = rgba[i * 4 + 2] * a + 255 * (1 - a);
    }

    const { centroids, counts } = kmeans(pts, n, k);

    const total = counts.reduce((s, c) => s + c, 0);
    const colors = [];
    for (let c = 0; c < centroids.length / 3; c++) {
      if (counts[c] === 0) continue;
      const r = Math.round(centroids[c * 3]);
      const g = Math.round(centroids[c * 3 + 1]);
      const b = Math.round(centroids[c * 3 + 2]);
      const weight = counts[c] / total;
      colors.push({
        rgb: [r, g, b],
        hex: rgbToHex(r, g, b),
        percentage: Math.round(weight * 1000) / 10,
        weight: weight,
      });
    }
    colors.sort((a, b) => b.weight - a.weight);
    return colors;
  }

  function kmeans(pts, n, k, iterations = 40, seed = 42) {
    const rng = mulberry32(seed);

    const ptsSq = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      ptsSq[i] = x * x + y * y + z * z;
    }

    const uniques = uniqueColors(pts, n);
    if (uniques.length / 3 <= k) {
      const centroids = uniques;
      const cCount = centroids.length / 3;
      const counts = new Float64Array(cCount);
      for (let i = 0; i < n; i++) counts[nearest(pts, i, centroids, cCount)]++;
      return { centroids, counts };
    }

    let centroids = kmeansppInit(pts, n, k, rng);
    let labels = new Int32Array(n);
    let counts = new Float64Array(k);

    for (let iter = 0; iter < iterations; iter++) {
      let changed = false;
      counts = new Float64Array(k);
      const sums = new Float64Array(k * 3);

      for (let i = 0; i < n; i++) {
        const lbl = nearest(pts, i, centroids, k);
        if (lbl !== labels[i]) { labels[i] = lbl; changed = true; }
        counts[lbl]++;
        sums[lbl * 3]     += pts[i * 3];
        sums[lbl * 3 + 1] += pts[i * 3 + 1];
        sums[lbl * 3 + 2] += pts[i * 3 + 2];
      }

      if (!changed && iter > 0) break;

      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          centroids[c * 3]     = sums[c * 3]     / counts[c];
          centroids[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
          centroids[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
        } else {
          const idx = Math.floor(rng() * n);
          centroids[c * 3]     = pts[idx * 3];
          centroids[c * 3 + 1] = pts[idx * 3 + 1];
          centroids[c * 3 + 2] = pts[idx * 3 + 2];
        }
      }
    }
    return { centroids, counts };
  }

  function nearest(pts, i, centroids, k) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
    let best = 0, bestDist = Infinity;
    for (let c = 0; c < k; c++) {
      const dx = x - centroids[c * 3];
      const dy = y - centroids[c * 3 + 1];
      const dz = z - centroids[c * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function kmeansppInit(pts, n, k, rng) {
    const centroids = new Float64Array(k * 3);
    let idx = Math.floor(rng() * n);
    centroids[0] = pts[idx * 3];
    centroids[1] = pts[idx * 3 + 1];
    centroids[2] = pts[idx * 3 + 2];

    const closest = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - centroids[0];
      const dy = pts[i * 3 + 1] - centroids[1];
      const dz = pts[i * 3 + 2] - centroids[2];
      closest[i] = dx * dx + dy * dy + dz * dz;
    }

    for (let c = 1; c < k; c++) {
      let total = 0;
      for (let i = 0; i < n; i++) total += closest[i];

      if (total === 0) {
        idx = Math.floor(rng() * n);
      } else {
        let target = rng() * total, acc = 0;
        idx = n - 1;
        for (let i = 0; i < n; i++) {
          acc += closest[i];
          if (acc >= target) { idx = i; break; }
        }
      }
      centroids[c * 3]     = pts[idx * 3];
      centroids[c * 3 + 1] = pts[idx * 3 + 1];
      centroids[c * 3 + 2] = pts[idx * 3 + 2];

      for (let i = 0; i < n; i++) {
        const dx = pts[i * 3] - centroids[c * 3];
        const dy = pts[i * 3 + 1] - centroids[c * 3 + 1];
        const dz = pts[i * 3 + 2] - centroids[c * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < closest[i]) closest[i] = d;
      }
    }
    return centroids;
  }

  function uniqueColors(pts, n) {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = pts[i * 3], g = pts[i * 3 + 1], b = pts[i * 3 + 2];
      const key = (r << 16) | (g << 8) | b;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r, g, b);
        if (out.length / 3 > 4096) break;
      }
    }
    return new Float64Array(out);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rgbToHex(r, g, b) {
    const h = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0").toUpperCase();
    return "#" + h(r) + h(g) + h(b);
  }

  // Exportamos al ámbito global (funciona en Worker y en la página).
  root.extractPalette = extractPalette;
  root.rgbToHex = rgbToHex;
})(typeof self !== "undefined" ? self : this);
