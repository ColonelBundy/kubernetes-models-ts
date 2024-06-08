import glob from "fast-glob";
import { writeJSON, pathExists, readJSON } from "fs-extra";
import { basename, extname, join, posix } from "path";
import { copyFile } from "fs/promises";
import execa from "execa";

const DTS_EXT = ".d.ts";
const CJS_EXT = ".js";
const ESM_EXT = ".mjs";

function sortObjectByKey<T extends Record<string, unknown>>(input: T): T {
  const entries = Object.entries(input).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return Object.fromEntries(entries) as T;
}

function generateExportEntry(name: string): Record<string, string> {
  return {
    types: name + DTS_EXT,
    import: name + ESM_EXT,
    require: name + CJS_EXT
  };
}

async function generateExportMap(
  args: BuildArguments
): Promise<Record<string, unknown>> {
  const paths = await glob(["**/*.{js,ts}"], {
    cwd: join(args.cwd, "gen"),
    ...(!args["include-hidden"] && { ignore: ["!_**/*"] })
  });

  const exportMap: Record<string, unknown> = {
    "./package.json": "./package.json"
  };

  for (const path of paths) {
    const base = basename(path, extname(path));
    const dir = posix.dirname(path);
    const exportPath = dir === "." ? dir : `./${dir}`;

    if (base === "index") {
      exportMap[exportPath] = generateExportEntry(`${exportPath}/index`);
    } else {
      exportMap[`${exportPath}/*`] = generateExportEntry(`${exportPath}/*`);
    }
  }

  return sortObjectByKey(exportMap);
}

async function compileTS(cwd: string): Promise<void> {
  const tscMultiBin = join(__dirname, "../node_modules/.bin/tsc-multi");
  const tscMultiConfig = join(__dirname, "../../../tsc-multi.json");

  console.log("Running tsc-multi");
  await execa(
    tscMultiBin,
    ["--config", tscMultiConfig, "--compiler", require.resolve("typescript")],
    { cwd, stdio: "inherit" }
  );
}

async function copyDistFiles(cwd: string): Promise<void> {
  for (const file of ["README.md"]) {
    const src = join(cwd, file);
    const dst = join(cwd, "dist", file);

    if (!(await pathExists(src))) continue;

    await copyFile(src, dst);
    console.log("Copied to dist folder:", file);
  }
}

async function writePkgJson(args: BuildArguments): Promise<void> {
  const pkgJson = await readJSON(join(args.cwd, "package.json"));

  pkgJson.exports = await generateExportMap(args);

  await writeJSON(join(args.cwd, "dist/package.json"), pkgJson, { spaces: 2 });
}

export interface BuildArguments {
  cwd: string;
  "include-hidden"?: boolean;
}

export async function build(args: BuildArguments): Promise<void> {
  await compileTS(args.cwd);
  await copyDistFiles(args.cwd);
  await writePkgJson(args);
}
