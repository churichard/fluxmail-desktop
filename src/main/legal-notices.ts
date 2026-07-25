import path from "node:path";

interface OpenLegalNoticesOptions {
  isPackaged: boolean;
  resourcesPath: string;
  repositoryRoot: string;
  openPath(filePath: string): Promise<string>;
}

export async function openLegalNotices(options: OpenLegalNoticesOptions): Promise<void> {
  const noticesPath = path.join(
    options.isPackaged ? options.resourcesPath : options.repositoryRoot,
    "DISTRIBUTION_NOTICES.md",
  );
  const error = await options.openPath(noticesPath);
  if (error) throw new Error(`Fluxmail could not open the software licenses. ${error}`);
}
