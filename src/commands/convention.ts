import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import axios from "axios";
import matter from "gray-matter";
import { diffLines, createTwoFilesPatch } from "diff";
import { normalizeMarkdownToTiptap } from "@agentteams/markdown-tiptap";
import { loadConfig, findProjectConfig } from "../utils/config.js";
import { withSpinner } from "../utils/spinner.js";
import type { Config } from "../types/index.js";

const CONVENTION_DIR = ".agentteams";
const LEGACY_CONVENTION_DOWNLOAD_DIR = "conventions";
const CONVENTION_INDEX_FILE = "convention.md";
const CONVENTION_MANIFEST_FILE = "conventions.manifest.json";

type ConventionCommandOptions = {
  cwd?: string;
  config?: Config;
};

type ConventionDownloadManifestV1 = {
  version: 1;
  generatedAt: string;
  entries: Array<{
    conventionId: string;
    fileRelativePath: string;
    fileName: string;
    categoryDir: string;
    title?: string;
    category?: string;
    updatedAt?: string;
    downloadedAt: string;
    lastUploadedAt?: string;
    lastKnownUpdatedAt?: string;
  }>;
};

type ConventionUploadOptions = ConventionCommandOptions & {
  file: string | string[];
  apply?: boolean;
};

type ConventionDeleteOptions = ConventionCommandOptions & {
  file: string | string[];
  apply?: boolean;
};

type ConventionListItem = {
  id: string;
  title?: string;
  category?: string;
  fileName?: string | null;
  updatedAt?: string;
  createdAt?: string;
};

type PlatformGuide = {
  title?: string;
  fileName?: string;
  category?: string;
  content?: string;
};

function findProjectRoot(cwd?: string): string | null {
  const configPath = findProjectConfig(cwd ?? process.cwd());
  if (!configPath) return null;
  // configPath = /path/.agentteams/config.json → resolve up 2 levels to project root
  return resolve(configPath, "..", "..");
}

function getApiBaseUrl(apiUrl: string): string {
  return apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
}

function getApiConfigOrThrow(options?: ConventionCommandOptions) {
  const config = options?.config ?? loadConfig();
  if (!config) {
    throw new Error(
      "Configuration not found. Run 'agentteams init' first or set AGENTTEAMS_* environment variables."
    );
  }

  return {
    config,
    apiUrl: getApiBaseUrl(config.apiUrl),
    headers: {
      "X-API-Key": config.apiKey,
      "Content-Type": "application/json",
    },
  };
}

function normalizeRelativePath(input: string): string {
  return input.replaceAll("\\", "/");
}

function resolveConventionFileAbsolutePath(projectRoot: string, cwd: string, fileInput: string): string {
  // If absolute path, keep as-is.
  const resolvedFromCwd = resolve(cwd, fileInput);
  if (resolvedFromCwd === fileInput && existsSync(fileInput)) {
    return fileInput;
  }

  // Common usage: pass `.agentteams/...` from any working directory.
  if (fileInput.startsWith(`${CONVENTION_DIR}/`) || fileInput.startsWith(`${CONVENTION_DIR}\\`)) {
    return resolve(projectRoot, fileInput);
  }

  // Fallback: if the cwd-based resolution exists, use it.
  if (existsSync(resolvedFromCwd)) {
    return resolvedFromCwd;
  }

  // Otherwise, return cwd-based resolution to preserve a stable error path.
  return resolvedFromCwd;
}

function buildManifestPath(projectRoot: string): string {
  return join(projectRoot, CONVENTION_DIR, CONVENTION_MANIFEST_FILE);
}

function loadManifestOrThrow(projectRoot: string): ConventionDownloadManifestV1 {
  const manifestPath = buildManifestPath(projectRoot);
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Download manifest not found: ${manifestPath}\nRun 'agentteams convention download' first.`
    );
  }

  const raw = readFileSync(manifestPath, "utf-8");
  const parsed = JSON.parse(raw) as ConventionDownloadManifestV1;
  if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid manifest format: ${manifestPath}`);
  }
  return parsed;
}

