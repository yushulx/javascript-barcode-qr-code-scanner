import fs from "fs";
import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";

// Development configuration with source maps enabled
const DCV_CONFIG_PATH = `src/dcv-config`;
const BUNDLE_BUILD_PATH = `src/build`;

const copyFiles = () => ({
    name: "copy-files",
    writeBundle() {
        fs.copyFileSync(`${DCV_CONFIG_PATH}/ddls.ui.html`, "dist/ddls.ui.html");
        fs.copyFileSync(`${DCV_CONFIG_PATH}/ddls.template.json`, "dist/ddls.template.json");
    },
});

export default [
    // Development bundle with source maps
    {
        input: `${BUNDLE_BUILD_PATH}/ddls.bundle.ts`,
        plugins: [
            nodeResolve({ browser: true }),
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: true,
                sourceMap: true,
            }),
            copyFiles(),
        ],
        output: [
            {
                file: "dist/ddls.bundle.js",
                format: "umd",
                name: "Dynamsoft",
                exports: "named",
                sourcemap: true,
            },
        ],
    },
];
