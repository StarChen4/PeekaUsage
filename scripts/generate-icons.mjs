import { execFile } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Icns, IcnsImage } from '@fiahfy/icns';
import pngToIco from 'png-to-ico';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const defaultSourceCandidates = [
  path.join(projectRoot, 'src-tauri', 'icons', 'icon-source.svg'),
  path.join(projectRoot, 'src-tauri', 'icons', 'icon-source.png'),
];

const defaultSmallSourceCandidates = [
  path.join(projectRoot, 'src-tauri', 'icons', 'icon-source-small.svg'),
];

const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultSourceCandidates.find((candidate) => existsSync(candidate))
    ?? defaultSourceCandidates.at(-1);

const smallSourcePath = process.argv[3]
  ? path.resolve(process.argv[3])
  : defaultSmallSourceCandidates.find((candidate) => existsSync(candidate))
    ?? sourcePath;

const inkscapeCandidates = [
  process.env.INKSCAPE_BIN,
  'C:\\Program Files\\Inkscape\\bin\\inkscape.exe',
  'C:\\Program Files\\Inkscape\\inkscape.exe',
  'inkscape',
].filter(Boolean);

const standardPngOutputs = [
  ['src-tauri/icons/32x32.png', 32, 'small'],
  ['src-tauri/icons/64x64.png', 64, 'small'],
  ['src-tauri/icons/128x128.png', 128, 'main'],
  ['src-tauri/icons/128x128@2x.png', 256, 'main'],
  ['src-tauri/icons/icon.png', 512, 'main'],
  ['src-tauri/icons/StoreLogo.png', 50, 'small'],
  ['src-tauri/icons/Square30x30Logo.png', 30, 'small'],
  ['src-tauri/icons/Square44x44Logo.png', 44, 'small'],
  ['src-tauri/icons/Square71x71Logo.png', 71, 'small'],
  ['src-tauri/icons/Square89x89Logo.png', 89, 'small'],
  ['src-tauri/icons/Square107x107Logo.png', 107, 'main'],
  ['src-tauri/icons/Square142x142Logo.png', 142, 'main'],
  ['src-tauri/icons/Square150x150Logo.png', 150, 'main'],
  ['src-tauri/icons/Square284x284Logo.png', 284, 'main'],
  ['src-tauri/icons/Square310x310Logo.png', 310, 'main'],
  ['public/favicon-16x16.png', 16, 'small'],
  ['public/favicon-32x32.png', 32, 'small'],
  ['public/apple-touch-icon.png', 180, 'main'],
];

const icoSizes = [16, 20, 24, 30, 32, 40, 48, 64, 72, 96, 128, 256];

const macIconsetFiles = [
  ['icon_16x16.png', 16, 'small'],
  ['icon_16x16@2x.png', 32, 'small'],
  ['icon_32x32.png', 32, 'small'],
  ['icon_32x32@2x.png', 64, 'small'],
  ['icon_128x128.png', 128, 'main'],
  ['icon_128x128@2x.png', 256, 'main'],
  ['icon_256x256.png', 256, 'main'],
  ['icon_256x256@2x.png', 512, 'main'],
  ['icon_512x512.png', 512, 'main'],
  ['icon_512x512@2x.png', 1024, 'main'],
];

const icnsTypes = [
  ['icp4', 'icon_16x16.png'],
  ['ic11', 'icon_16x16@2x.png'],
  ['icp5', 'icon_32x32.png'],
  ['ic12', 'icon_32x32@2x.png'],
  ['ic07', 'icon_128x128.png'],
  ['ic13', 'icon_128x128@2x.png'],
  ['ic08', 'icon_256x256.png'],
  ['ic14', 'icon_256x256@2x.png'],
  ['ic09', 'icon_512x512.png'],
  ['ic10', 'icon_512x512@2x.png'],
];

function resolveInkscape() {
  const directCandidate = inkscapeCandidates.find((candidate) => candidate && existsSync(candidate));
  if (directCandidate) {
    return directCandidate;
  }

  return 'inkscape';
}

function resolveVariantSource(variant) {
  return variant === 'small' ? smallSourcePath : sourcePath;
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function exportPng(inkscapePath, inputPath, outputPath, size) {
  await ensureDir(outputPath);

  const args = [
    inputPath,
    '--export-type=png',
    `--export-filename=${outputPath}`,
    '--export-area-page',
    '--export-background-opacity=0',
    '--export-png-color-mode=RGBA_8',
    '--export-png-antialias=3',
    `--export-width=${size}`,
    `--export-height=${size}`,
  ];

  await execFileAsync(inkscapePath, args, {
    cwd: projectRoot,
    windowsHide: true,
  });
}

async function buildIco(tempDir) {
  const pngPaths = [];

  for (const size of icoSizes) {
    pngPaths.push(path.join(tempDir, `ico-${size}.png`));
  }

  const icoBuffer = await pngToIco(pngPaths);

  await fs.writeFile(path.join(projectRoot, 'src-tauri', 'icons', 'icon.ico'), icoBuffer);
  await fs.writeFile(path.join(projectRoot, 'public', 'favicon.ico'), icoBuffer);
}

async function buildIcns(iconsetDir) {
  const icns = new Icns();

  for (const [type, fileName] of icnsTypes) {
    const buffer = await fs.readFile(path.join(iconsetDir, fileName));
    icns.append(IcnsImage.fromPNG(buffer, type));
  }

  await fs.writeFile(path.join(projectRoot, 'src-tauri', 'icons', 'icon.icns'), icns.data);
}

async function cleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  await fs.access(sourcePath);
  await fs.access(smallSourcePath);

  const inkscapePath = resolveInkscape();
  const iconsetDir = path.join(projectRoot, 'src-tauri', 'icons', 'icon.iconset');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peekausage-icons-'));

  try {
    await cleanDir(iconsetDir);

    for (const [relativePath, size, variant] of standardPngOutputs) {
      await exportPng(
        inkscapePath,
        resolveVariantSource(variant),
        path.join(projectRoot, relativePath),
        size,
      );
    }

    for (const [fileName, size, variant] of macIconsetFiles) {
      await exportPng(
        inkscapePath,
        resolveVariantSource(variant),
        path.join(iconsetDir, fileName),
        size,
      );
    }

    for (const size of icoSizes) {
      await exportPng(
        inkscapePath,
        size <= 89 ? smallSourcePath : sourcePath,
        path.join(tempDir, `ico-${size}.png`),
        size,
      );
    }

    await buildIco(tempDir);
    await buildIcns(iconsetDir);

    console.log(`已生成图标，大尺寸源文件: ${sourcePath}`);
    console.log(`已生成图标，小尺寸源文件: ${smallSourcePath}`);
    console.log(`已使用 Inkscape: ${inkscapePath}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('图标生成失败:', error);
  process.exitCode = 1;
});