function writeManifest(projectRoot: string, manifest: ConventionDownloadManifestV1) {
  const manifestPath = buildManifestPath(projectRoot);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

function toFileList(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

function hasAnyDiff(a: string, b: string): boolean {
  const parts = diffLines(a, b);
  return parts.some((p) => p.added || p.removed);
}

function createUnifiedDiff(fileLabel: string, serverText: string, localText: string): string {
  return createTwoFilesPatch(
    `${fileLabel} (server)`,
    `${fileLabel} (local)`,
    serverText,
    localText,
    "",
    "",
    { context: 3 }
  );
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function fetchAllConventions(
  apiUrl: string,
  projectId: string,
  headers: Record<string, string>
): Promise<ConventionListItem[]> {
  const pageSize = 100;
  let page = 1;
  let totalPages: number | undefined;
  const items: ConventionListItem[] = [];

  while (true) {
    const response = await axios.get(
      `${apiUrl}/api/projects/${projectId}/conventions`,
      { headers, params: { page, pageSize } }
    );

    const data = response.data?.data;
    if (!Array.isArray(data)) {
      break;
    }

    items.push(...data);

    const meta = response.data?.meta;
    if (typeof meta?.totalPages === "number") {
      totalPages = meta.totalPages;
    }

    if (totalPages !== undefined) {
      if (page >= totalPages) break;
      page += 1;
      continue;
    }

    // Fallback if meta is missing: stop when we got less than a full page.
    if (data.length < pageSize) break;
    page += 1;
  }

  return items;
}

function toOptionalStringOrNullIfPresent(
  data: Record<string, unknown>,
  key: string
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, key)) {
    return undefined;
  }
  const value = data[key];
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return undefined;
}

export async function conventionShow(): Promise<any> {
  const { config, apiUrl, headers } = getApiConfigOrThrow();

  const conventions = await fetchAllConventions(apiUrl, config.projectId, headers);
  if (!conventions || conventions.length === 0) {
    throw new Error(
      "No conventions found for this project. Create one via the web dashboard first."
    );
  }

  const sections: string[] = [];
  for (const convention of conventions) {
    const downloadResponse = await axios.get(
      `${apiUrl}/api/projects/${config.projectId}/conventions/${convention.id}/download`,
      { headers, responseType: "text" }
    );

    const sectionHeader = `# ${convention.title ?? "untitled"}\ncategory: ${convention.category ?? "uncategorized"}\nid: ${convention.id}`;
    sections.push(`${sectionHeader}\n\n${downloadResponse.data}`);
  }

  return sections.join("\n\n---\n\n");
}

export async function conventionList(): Promise<any> {
  const { config, apiUrl, headers } = getApiConfigOrThrow();

  const conventions = await fetchAllConventions(apiUrl, config.projectId, headers);
  if (!Array.isArray(conventions)) {
    return { data: conventions };
  }

  return {
    data: conventions.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      fileName: item.fileName,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
    })),
    meta: {
      total: conventions.length,
      page: 1,
      pageSize: conventions.length,
      totalPages: 1,
    }
  };
}

function toSafeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function toSafeDirectoryName(input: string): string {
  const normalized = toSafeFileName(input);
  return normalized.length > 0 ? normalized : "uncategorized";
}

function buildConventionFileName(convention: { id: string; title?: string; fileName?: string | null }): string {
  if (convention.fileName && convention.fileName.trim().length > 0) {
    return convention.fileName.trim();
  }
  const titleSegment = convention.title ? toSafeFileName(convention.title) : "";
  const prefix = titleSegment.length > 0 ? titleSegment : "convention";
  return `${prefix}.md`;
}

function normalizeMarkdownFileName(input: string): string {
  const trimmed = input.trim();
  const base = trimmed.toLowerCase().endsWith('.md')
    ? trimmed.slice(0, -3)
    : trimmed;

  const safeBase = toSafeFileName(base);
  const resolvedBase = safeBase.length > 0 ? safeBase : 'guide';
  return `${resolvedBase}.md`;
}

function buildPlatformGuideFileName(guide: PlatformGuide): string {
  if (typeof guide.fileName === 'string' && guide.fileName.trim().length > 0) {
    return normalizeMarkdownFileName(guide.fileName);
  }

  if (typeof guide.title === 'string' && guide.title.trim().length > 0) {
    return `${toSafeFileName(guide.title)}.md`;
  }

  return 'guide.md';
}

