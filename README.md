# Extractor de Paletas — versión web (BenaviDev)

Versión web del Extractor de Paletas. Funciona **100% en el navegador**: las
imágenes nunca se suben a ningún servidor y no hace falta backend. Usa el mismo
algoritmo k-means (+ k-means++) que la app de escritorio, reimplementado en
JavaScript y ejecutado en un **Web Worker** para que la interfaz nunca se
congele.

## Archivos

| Archivo             | Función                                             |
|---------------------|-----------------------------------------------------|
| `index.html`        | Estructura de la página                              |
| `styles.css`        | Sistema de diseño de marca BenaviDev (tema oscuro)  |
| `app.js`            | Lógica de UI: carga, vista previa, copiar, exportar |
| `palette-core.js`   | Motor k-means (compartido con el worker)            |
| `kmeans-worker.js`  | Web Worker que ejecuta la extracción                |
| `logo.svg`          | Logo de marca                                       |

## Cómo probarlo en local

Los Web Workers requieren servir por HTTP (no abrir el archivo con `file://`):

```bash
cd web
python3 -m http.server 8000
```

Luego abre <http://localhost:8000> en el navegador.

## Cómo publicarlo (gratis)

Al ser solo archivos estáticos, puedes subir la carpeta `web/` a:

- **GitHub Pages**: sube el repo y activa Pages sobre la carpeta.
- **Netlify / Vercel / Cloudflare Pages**: arrastra la carpeta o conecta el repo.
- Cualquier hosting estático o tu propio servidor (Nginx/Apache).

## Funciones

- Cargar por arrastrar y soltar o por clic.
- Vista previa de la imagen.
- Selector de 4 a 64 colores.
- Muestras clicables (copian el HEX) con feedback visual.
- Copiar toda la paleta.
- Exportar a PNG (cuadrícula de muestras), JSON o TXT.
- Responsivo (funciona en móvil).
