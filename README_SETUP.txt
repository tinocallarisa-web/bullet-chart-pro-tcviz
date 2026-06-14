══════════════════════════════════════════════════════════════
  BULLET CHART PRO — PASOS PARA COMPILAR Y PUBLICAR
══════════════════════════════════════════════════════════════

1. INSTALAR DEPENDENCIAS (solo la primera vez)
   ─────────────────────────────────────────────
   > npm install

2. DESARROLLO LOCAL (live reload en Power BI Desktop)
   ─────────────────────────────────────────────
   > npm run start
   Activar en Power BI Desktop:  Archivo → Opciones → Desarrollador → Habilitar visual de desarrollador

3. EMPAQUETAR EL VISUAL
   ─────────────────────────────────────────────
   > npm run package
   Genera:  dist/bulletChartProTCViz.pbiviz

4. ANTES DE EMPAQUETAR — verificar siempre:
   [ ] pbiviz.json   → "version": "X.X.X.X" actualizada
   [ ] package.json  → "version": "X.X.X"   actualizada (debe coincidir)

5. GITHUB — rama de certificación
   ─────────────────────────────────────────────
   git checkout -b certification
   git push origin certification

6. GITHUB PAGES — activar para la carpeta /docs
   ─────────────────────────────────────────────
   En GitHub → Settings → Pages → Source: /docs (branch: main)
   URLs resultantes:
   · https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/privacy.html
   · https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/terms.html
   · https://tinocallarisa-web.github.io/bullet-chart-pro-tcviz/support.html

7. PARTNER CENTER — campos críticos
   ─────────────────────────────────────────────
   Plan ID:     bullet-chart-pro-tcviz
   Visual GUID: bulletChartProTCViz20260001  (en pbiviz.json)
   Notas cert.: copiar de CERTIFICATION_NOTES.txt (se borran en cada reenvío)

8. ICON requerido
   ─────────────────────────────────────────────
   Crear  assets/icon.png  de 20×20 px
   (Sin icono → pbiviz package fallará)

══════════════════════════════════════════════════════════════
  ESTRUCTURA DEL PROYECTO
══════════════════════════════════════════════════════════════

  bullet-chart-pro-tcviz/
  ├── assets/
  │   └── icon.png              ← CREAR: 20×20 px
  ├── docs/
  │   ├── privacy.html          ← GitHub Pages
  │   ├── terms.html
  │   └── support.html
  ├── src/
  │   ├── settings.ts           ← Tipos e interfaz BulletSettings
  │   └── visual.ts             ← Lógica principal del visual
  ├── style/
  │   └── visual.less           ← Estilos CSS del contenedor
  ├── capabilities.json         ← Data roles + format objects
  ├── pbiviz.json               ← Metadata del visual
  ├── package.json              ← Dependencias npm
  ├── tsconfig.json             ← Config TypeScript
  ├── CERTIFICATION_NOTES.txt   ← Copiar en Partner Center
  └── README_SETUP.txt          ← Este archivo