async function downloadPlatformGuides(
  projectRoot: string,
  apiUrl: string,
  headers: Record<string, string>
): Promise<number> {
  try {
    const response = await axios.get(
      `${apiUrl}/api/platform/guides`,
      { headers }
    );

    const guides = response.data?.data;
    if (!Array.isArray(guides) || guides.length === 0) {
      return 0;
    }

    const baseDir = join(projectRoot, CONVENTION_DIR, 'platform', 'guides');
    rmSync(baseDir, { recursive: true, force: true });
    mkdirSync(baseDir, { recursive: true });

    const fileNameCount = new Map<string, number>();
    let written = 0;

    for (const guide of guides as PlatformGuide[]) {
      if (!guide || typeof guide.content !== 'string') {
        continue;
      }

      const baseFileName = buildPlatformGuideFileName(guide);
      const seenCount = fileNameCount.get(baseFileName) ?? 0;
      fileNameCount.set(baseFileName, seenCount + 1);

      const fileName = seenCount === 0
        ? baseFileName
        : baseFileName.replace(/\.md$/, `-${seenCount + 1}.md`);

      const filePath = join(baseDir, fileName);
      writeFileSync(filePath, guide.content, 'utf-8');
      written += 1;
    }

    return written;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return 0;
    }

    throw error;
  }
}

async function downloadReportingTemplate(
  projectRoot: string,
  config: Config,
  apiUrl: string,
  headers: Record<string, string>
): Promise<boolean> {
  const agentConfigResponse = await axios.get(
    `${apiUrl}/api/projects/${config.projectId}/agent-configs`,
    { headers }
  );

  const agentConfigs = agentConfigResponse.data?.data;
  if (!Array.isArray(agentConfigs) || agentConfigs.length === 0) {
    return false;
  }

  const firstAgentConfig = agentConfigs[0];
  if (!firstAgentConfig?.id || typeof firstAgentConfig.id !== "string") {
    return false;
  }

  const templateResponse = await axios.get(
    `${apiUrl}/api/projects/${config.projectId}/agent-configs/${firstAgentConfig.id}/convention`,
    { headers }
  );

  const content = templateResponse.data?.data?.content;
  if (typeof content !== "string") {
    return false;
  }

  const conventionPath = join(projectRoot, CONVENTION_DIR, CONVENTION_INDEX_FILE);
  writeFileSync(conventionPath, content, "utf-8");
  return true;
}

export async function conventionDownload(options?: ConventionCommandOptions): Promise<string> {
  const { config, apiUrl, headers } = getApiConfigOrThrow(options);

  const projectRoot = findProjectRoot(options?.cwd);
  if (!projectRoot) {
    throw new Error(
      "No .agentteams directory found. Run 'agentteams init' first."
    );
  }

  const conventionRoot = join(projectRoot, CONVENTION_DIR);
  if (!existsSync(conventionRoot)) {
    throw new Error(
      `Convention directory not found: ${conventionRoot}\nRun 'agentteams init' first.`
    );
  }

  const hasReportingTemplate = await withSpinner(
    'Downloading reporting template...',
    () => downloadReportingTemplate(projectRoot, config, apiUrl, headers),
  );
  const platformGuideCount = await withSpinner(
    'Downloading platform guides...',
    () => downloadPlatformGuides(projectRoot, apiUrl, headers),
  );

  const conventions = await withSpinner(
    'Downloading conventions...',
    async () => {
      const conventionList = await fetchAllConventions(apiUrl, config.projectId, headers);
      if (!conventionList || conventionList.length === 0) {
        return conventionList as any[] | undefined;
      }

      const legacyDir = join(projectRoot, CONVENTION_DIR, LEGACY_CONVENTION_DOWNLOAD_DIR);
      rmSync(legacyDir, { recursive: true, force: true });

      const categoryDirs = new Set<string>();
      for (const convention of conventionList) {
        const categoryName = typeof convention.category === "string" ? convention.category : "";
        categoryDirs.add(toSafeDirectoryName(categoryName));
      }

      for (const categoryDir of categoryDirs) {
        rmSync(join(projectRoot, CONVENTION_DIR, categoryDir), { recursive: true, force: true });
        mkdirSync(join(projectRoot, CONVENTION_DIR, categoryDir), { recursive: true });
      }

      const fileNameCount = new Map<string, number>();
      const manifest: ConventionDownloadManifestV1 = {
        version: 1,
        generatedAt: new Date().toISOString(),
        entries: [],
      };

      for (const convention of conventionList) {
        const downloadResponse = await axios.get(
          `${apiUrl}/api/projects/${config.projectId}/conventions/${convention.id}/download`,
          { headers, responseType: "text" }
        );

        const baseFileName = buildConventionFileName(convention);
        const categoryName = typeof convention.category === "string" ? convention.category : "";
        const categoryDir = toSafeDirectoryName(categoryName);
        const duplicateKey = `${categoryDir}/${baseFileName}`;

        const seenCount = fileNameCount.get(duplicateKey) ?? 0;
        fileNameCount.set(duplicateKey, seenCount + 1);

        const fileName = seenCount === 0
          ? baseFileName
          : baseFileName.replace(/\.md$/, `-${seenCount + 1}.md`);
        const filePath = join(projectRoot, CONVENTION_DIR, categoryDir, fileName);
        writeFileSync(filePath, downloadResponse.data, "utf-8");

        manifest.entries.push({
          conventionId: String(convention.id),
          fileRelativePath: normalizeRelativePath(relative(projectRoot, filePath)),
          fileName,
          categoryDir,
          title: toOptionalString(convention.title),
          category: toOptionalString(convention.category),
          updatedAt: toOptionalString(convention.updatedAt),
          downloadedAt: new Date().toISOString(),
        });
      }

      writeManifest(projectRoot, manifest);
      return conventionList;
    },
  );

  if (!conventions || conventions.length === 0) {
    if (hasReportingTemplate) {
      const platformLine = platformGuideCount > 0
        ? `\nDownloaded ${platformGuideCount} platform guide file(s) into ${CONVENTION_DIR}/platform/guides`
        : '';
      return `Convention sync completed.\nUpdated ${CONVENTION_DIR}/${CONVENTION_INDEX_FILE}\nNo project conventions found.${platformLine}`;
    }

    throw new Error(
      "No conventions found for this project. Create one via the web dashboard first."
    );
  }

  const reportingLine = hasReportingTemplate
    ? `Updated ${CONVENTION_DIR}/${CONVENTION_INDEX_FILE}\n`
    : "";

  const platformLine = platformGuideCount > 0
    ? `Downloaded ${platformGuideCount} platform guide file(s) into ${CONVENTION_DIR}/platform/guides\n`
    : "";

  return `Convention sync completed.\n${reportingLine}${platformLine}Downloaded ${conventions.length} file(s) into category directories under ${CONVENTION_DIR}`;
}

