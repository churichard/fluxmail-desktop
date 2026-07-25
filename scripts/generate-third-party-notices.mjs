import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(repositoryRoot, "THIRD_PARTY_NOTICES.md");
const electronLicenseSource = path.join(repositoryRoot, "node_modules/electron/LICENSE");
const electronLicenseOutput = path.join(repositoryRoot, "ELECTRON_LICENSE");
const checkOnly = process.argv.includes("--check");
const excludedPackages = new Set(["fluxmail"]);
// Native Argon2 packages share @node-rs/argon2's project and license.
// Keeping their notice under the parent avoids architecture-specific output.
const packagesCoveredByParentNotice = new Set([
  "@node-rs/argon2-darwin-arm64",
  "@node-rs/argon2-darwin-x64",
]);

function productionPackageKeys() {
  const result = spawnSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not read the production dependency licenses.");
  }

  const report = JSON.parse(result.stdout);
  return new Set(
    Object.values(report)
      .flat()
      .flatMap((entry) => entry.versions.map((version) => `${entry.name}@${version}`)),
  );
}

function installedPackages() {
  const packages = new Map();

  function addPackage(packagePath) {
    const manifestPath = path.join(packagePath, "package.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name && manifest.version) {
      packages.set(`${manifest.name}@${manifest.version}`, { manifest, packagePath });
    }
    addModules(path.join(packagePath, "node_modules"));
  }

  function addModules(modulesPath) {
    if (!existsSync(modulesPath)) return;
    for (const entry of readdirSync(modulesPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const entryPath = path.join(modulesPath, entry.name);
      if (entry.name.startsWith("@")) {
        for (const scopedEntry of readdirSync(entryPath, { withFileTypes: true })) {
          if (scopedEntry.isDirectory()) addPackage(path.join(entryPath, scopedEntry.name));
        }
      } else {
        addPackage(entryPath);
      }
    }
  }

  addModules(path.join(repositoryRoot, "node_modules"));
  return packages;
}

function packageLicenseFile(packagePath) {
  const fileName = readdirSync(packagePath)
    .filter((name) => /^(?:licen[cs]e|copying)(?:$|[._-])/i.test(name))
    .sort((left, right) => left.localeCompare(right))[0];
  if (!fileName) return undefined;
  return path.join(packagePath, fileName);
}

function packageNameFromKey(key) {
  return key.slice(0, key.lastIndexOf("@"));
}

function packageLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const licenses = value.map(packageLicense).filter((license) => license !== "Not specified");
    if (licenses.length) return licenses.join(" OR ");
  }
  if (value && typeof value === "object" && "type" in value) {
    return packageLicense(value.type);
  }
  return "Not specified";
}

function packageHomepage(manifest) {
  if (typeof manifest.homepage === "string") return manifest.homepage;
  if (typeof manifest.repository === "string") return manifest.repository;
  if (typeof manifest.repository?.url === "string") return manifest.repository.url;
  return undefined;
}

function productionPackages() {
  const packages = new Map();
  const installed = installedPackages();
  for (const key of productionPackageKeys()) {
    const packageName = packageNameFromKey(key);
    if (
      excludedPackages.has(packageName) ||
      packageName.startsWith("@fluxmail/") ||
      packagesCoveredByParentNotice.has(packageName)
    ) {
      continue;
    }

    const packageInfo = installed.get(key);
    if (!packageInfo) throw new Error(`${key} is missing from node_modules.`);
    const { manifest, packagePath } = packageInfo;
    if (!manifest.name || !manifest.version) continue;

    const licensePath = packageLicenseFile(packagePath);
    if (packages.has(key)) continue;
    packages.set(key, {
      name: manifest.name,
      version: manifest.version,
      license: packageLicense(manifest.license),
      homepage: packageHomepage(manifest),
      text: licensePath ? readFileSync(licensePath, "utf8").trim() : undefined,
    });
  }
  return [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

function renderNotices(packages) {
  const header = `# Third-party software notices

Fluxmail Desktop includes the packages listed below. Each package is governed by the license printed with its entry.

The separately licensed Fluxmail engine is documented in \`DISTRIBUTION_NOTICES.md\`. Its license is included in the application resources as \`LICENSE.md\`.

This file is generated by \`pnpm notices:generate\`. Do not edit it by hand.
  `;
  const entries = packages.map((entry) => {
    const project = entry.homepage ? `\nProject: ${entry.homepage}` : "";
    const licenseText = entry.text ? `\n\n${entry.text}` : "";
    return `## ${entry.name} ${entry.version}

License: ${entry.license}${project}${licenseText}
`;
  });
  return `${header.trimEnd()}\n\n${entries.join("\n")}`;
}

const notices = renderNotices(productionPackages());
const electronLicense = readFileSync(electronLicenseSource, "utf8");
if (checkOnly) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== notices) {
    throw new Error("THIRD_PARTY_NOTICES.md is out of date. Run pnpm notices:generate.");
  }
  if (
    !existsSync(electronLicenseOutput) ||
    readFileSync(electronLicenseOutput, "utf8") !== electronLicense
  ) {
    throw new Error("ELECTRON_LICENSE is out of date. Run pnpm notices:generate.");
  }
} else {
  writeFileSync(outputPath, notices);
  writeFileSync(electronLicenseOutput, electronLicense);
}
