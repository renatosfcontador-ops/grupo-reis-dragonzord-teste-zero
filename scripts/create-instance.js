#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const [destArg, catalogArg] = process.argv.slice(2);

if (!destArg) {
  console.error('Uso: node scripts/create-instance.js <destino> [catalogo.json]');
  console.error('Exemplo: node scripts/create-instance.js ../dragonzord-teste-um ../catalogos/teste-um.json');
  process.exit(1);
}

const dest = path.resolve(process.cwd(), destArg);
if (dest === root || dest.startsWith(root + path.sep)) {
  console.error('O destino não pode ficar dentro da pasta do template.');
  process.exit(1);
}

const skip = (relative) => {
  const normalized = relative.replace(/\\/g, '/');
  return normalized === '.git'
    || normalized.startsWith('.git/')
    || normalized === 'node_modules'
    || normalized.startsWith('node_modules/')
    || normalized === 'reports/reports.json'
    || normalized === 'reports/url-overrides.json';
};

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const relative = path.relative(root, sourcePath);
    if (skip(relative)) continue;
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

copyDir(root, dest);

if (catalogArg) {
  const catalogPath = path.resolve(process.cwd(), catalogArg);
  if (!fs.existsSync(catalogPath)) {
    console.error(`Catálogo não encontrado: ${catalogPath}`);
    process.exit(1);
  }

  const data = readJson(catalogPath);
  const projects = data.projects || data.agents;
  if (!Array.isArray(projects)) {
    console.error('O catálogo precisa conter um array "projects" (ou "agents").');
    process.exit(1);
  }

  const instance = {
    ...data,
    meta: {
      ...(data.meta || {}),
      project: data.meta?.project || path.basename(dest),
      instance: data.meta?.instance || 'custom',
      source: data.meta?.source || path.basename(catalogPath),
      updatedAt: new Date().toISOString().slice(0, 10),
    },
    projects,
  };
  delete instance.agents;

  writeJson(path.join(dest, 'projects.json'), instance);

  const packagePath = path.join(dest, 'package.json');
  if (fs.existsSync(packagePath)) {
    const pkg = readJson(packagePath);
    pkg.name = path.basename(dest).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    pkg.description = `DragonZord: ${instance.meta.project}`;
    writeJson(packagePath, pkg);
  }
}

console.log(`Instância criada em: ${dest}`);
console.log('Próximos passos:');
console.log(`  cd "${dest}"`);
console.log('  npm start');
console.log('  # edite projects.json e depois:');
console.log('  git init -b main');
console.log('  git add .');
console.log('  git commit -m "feat: initial dragonzord instance"');
console.log('  gh repo create <owner>/<repo> --public --source=. --remote=origin --push');