export async function conventionUpdate(options: ConventionUploadOptions): Promise<string> {
  const { config, apiUrl, headers } = getApiConfigOrThrow(options);
  const projectRoot = findProjectRoot(options?.cwd);
  if (!projectRoot) {
    throw new Error("No .agentteams directory found. Run 'agentteams init' first.");
  }

  const manifest = loadManifestOrThrow(projectRoot);
  const files = toFileList(options.file);
  const apply = options.apply === true;

  const results: string[] = [];

  for (const fileInput of files) {
    const cwd = options.cwd ?? process.cwd();
    const absolutePath = resolveConventionFileAbsolutePath(projectRoot, cwd, fileInput);
    const fileRelativePath = normalizeRelativePath(relative(projectRoot, absolutePath));

    const manifestEntry = manifest.entries.find((e) => e.fileRelativePath === fileRelativePath);
    if (!manifestEntry) {
      const available = manifest.entries
        .map((e) => e.fileRelativePath)
        .sort()
        .slice(0, 30);
      throw new Error(
        `Only downloaded convention files can be updated: ${fileInput}\n` +
        `- resolved: ${absolutePath}\n` +
        `- relative: ${fileRelativePath}\n` +
        `Run 'agentteams convention download' first, or pass a file path listed in the manifest.\n` +
        (available.length > 0 ? `Examples (partial):\n- ${available.join("\n- ")}` : "")
      );
    }

    const conventionId = manifestEntry.conventionId;

    const [serverDetail, serverMarkdown, localMarkdown] = await withSpinner(
      `Preparing update for ${fileRelativePath}...`,
      async () => {
        const detailResponse = await axios.get(
          `${apiUrl}/api/projects/${config.projectId}/conventions/${conventionId}`,
          { headers }
        );
        const downloadResponse = await axios.get(
          `${apiUrl}/api/projects/${config.projectId}/conventions/${conventionId}/download`,
          { headers, responseType: "text" }
        );
        const local = readFileSync(absolutePath, "utf-8");
        return [detailResponse.data?.data, String(downloadResponse.data), local] as const;
      }
    );

    if (!hasAnyDiff(serverMarkdown, localMarkdown)) {
      results.push(`[SKIP] ${fileRelativePath}: No changes detected.`);
      continue;
    }

    const diffText = createUnifiedDiff(fileRelativePath, serverMarkdown, localMarkdown);
    results.push(diffText.trimEnd());

    if (!apply) {
      results.push(`[DRY-RUN] ${fileRelativePath}: Printed diff only (no server changes).`);
      continue;
    }

    const parsed = matter(localMarkdown);
    const frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
    const bodyMarkdown = String(parsed.content ?? "");

    const content = await normalizeMarkdownToTiptap(bodyMarkdown);

    if (typeof serverDetail?.updatedAt !== "string" || serverDetail.updatedAt.length === 0) {
      throw new Error(`[ERROR] ${fileRelativePath}: Server response is missing updatedAt.`);
    }

    const payload: Record<string, unknown> = {
      updatedAt: serverDetail.updatedAt,
      content,
    };

    const trigger = toOptionalStringOrNullIfPresent(frontmatter, "trigger");
    const description = toOptionalStringOrNullIfPresent(frontmatter, "description");
    const agentInstruction = toOptionalStringOrNullIfPresent(frontmatter, "agentInstruction");

    if (trigger !== undefined) payload.trigger = trigger;
    if (description !== undefined) payload.description = description;
    if (agentInstruction !== undefined) payload.agentInstruction = agentInstruction;

    const updatedResponse = await withSpinner(
      `Uploading ${fileRelativePath}...`,
      () => axios.put(
        `${apiUrl}/api/projects/${config.projectId}/conventions/${conventionId}`,
        payload,
        { headers }
      )
    );

    const newUpdatedAt = updatedResponse.data?.data?.updatedAt;
    const now = new Date().toISOString();
    manifestEntry.lastUploadedAt = now;
    if (typeof newUpdatedAt === "string") {
      manifestEntry.lastKnownUpdatedAt = newUpdatedAt;
    }
    writeManifest(projectRoot, manifest);

    results.push(`[OK] ${fileRelativePath}: Update applied. (conventionId=${conventionId})`);
  }

  return results.join("\n\n");
}

