/**
 * build-test.js — Bullet Chart Pro
 * Genera un .pbiviz de TEST para Power BI Desktop.
 *
 * USO: node build-test.js            → Pro forzado, guid <real>_test
 *      node build-test.js --free     → licencia real (Free), guid <real>_testfree
 *
 * Parchea → empaqueta → RESTAURA. El fuente siempre queda en estado producción.
 * Cada modo tiene su guid para poder importar los dos a la vez en Desktop.
 */

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT        = __dirname;
const VISUAL_TS   = path.join(ROOT, "src", "visual.ts");
const PBIVIZ_JSON = path.join(ROOT, "pbiviz.json");
const forceFree   = process.argv.includes("--free");

const originalTs     = fs.readFileSync(VISUAL_TS,   "utf8");
const originalPbiviz = fs.readFileSync(PBIVIZ_JSON, "utf8");
const pbivizObj      = JSON.parse(originalPbiviz);

console.log("\nBuild TEST — " + pbivizObj.visual.displayName + " v" + pbivizObj.visual.version);
console.log("Tier: " + (forceFree ? "Free (licencia real)" : "Pro (forzado)"));

// El ancla es el inicializador con ISPRO_MARKER. Si cambia, actualiza esta línea,
// no el fuente para encajar con el script.
const ISPRO_RE = /private isPro:\s*boolean = false; \/\/ ISPRO_MARKER/;

let patchedTs = originalTs;
if (!forceFree) {
    if (!ISPRO_RE.test(originalTs)) {
        console.error("\nERROR: no encuentro el inicializador de isPro con ISPRO_MARKER en src/visual.ts.\n");
        process.exit(1);
    }
    patchedTs = originalTs.replace(ISPRO_RE, "private isPro: boolean = true; // ISPRO_MARKER — TEST BUILD");
}

const realGuid      = pbivizObj.visual.guid;
const testGuid      = realGuid + (forceFree ? "_testfree" : "_test");
const patchedPbiviz = originalPbiviz.replace('"' + realGuid + '"', '"' + testGuid + '"');
console.log("GUID test: " + testGuid);

fs.writeFileSync(VISUAL_TS,   patchedTs,     "utf8");
fs.writeFileSync(PBIVIZ_JSON, patchedPbiviz, "utf8");

let ok = false;
try {
    execSync("npx pbiviz package", { cwd: ROOT, stdio: "inherit" });
    ok = true;
} catch (e) {
    console.error("\nEl build falló. Revisa los errores arriba.");
} finally {
    fs.writeFileSync(VISUAL_TS,   originalTs,     "utf8");
    fs.writeFileSync(PBIVIZ_JSON, originalPbiviz, "utf8");
    console.log("\nFicheros restaurados a estado producción.");
}
if (!ok) process.exit(1);
