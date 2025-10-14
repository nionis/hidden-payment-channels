// copied from railgun-community/wallet
import { ArtifactStore } from "@railgun-community/wallet";
import fs from "fs";

/**
 * Creates a path for a download directory by joining a documents directory path
 * with a specified path.
 *
 * @param documentsDir - The base directory path for documents.
 * @param path - The specific path to append to the documents directory.
 * @returns A string representing the combined path.
 *
 * @example
 * ```typescript
 * const downloadDirPath = createDownloadDirPath('/path/to/documents', 'downloads');
 * console.log(downloadDirPath); // Output: '/path/to/documents/downloads'
 * ```
 */
const createDownloadDirPath = (documentsDir: string, path: string) => {
  return `${documentsDir}/${path}`;
};

/**
 * Creates an artifact store for managing file operations in a specified directory.
 *
 * @param documentsDir - The base directory path where artifacts will be stored
 * @returns An ArtifactStore instance with methods for file operations:
 *   - getFile: Reads a file from the artifact store
 *   - storeFile: Writes data to a file in the artifact store, creating directories as needed
 *   - fileExists: Checks if a file exists in the artifact store
 *
 * @example
 * ```typescript
 * const artifactStore = createArtifactStore('/path/to/documents');
 * const fileData = await artifactStore.getFile('path/to/file');
 * await artifactStore.storeFile('dir/name', 'dir/name/file.txt', 'file content');
 * const exists = await artifactStore.fileExists('path/to/file');
 * ```
 */
export const createArtifactStore = (documentsDir: string): ArtifactStore => {
  const getFile = async (path: string) => {
    return fs.promises.readFile(createDownloadDirPath(documentsDir, path));
  };

  const storeFile = async (
    dir: string,
    path: string,
    item: string | Uint8Array<ArrayBufferLike>
  ) => {
    await fs.promises.mkdir(createDownloadDirPath(documentsDir, dir), {
      recursive: true,
    });
    await fs.promises.writeFile(
      createDownloadDirPath(documentsDir, path),
      item
    );
  };

  const fileExists = (path: string): Promise<boolean> => {
    return new Promise((resolve) => {
      fs.promises
        .access(createDownloadDirPath(documentsDir, path))
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
  };

  return new ArtifactStore(getFile, storeFile, fileExists);
};