export async function conventionDelete(options: ConventionDeleteOptions): Promise<string> {
  const { config, apiUrl, headers } = getApiConfigOrThrow(options);
  const projectRoot = findProjectRoot(options?.cwd);
  if (!projectRoot) {
    throw new Error("No .agentteams directory found. Run 'agentteams init' first.");
  }

  const manifest = loadManifestOrThrow(projectRoot);
  const files = toFileList(options.file);
  const apply = options.apply === true;

  const results: string[] = [];

  for (const fileInput of files) {
    const cwd = options.cwd ?? process.cwd();
    const absolutePath = resolveConventionFileAbsolutePath(projectRoot, cwd, fileInput);
    const fileRelativePath = normalizeRelativePath(relative(projectRoot, absolutePath));

    const entryIndex = manifest.entries.findIndex((e) => e.fileRelativePath === fileRelativePath);
    if (entryIndex === -1) {
      const available = manifest.entries
        .map((e) => e.fileRelativePath)
        .sort()
        .slice(0, 30);
      throw new Error(
        `Only downloaded convention files can be deleted: ${fileInput}\n` +
        `- resolved: ${absolutePath}\n` +
        `- relative: ${fileRelativePath}\n` +
        `Run 'agentteams convention download' first, or pass a file path listed in the manifest.\n` +
        (available.length > 0 ? `Examples (partial):\n- ${available.join("\n- ")}` : "")
      );
    }

    const entry = manifest.entries[entryIndex]!;
    const conventionId = entry.conventionId;

    results.push(`[PLAN] ${fileRelativePath}: Will delete conventionId=${conventionId}`);

    if (!apply) {
      results.push(`[DRY-RUN] ${fileRelativePath}: Planned only (no server delete).`);
      continue;
    }

    await withSpinner(
      `Deleting convention for ${fileRelativePath}...`,
      () => axios.delete(
        `${apiUrl}/api/projects/${config.projectId}/conventions/${conventionId}`,
        { headers }
      )
    );

    // After a successful server delete, also clean up local files/manifest.
    try {
      unlinkSync(absolutePath);
    } catch {
      // ignore
    }
    manifest.entries.splice(entryIndex, 1);
    writeManifest(projectRoot, manifest);

    results.push(`[OK] ${fileRelativePath}: Deleted. (conventionId=${conventionId})`);
  }

  return results.join("\n");
}
