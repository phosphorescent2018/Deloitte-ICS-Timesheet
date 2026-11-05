/**
 * Axhub Make 要求的 metadata:sync 脚本。
 *
 * 作用：扫描 src/prototypes 与 src/themes，把资源清单同步到
 *   .axhub/make/project.json   （项目资源、导航、能力声明）
 *   .axhub/make/entries.json   （构建/预览入口缓存）
 *
 * 运行方式：npm run metadata:sync（Axhub Make 启动或更新客户端时会自动调用）
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stateDir = path.join(root, '.axhub', 'make');
const clientPath = path.join(stateDir, 'client.json');
const projectPath = path.join(stateDir, 'project.json');
const entriesPath = path.join(stateDir, 'entries.json');

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJsonIfChanged(file, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  try {
    if (fs.readFileSync(file, 'utf8') === next) return false;
  } catch {
    // 文件不存在则直接写入
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next, 'utf8');
  return true;
}

function readTitle(entryFile, fallback) {
  try {
    const source = fs.readFileSync(entryFile, 'utf8');
    const match = source.match(/@name\s+(.+)/);
    return match ? match[1].trim() : fallback;
  } catch {
    return fallback;
  }
}

function scanGroup(group) {
  const groupDir = path.join(root, 'src', group);
  if (!fs.existsSync(groupDir)) return [];

  return fs
    .readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(groupDir, name, 'index.tsx')))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const entryFile = path.join(groupDir, name, 'index.tsx');
      return {
        id: name,
        name,
        title: readTitle(entryFile, name),
        clientUrl: `/${group}/${name}`,
        previewMode: 'clientRuntime',
        description: '',
        updatedAt: '2026-05-03T00:00:00.000Z',
        filePath: `src/${group}/${name}/index.tsx`,
        absoluteFilePath: entryFile,
      };
    });
}

const client = readJson(clientPath, {});
const projectId = client?.project?.id || 'ics-timesheet';
const projectName = client?.project?.name || '';
const previous = readJson(projectPath, {}) || {};

const prototypes = scanGroup('prototypes');
const themes = scanGroup('themes');

const nextProject = {
  ...previous,
  schemaVersion: 1,
  project: { id: projectId, name: projectName },
  resources: {
    ...(previous.resources || {}),
    prototypes,
    themes,
  },
  navigation: { prototypes: prototypes.map((item) => item.id) },
  orders: { themes: themes.map((item) => item.id) },
  capabilities: previous.capabilities || {
    quickEdit: true,
    quickEditMode: 'clientRuntime',
    figmaExport: true,
    axureExport: true,
    localExports: { html: true, make: false },
  },
  resourceWriteTargets: previous.resourceWriteTargets || {
    themes: { type: 'project-relative-path', path: 'src/themes' },
    media: { type: 'project-relative-path', path: 'src/resources/assets' },
    prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
  },
};

writeJsonIfChanged(projectPath, nextProject);

const previousEntries = readJson(entriesPath);
const entries = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  items: {},
  js: {},
  html: {},
};

for (const item of prototypes) {
  const key = `prototypes/${item.id}`;
  entries.items[key] = {
    group: 'prototypes',
    name: item.id,
    js: `src/prototypes/${item.id}/index.tsx`,
    html: `src/prototypes/${item.id}/index.html`,
  };
  entries.js[key] = entries.items[key].js;
  entries.html[key] = entries.items[key].html;
}

for (const item of themes) {
  const key = `themes/${item.id}`;
  entries.items[key] = {
    group: 'themes',
    name: item.id,
    js: `src/themes/${item.id}/index.tsx`,
    html: `src/themes/${item.id}/index.html`,
  };
  entries.js[key] = entries.items[key].js;
  entries.html[key] = entries.items[key].html;
}

if (
  previousEntries &&
  typeof previousEntries.generatedAt === 'string' &&
  JSON.stringify(previousEntries.items) === JSON.stringify(entries.items)
) {
  entries.generatedAt = previousEntries.generatedAt;
}

writeJsonIfChanged(entriesPath, entries);
console.log(
  `[metadata:sync] project=${projectId} prototypes=${prototypes.length} themes=${themes.length} → .axhub/make/project.json`,
);
