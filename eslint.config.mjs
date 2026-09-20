import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        // build-test.js es un script local de empaquetado de pruebas, no forma parte del visual.
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**", "build-test.js"],
    },
];
