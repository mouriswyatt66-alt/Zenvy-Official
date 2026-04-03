#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const semver = require('semver');
const { execSync } = require('child_process');
const os = require('os');

const ZENVY_VERSION = '1.0.0';
const REGISTRY_URL = process.env.ZENVY_REGISTRY || 'https://registry.zenvy.dev';
const ZENVY_DIR = path.join(os.homedir(), '.zenvy');
const PACKAGES_DIR = path.join(process.cwd(), 'zenvy_modules');
const CONFIG_FILE = 'zenvy.json';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return { name: path.basename(process.cwd()), version: '1.0.0', dependencies: {}, devDependencies: {} };
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function readLockfile() {
  if (fs.existsSync('zenvy.lock')) {
    return JSON.parse(fs.readFileSync('zenvy.lock', 'utf8'));
  }
  return { lockfileVersion: 1, packages: {} };
}

function writeLockfile(lock) {
  fs.writeFileSync('zenvy.lock', JSON.stringify(lock, null, 2));
}

function printBanner() {
  console.log(chalk.cyan.bold(`
  ███████╗███████╗███╗   ██╗██╗   ██╗██╗   ██╗
  ╚══███╔╝██╔════╝████╗  ██║██║   ██║╚██╗ ██╔╝
    ███╔╝ █████╗  ██╔██╗ ██║██║   ██║ ╚████╔╝ 
   ███╔╝  ██╔══╝  ██║╚██╗██║╚██╗ ██╔╝  ╚██╔╝  
  ███████╗███████╗██║ ╚████║ ╚████╔╝    ██║   
  ╚══════╝╚══════╝╚═╝  ╚═══╝  ╚═══╝     ╚═╝   
  `));
  console.log(chalk.gray(`  v${ZENVY_VERSION} — Scripted by Wyatt Mouris\n`));
}

async function fetchPackageInfo(name, version) {
  const url = version ? `${REGISTRY_URL}/package/${name}/${version}` : `${REGISTRY_URL}/package/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Package "${name}" not found in registry`);
  return res.json();
}

async function downloadPackage(tarballUrl, dest) {
  const res = await fetch(tarballUrl);
  if (!res.ok) throw new Error(`Failed to download package tarball`);
  const buffer = await res.buffer();
  const tmpFile = path.join(os.tmpdir(), `zenvy-${Date.now()}.tgz`);
  fs.writeFileSync(tmpFile, buffer);
  ensureDir(dest);
  await tar.x({ file: tmpFile, cwd: dest, strip: 1 });
  fs.unlinkSync(tmpFile);
}

async function installPackage(nameRaw, isDev, spinner) {
  let [name, versionSpec] = nameRaw.includes('@') && !nameRaw.startsWith('@')
    ? nameRaw.split('@')
    : [nameRaw, 'latest'];

  spinner.text = chalk.cyan(`Fetching ${name}@${versionSpec}...`);
  const info = await fetchPackageInfo(name, versionSpec === 'latest' ? null : versionSpec);
  const resolvedVersion = info.version;
  const tarballUrl = info.dist.tarball;
  const destDir = path.join(PACKAGES_DIR, name);

  spinner.text = chalk.cyan(`Downloading ${name}@${resolvedVersion}...`);
  await downloadPackage(tarballUrl, destDir);

  const config = readConfig();
  const lock = readLockfile();
  const depKey = isDev ? 'devDependencies' : 'dependencies';
  config[depKey] = config[depKey] || {};
  config[depKey][name] = `^${resolvedVersion}`;
  lock.packages[`${name}@${resolvedVersion}`] = {
    resolved: tarballUrl,
    integrity: info.dist.integrity || '',
    version: resolvedVersion
  };

  writeConfig(config);
  writeLockfile(lock);

  if (info.dependencies) {
    for (const [dep, ver] of Object.entries(info.dependencies)) {
      spinner.text = chalk.gray(`  Installing dependency ${dep}@${ver}...`);
      await installPackage(`${dep}@${ver.replace(/[\^~>=<]/g, '')}`, false, spinner);
    }
  }

  return resolvedVersion;
}

async function installAll(spinner) {
  const config = readConfig();
  const allDeps = { ...config.dependencies, ...config.devDependencies };
  for (const [name, ver] of Object.entries(allDeps)) {
    const v = ver.replace(/[\^~>=<]/g, '');
    await installPackage(`${name}@${v}`, false, spinner);
  }
}

