import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { appearancePreferenceSchema, type AppearancePreference } from "../shared/contracts";

const preferencesFileSchema = z.discriminatedUnion("version", [
  z.object({ version: z.literal(1), appearance: appearancePreferenceSchema }).strict(),
  z
    .object({
      version: z.literal(2),
      appearance: appearancePreferenceSchema,
      dockBadge: z.boolean(),
    })
    .strict(),
  z
    .object({
      version: z.literal(3),
      appearance: appearancePreferenceSchema,
      dockBadge: z.boolean(),
      blockRemoteImages: z.boolean(),
    })
    .strict(),
  z
    .object({
      version: z.literal(4),
      appearance: appearancePreferenceSchema,
      dockBadge: z.boolean(),
      blockRemoteImages: z.boolean(),
      imageRelay: z.boolean(),
    })
    .strict(),
]);

export class DesktopPreferences {
  private appearanceValue: AppearancePreference = "system";
  private dockBadgeValue = true;
  private blockRemoteImagesValue = true;
  private imageRelayValue = true;
  private readonly filePath: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(userDataDirectory: string) {
    this.filePath = path.join(userDataDirectory, "desktop-preferences.json");
  }

  async load(): Promise<AppearancePreference> {
    try {
      const stored = preferencesFileSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
      this.appearanceValue = stored.appearance;
      this.dockBadgeValue = stored.version === 1 ? true : stored.dockBadge;
      this.blockRemoteImagesValue =
        stored.version === 3 || stored.version === 4 ? stored.blockRemoteImages : true;
      this.imageRelayValue = stored.version === 4 ? stored.imageRelay : true;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(error instanceof z.ZodError) &&
        !(error instanceof SyntaxError)
      ) {
        throw error;
      }
      this.appearanceValue = "system";
      this.dockBadgeValue = true;
      this.blockRemoteImagesValue = true;
      this.imageRelayValue = true;
    }
    return this.appearanceValue;
  }

  appearance(): AppearancePreference {
    return this.appearanceValue;
  }

  dockBadge(): boolean {
    return this.dockBadgeValue;
  }

  blockRemoteImages(): boolean {
    return this.blockRemoteImagesValue;
  }

  imageRelay(): boolean {
    return this.imageRelayValue;
  }

  async setAppearance(appearance: AppearancePreference): Promise<AppearancePreference> {
    const value = appearancePreferenceSchema.parse(appearance);
    return this.enqueueMutation(async () => {
      await this.save(
        value,
        this.dockBadgeValue,
        this.blockRemoteImagesValue,
        this.imageRelayValue,
      );
      this.appearanceValue = value;
      return value;
    });
  }

  async setDockBadge(enabled: boolean): Promise<boolean> {
    const value = z.boolean().parse(enabled);
    return this.enqueueMutation(async () => {
      await this.save(
        this.appearanceValue,
        value,
        this.blockRemoteImagesValue,
        this.imageRelayValue,
      );
      this.dockBadgeValue = value;
      return value;
    });
  }

  async setBlockRemoteImages(enabled: boolean): Promise<boolean> {
    const value = z.boolean().parse(enabled);
    return this.enqueueMutation(async () => {
      await this.save(this.appearanceValue, this.dockBadgeValue, value, this.imageRelayValue);
      this.blockRemoteImagesValue = value;
      return value;
    });
  }

  async setImageRelay(enabled: boolean): Promise<boolean> {
    const value = z.boolean().parse(enabled);
    return this.enqueueMutation(async () => {
      await this.save(
        this.appearanceValue,
        this.dockBadgeValue,
        this.blockRemoteImagesValue,
        value,
      );
      this.imageRelayValue = value;
      return value;
    });
  }

  private enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(mutation, mutation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async save(
    appearance: AppearancePreference,
    dockBadge: boolean,
    blockRemoteImages: boolean,
    imageRelay: boolean,
  ): Promise<void> {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      temporaryPath,
      `${JSON.stringify({
        version: 4,
        appearance,
        dockBadge,
        blockRemoteImages,
        imageRelay,
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, this.filePath);
    await chmod(this.filePath, 0o600);
  }
}
