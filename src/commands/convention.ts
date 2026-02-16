import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import axios from "axios";
import { loadConfig, findProjectConfig } from "../utils/config.js";

const CONVENTION_DIR = ".agentteams";
const CONVENTION_FILE = "reporting.md";
const CLAUDE_MD = "CLAUDE.md";
const CLAUDE_MD_BACKUP = "CLAUDE.md.backup";

function findProjectRoot(): string | null {
  const configPath = findProjectConfig(process.cwd());
  if (!configPath) return null;
  // configPath = /path/.agentteams/config.json → resolve up 2 levels to project root
  return resolve(configPath, "..", "..");
}

function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

export async function conventionShow(): Promise<string> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw new Error(
      "No .agentteams directory found. Run 'agentteams init' first."
    );
  }

  const conventionPath = join(projectRoot, CONVENTION_DIR, CONVENTION_FILE);
  if (!existsSync(conventionPath)) {
    throw new Error(
      `Convention file not found: ${conventionPath}\nRun 'agentteams convention update' to download it.`
    );
  }

  return readFileSync(conventionPath, "utf-8");
}

export async function conventionAppend(): Promise<string> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw new Error(
      "No .agentteams directory found. Run 'agentteams init' first."
    );
  }

  const conventionPath = join(projectRoot, CONVENTION_DIR, CONVENTION_FILE);
  if (!existsSync(conventionPath)) {
    throw new Error(
      `Convention file not found: ${conventionPath}\nRun 'agentteams convention update' first.`
    );
  }

  const claudeMdPath = join(projectRoot, CLAUDE_MD);
  const backupPath = join(projectRoot, CLAUDE_MD_BACKUP);
  const conventionRef = `\n\n<!-- AgentTeams Convention -->\nSee .agentteams/reporting.md for project conventions.\n`;

  if (existsSync(claudeMdPath)) {
    const existingContent = readFileSync(claudeMdPath, "utf-8");
    if (existingContent.includes("<!-- AgentTeams Convention -->")) {
      return "Convention reference already exists in CLAUDE.md. No changes made.";
    }
  }

  const confirmed = await confirm(
    `This will modify ${CLAUDE_MD} and create a backup at ${CLAUDE_MD_BACKUP}. Continue?`
  );

  if (!confirmed) {
    return "Operation cancelled by user.";
  }

  if (existsSync(claudeMdPath)) {
    copyFileSync(claudeMdPath, backupPath);
    const content = readFileSync(claudeMdPath, "utf-8");
    writeFileSync(claudeMdPath, content + conventionRef, "utf-8");
  } else {
    writeFileSync(
      claudeMdPath,
      `# Project Conventions${conventionRef}`,
      "utf-8"
    );
  }

  const backupMsg = existsSync(backupPath)
    ? `Backup created: ${CLAUDE_MD_BACKUP}`
    : "New CLAUDE.md created (no previous file to backup).";

  return `Convention reference appended to ${CLAUDE_MD}.\n${backupMsg}`;
}

export async function conventionUpdate(): Promise<string> {
  const config = loadConfig();
  if (!config) {
    throw new Error(
      "Configuration not found. Run 'agentteams init' first or set environment variables."
    );
  }

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw new Error(
      "No .agentteams directory found. Run 'agentteams init' first."
    );
  }

  const apiUrl = config.apiUrl.endsWith("/")
    ? config.apiUrl.slice(0, -1)
    : config.apiUrl;

  const headers = {
    "X-API-Key": config.apiKey,
    "Content-Type": "application/json",
  };

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

  const markdownParts: string[] = [];

  for (const convention of conventions) {
    const downloadResponse = await axios.get(
      `${apiUrl}/api/projects/${config.projectId}/conventions/${convention.id}/download`,
      { headers, responseType: "text" }
    );
    markdownParts.push(downloadResponse.data);
  }

  const fullMarkdown = markdownParts.join("\n\n---\n\n");

  const conventionPath = join(projectRoot, CONVENTION_DIR, CONVENTION_FILE);
  writeFileSync(conventionPath, fullMarkdown, "utf-8");

  return `Convention updated successfully.\nDownloaded ${conventions.length} convention(s) to ${CONVENTION_DIR}/${CONVENTION_FILE}`;
}
