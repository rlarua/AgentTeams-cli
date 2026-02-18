import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import axios from "axios";
import { loadConfig, findProjectConfig } from "../utils/config.js";
import { withSpinner } from "../utils/spinner.js";
import type { Config } from "../types/index.js";

const CONVENTION_DIR = ".agentteams";
const LEGACY_CONVENTION_DOWNLOAD_DIR = "conventions";
const CONVENTION_INDEX_FILE = "convention.md";

type ConventionCommandOptions = {
  cwd?: string;
  config?: Config;
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

export async function conventionShow(): Promise<any> {
  const { config, apiUrl, headers } = getApiConfigOrThrow();

  const listResponse = await axios.get(
    `${apiUrl}/api/projects/${config.projectId}/conventions`,
    { headers }
  );

  const conventions = listResponse.data?.data;
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

  const response = await axios.get(
    `${apiUrl}/api/projects/${config.projectId}/conventions`,
    { headers }
  );

  const conventions = response.data?.data;
  if (!Array.isArray(conventions)) {
    return response.data;
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
    meta: response.data?.meta,
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
      const listResponse = await axios.get(
        `${apiUrl}/api/projects/${config.projectId}/conventions`,
        { headers }
      );

      const conventionList = listResponse.data?.data;
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
      }

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