program
  .name('zenvy')
  .description('Zenvy — The open package manager. Scripted by Wyatt Mouris.')
  .version(ZENVY_VERSION);

program
  .command('install [packages...]')
  .alias('i')
  .description('Install packages')
  .option('-D, --dev', 'Save as devDependency')
  .option('-g, --global', 'Install globally')
  .action(async (packages, opts) => {
    printBanner();
    const spinner = ora({ text: 'Starting...', color: 'cyan' }).start();
    try {
      ensureDir(PACKAGES_DIR);
      if (packages.length === 0) {
        spinner.text = 'Installing from zenvy.json...';
        await installAll(spinner);
        spinner.succeed(chalk.green('All packages installed successfully!'));
      } else {
        const results = [];
        for (const pkg of packages) {
          const ver = await installPackage(pkg, opts.dev, spinner);
          results.push(`${pkg.split('@')[0]}@${ver}`);
        }
        spinner.succeed(chalk.green(`Installed: ${results.join(', ')}`));
      }
    } catch (e) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

program
  .command('uninstall <packages...>')
  .alias('remove')
  .description('Remove packages')
  .action((packages) => {
    printBanner();
    const config = readConfig();
    for (const name of packages) {
      const pkgDir = path.join(PACKAGES_DIR, name);
      if (fs.existsSync(pkgDir)) {
        fs.rmSync(pkgDir, { recursive: true });
        console.log(chalk.green(`  removed ${name}`));
      } else {
        console.log(chalk.yellow(`  ${name} not found`));
      }
      delete config.dependencies[name];
      delete config.devDependencies[name];
    }
    writeConfig(config);
    console.log(chalk.cyan('\n  zenvy.json updated.'));
  });

program
  .command('publish')
  .description('Publish a package to the Zenvy registry')
  .action(async () => {
    printBanner();
    const spinner = ora({ text: 'Publishing...', color: 'cyan' }).start();
    try {
      const config = readConfig();
      const token = process.env.ZENVY_TOKEN || fs.existsSync(path.join(ZENVY_DIR, 'token'))
        ? fs.readFileSync(path.join(ZENVY_DIR, 'token'), 'utf8').trim()
        : null;
      if (!token) throw new Error('Not authenticated. Run: zenvy login');
      const files = {};
      const walk = (dir, base) => {
        fs.readdirSync(dir).forEach(f => {
          if (f === 'zenvy_modules' || f === '.git' || f === 'node_modules') return;
          const full = path.join(dir, f);
          const rel = path.join(base, f);
          if (fs.statSync(full).isDirectory()) walk(full, rel);
          else files[rel] = fs.readFileSync(full, 'base64');
        });
      };
      walk(process.cwd(), '');
      const payload = { name: config.name, version: config.version, description: config.description || '', main: config.main || 'index.js', files, dependencies: config.dependencies || {}, keywords: config.keywords || [], author: config.author || 'Wyatt Mouris', license: config.license || 'MIT' };
      const res = await fetch(`${REGISTRY_URL}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Publish failed');
      }
      spinner.succeed(chalk.green(`Published ${config.name}@${config.version} to Zenvy registry!`));
    } catch (e) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search the Zenvy registry')
  .action(async (query) => {
    printBanner();
    const spinner = ora({ text: `Searching for "${query}"...`, color: 'cyan' }).start();
    try {
      const res = await fetch(`${REGISTRY_URL}/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      spinner.stop();
      if (!data.results || data.results.length === 0) {
        console.log(chalk.yellow('  No packages found.'));
        return;
      }
      console.log(chalk.cyan(`\n  Found ${data.results.length} packages:\n`));
      data.results.forEach(pkg => {
        console.log(chalk.white.bold(`  ${pkg.name}`) + chalk.gray(`@${pkg.version}`) + chalk.cyan(`  — ${pkg.description || 'No description'}`));
        console.log(chalk.gray(`    by ${pkg.author || 'unknown'} | ${pkg.downloads || 0} downloads\n`));
      });
    } catch (e) {
      spinner.fail(chalk.red(e.message));
    }
  });

program
  .command('info <package>')
  .description('Show detailed info about a package')
  .action(async (name) => {
    printBanner();
    const spinner = ora({ text: `Fetching info for ${name}...`, color: 'cyan' }).start();
    try {
      const info = await fetchPackageInfo(name, null);
      spinner.stop();
      console.log(chalk.cyan.bold(`\n  ${info.name}@${info.version}`));
      console.log(chalk.white(`  ${info.description || 'No description'}`));
      console.log(chalk.gray(`\n  Author:    `) + chalk.white(info.author || 'unknown'));
      console.log(chalk.gray(`  License:   `) + chalk.white(info.license || 'unknown'));
      console.log(chalk.gray(`  Downloads: `) + chalk.white(info.downloads || 0));
      if (info.dependencies && Object.keys(info.dependencies).length) {
        console.log(chalk.gray(`\n  Dependencies:`));
        Object.entries(info.dependencies).forEach(([k, v]) => console.log(chalk.gray(`    ${k}: ${v}`)));
      }
    } catch (e) {
      spinner.fail(chalk.red(e.message));
    }
  });

program
  .command('login')
  .description('Authenticate with the Zenvy registry')
  .action(async () => {
    printBanner();
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    readline.question(chalk.cyan('  Enter your Zenvy API token: '), async (token) => {
      readline.close();
      const spinner = ora({ text: 'Verifying token...', color: 'cyan' }).start();
      try {
        const res = await fetch(`${REGISTRY_URL}/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Invalid token');
        ensureDir(ZENVY_DIR);
        fs.writeFileSync(path.join(ZENVY_DIR, 'token'), token);
        spinner.succeed(chalk.green('Logged in successfully!'));
      } catch (e) {
        spinner.fail(chalk.red(e.message));
      }
    });
  });

program
  .command('init')
  .description('Initialize a new Zenvy project')
  .action(() => {
    printBanner();
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(r => readline.question(chalk.cyan(`  ${q}`), r));
    (async () => {
      const name = await ask(`Package name (${path.basename(process.cwd())}): `) || path.basename(process.cwd());
      const version = await ask('Version (1.0.0): ') || '1.0.0';
      const description = await ask('Description: ');
      const author = await ask('Author (Wyatt Mouris): ') || 'Wyatt Mouris';
      const license = await ask('License (MIT): ') || 'MIT';
      readline.close();
      const config = { name, version, description, author, license, main: 'index.js', scripts: { start: 'node index.js', test: 'echo "No tests"' }, dependencies: {}, devDependencies: {} };
      writeConfig(config);
      console.log(chalk.green('\n  zenvy.json created!'));
    })();
  });

program
  .command('run <script>')
  .description('Run a script defined in zenvy.json')
  .action((script) => {
    const config = readConfig();
    if (!config.scripts || !config.scripts[script]) {
      console.log(chalk.red(`  Script "${script}" not found in zenvy.json`));
      process.exit(1);
    }
    console.log(chalk.cyan(`\n  > ${config.scripts[script]}\n`));
    execSync(config.scripts[script], { stdio: 'inherit', cwd: process.cwd() });
  });

program
  .command('list')
  .alias('ls')
  .description('List installed packages')
  .action(() => {
    printBanner();
    const config = readConfig();
    const deps = config.dependencies || {};
    const devDeps = config.devDependencies || {};
    console.log(chalk.cyan.bold('  Dependencies:'));
    Object.entries(deps).forEach(([k, v]) => console.log(chalk.white(`    ${k}`) + chalk.gray(`@${v}`)));
    console.log(chalk.cyan.bold('\n  DevDependencies:'));
    Object.entries(devDeps).forEach(([k, v]) => console.log(chalk.white(`    ${k}`) + chalk.gray(`@${v}`)));
  });

program
  .command('update [packages...]')
  .description('Update packages to latest versions')
  .action(async (packages) => {
    printBanner();
    const spinner = ora({ text: 'Checking for updates...', color: 'cyan' }).start();
    try {
      const config = readConfig();
      const toUpdate = packages.length ? packages : Object.keys({ ...config.dependencies, ...config.devDependencies });
      for (const name of toUpdate) {
        spinner.text = chalk.cyan(`Updating ${name}...`);
        await installPackage(name, false, spinner);
      }
      spinner.succeed(chalk.green('All packages updated!'));
    } catch (e) {
      spinner.fail(chalk.red(e.message));
    }
  });

program.parse(process.argv);
if (!process.argv.slice(2).length) {
  printBanner();
  program.outputHelp();
}
