import { writeFileSync, renameSync } from "node:fs";

export function atomicWriteFileSync(
  filePath: string,
  data: string,
  encoding: BufferEncoding = "utf-8"
): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data, encoding);
  renameSync(tmpPath, filePath);
}
