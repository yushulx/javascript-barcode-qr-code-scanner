import fs from "fs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
// import replace from "@rollup/plugin-replace";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { dts } from "rollup-plugin-dts";

const pkg = JSON.parse(await fs.promises.readFile("./package.json"));
const version = pkg.version;

fs.rmSync("dist", { recursive: true, force: true });

const strProduct = "Dynamsoft Driver License Scanner JS Edition Bundle";

const terser_format = {
  // this func is run by eval in worker, so can't use variable outside
  comments: function (node, comment) {
    const text = comment.value;
    const type = comment.type;
    if (type == "comment2") {
      // multiline comment
      const strProduct = "Dynamsoft Driver License Scanner JS Edition Bundle";
      const regDyComment = new RegExp(String.raw`@product\s${strProduct}`, "i");
      return regDyComment.test(text);
    }
  },
};

const banner = `/*!
* Dynamsoft Driver License Scanner JavaScript Library
* @product ${strProduct}
* @website http://www.dynamsoft.com
* @copyright Copyright ${new Date().getUTCFullYear()}, Dynamsoft Corporation
* @author Dynamsoft
* @version ${version}
* @fileoverview Dynamsoft Driver License Scanner is a ready-to-use SDK for capturing and enhancing document images with automatic border detection, correction, and customizable workflows. Uses Dynamsoft Capture Vision Bundle v2.6.1000.
* More info on Dynamsoft Driver License Scanner JS: https://www.dynamsoft.com/capture-vision/docs/web/programming/javascript/
*/`;

const plugin_terser_es6 = terser({ ecma: 6, format: terser_format });
const plugin_terser_es5 = terser({ ecma: 5, format: terser_format });

const DCV_CONFIG_PATH = `src/dcv-config`;
const BUNDLE_BUILD_PATH = `src/build`;
const TYPES_PATH = "dist/types/build";

const copyFiles = () => ({
  name: "copy-files",
  writeBundle() {
    fs.copyFileSync(`${DCV_CONFIG_PATH}/ddls.ui.html`, "dist/ddls.ui.html");
    fs.copyFileSync(`${DCV_CONFIG_PATH}/ddls.template.json`, "dist/ddls.template.json");
  },
});

const external = ["dynamsoft-capture-vision-bundle"];
const globals = {
  "dynamsoft-capture-vision-bundle": "Dynamsoft",
};

export default [
  // 1. Full bundle
  {
    input: `${BUNDLE_BUILD_PATH}/ddls.bundle.ts`,
    plugins: [
      nodeResolve({ browser: true }),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        sourceMap: false,
      }),
      plugin_terser_es5,
      copyFiles(),
      {
        writeBundle(options, bundle) {
          let txt = fs
            .readFileSync("dist/ddls.bundle.js", { encoding: "utf8" })
            .replace(/Dynamsoft=\{\}/, "Dynamsoft=t.Dynamsoft||{}");
          fs.writeFileSync("dist/ddls.bundle.js", txt);
        },
      },
    ],
    output: [
      {
        file: "dist/ddls.bundle.js",
        format: "umd",
        name: "Dynamsoft",
        banner: banner,
        exports: "named",
        sourcemap: false,
      },
    ],
  },
  // 2. Standard UMD bundle
  {
    input: `${BUNDLE_BUILD_PATH}/ddls.ts`,
    external,
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        sourceMap: false,
      }),
      plugin_terser_es5,
    ],
    output: [
      {
        file: "dist/ddls.js",
        format: "umd",
        name: "Dynamsoft",
        globals,
        banner: banner,
        exports: "named",
        sourcemap: false,
        extend: true,
      },
    ],
  },
  // 3. ESM bundle
  {
    input: `${BUNDLE_BUILD_PATH}/ddls.bundle.esm.ts`,
    plugins: [
      nodeResolve({ browser: true }),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: true,
        sourceMap: false,
      }),
      plugin_terser_es6,
    ],
    output: [
      {
        file: "dist/ddls.bundle.mjs",
        format: "es",
        banner: banner,
        exports: "named",
        sourcemap: false,
      },
    ],
  },
  // 4. ESM with externals
  {
    input: `${BUNDLE_BUILD_PATH}/ddls.ts`,
    external,
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: false,
      }),
      plugin_terser_es6,
    ],
    output: [
      {
        file: "dist/ddls.mjs",
        format: "es",
        banner: banner,
        exports: "named",
        sourcemap: false,
      },
    ],
  },
  // 5. No-content ESM
  {
    input: `${BUNDLE_BUILD_PATH}/ddls.no-content-bundle.esm.ts`,
    external,
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: false,
      }),
      plugin_terser_es6,
    ],
    output: [
      {
        file: "dist/ddls.no-content-bundle.esm.js",
        format: "es",
        banner: banner,
        exports: "named",
        sourcemap: false,
      },
    ],
  },
  // 6. Type declarations for CommonJS/UMD
  {
    input: `${BUNDLE_BUILD_PATH}/ddls.ts`,
    external,
    plugins: [
      dts(),
      {
        writeBundle(options, bundle) {
          let txt = fs.readFileSync("dist/ddls.d.ts", { encoding: "utf8" }).replace(/([{,]) type /g, "$1 ");
          fs.writeFileSync("dist/ddls.d.ts", txt);
        },
      },
    ],
    output: [
      {
        file: "dist/ddls.d.ts",
        format: "es",
      },
    ],
  },
  // 7. Type declarations for ESM
  {
    input: `${TYPES_PATH}/ddls.bundle.esm.d.ts`,
    plugins: [
      dts(),
      {
        // https://rollupjs.org/guide/en/#writebundle
        writeBundle(options, bundle) {
          fs.rmSync("dist/types", { recursive: true, force: true });
          // change `export { type A }` to `export { A }`,
          // so project use old typescript still works.
          let txt = fs.readFileSync("dist/ddls.bundle.esm.d.ts", { encoding: "utf8" }).replace(/([{,]) type /g, "$1 ");
          fs.writeFileSync("dist/ddls.bundle.esm.d.ts", txt);
        },
      },
    ],
    output: [
      {
        file: "dist/ddls.bundle.esm.d.ts",
        format: "es",
      },
    ],
  },
];
