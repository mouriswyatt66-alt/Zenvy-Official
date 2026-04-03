<div align="center">

```
███████╗███████╗███╗   ██╗██╗   ██╗██╗   ██╗
╚══███╔╝██╔════╝████╗  ██║██║   ██║╚██╗ ██╔╝
  ███╔╝ █████╗  ██╔██╗ ██║██║   ██║ ╚████╔╝ 
 ███╔╝  ██╔══╝  ██║╚██╗██║╚██╗ ██╔╝  ╚██╔╝  
███████╗███████╗██║ ╚████║ ╚████╔╝    ██║   
╚══════╝╚══════╝╚═╝  ╚═══╝  ╚═══╝     ╚═╝   
```

# Zenvy

**The open, community-driven package manager.**
*Better than npm in every way. Scripted by Wyatt Mouris.*

[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/mouriswyatt66-alt/Zenvy-Official?color=cyan)](https://github.com/mouriswyatt66-alt/Zenvy-Official/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/mouriswyatt66-alt/Zenvy-Official)](https://github.com/mouriswyatt66-alt/Zenvy-Official/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/mouriswyatt66-alt/Zenvy-Official/pulls)
[![Windows](https://img.shields.io/badge/Windows-Installer-blue?logo=windows)](https://github.com/mouriswyatt66-alt/Zenvy-Official/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/mouriswyatt66-alt/Zenvy-Official)

</div>

---

## What is Zenvy?

Zenvy is a **fully open source** package manager and public registry built by the community, for the community. Anyone can publish packages. Anyone can install packages. Anyone can host their own registry. No corporate gatekeeping.

- Open registry — anyone can publish, anyone can install
- Windows GUI installer — one `.exe`, auto-updater built in, shows in Windows Apps list
- Self-hostable — run your own private or public registry with Docker in minutes
- Faster installs — parallel downloads, integrity lockfile, clean dependency tree
- Familiar CLI — same feel as npm, zero learning curve
- 100% MIT — fork it, improve it, own it forever

---

## Windows Installer (Recommended)

Zenvy ships as a native Windows application. It installs automatically, adds itself to your PATH, registers in **Windows Settings > Apps**, and checks GitHub for updates every time you launch it.

### Download and Install

1. Go to [**Releases**](https://github.com/mouriswyatt66-alt/Zenvy-Official/releases)
2. Download `ZenvyInstaller.exe`
3. Right-click and select **Run as Administrator**
4. Click **INSTALL ZENVY** and wait for the progress bar to complete
5. Open a **new** terminal window and run:

```sh
zenvy --version
```

### What the installer does

- Downloads Node.js LTS automatically — no manual Node install needed
- Downloads the Zenvy CLI directly from this GitHub repo
- Creates a `zenvy.cmd` shim so `zenvy` works from any terminal
- Adds `C:\Program Files\Zenvy` to your system PATH
- Registers itself in **Windows Settings > Apps and Features** with a working uninstaller
- Checks GitHub Releases for updates every time you open it

### Auto-Update

When a new version is released on GitHub, the installer detects it on launch and prompts you to update. Clicking yes re-runs the install automatically with no manual download needed.

---

## Building the Windows EXE Yourself

Requirements: **Python 3.11 or newer** installed on Windows. VS Code is optional but recommended.

### Folder structure

```
Zenvy-Official/
└── installer/
    ├── zenvy_installer.py   Python source for the GUI installer
    ├── ZenvyInstaller.spec  PyInstaller build configuration
    └── build.bat            Run this to build the EXE
```

### Build steps

Open VS Code, open a terminal inside the `installer/` folder, and run:

```bat
build.bat
```

Or just double-click `build.bat` in File Explorer.

The build script automatically:

1. Changes directory to the `installer/` folder so it always builds from the right place
2. Installs PyInstaller via pip if not already installed
3. Compiles `zenvy_installer.py` into a single standalone EXE
4. Outputs to `installer/dist/ZenvyInstaller.exe`

You can also run the raw PyInstaller command manually from inside the `installer/` folder:

```bat
cd installer
pip install pyinstaller
python -m PyInstaller ZenvyInstaller.spec --clean --noconfirm
```

The EXE will appear at `installer/dist/ZenvyInstaller.exe`. Upload it to your GitHub Release.

### Releasing a new version

```sh
git tag v1.0.1
git push origin v1.0.1
```

The CI workflow at `.github/workflows/ci.yml` automatically builds the EXE on Windows and attaches it to the GitHub Release.

---

## Manual Install (Any OS)

```sh
git clone https://github.com/mouriswyatt66-alt/Zenvy-Official.git
cd Zenvy-Official/cli
npm install
node zenvy.js --help
```

---

## CLI Usage

```sh
zenvy init                      Initialize a new project
zenvy install express           Install a package
zenvy install express@4.18.2   Install a specific version
zenvy install lodash -D         Install as dev dependency
zenvy install                   Install all from zenvy.json
zenvy remove express            Remove a package
zenvy login                     Authenticate with registry
zenvy publish                   Publish current package
zenvy search http               Search the registry
zenvy info express              Show package details
zenvy run start                 Run a script
zenvy list                      List installed packages
zenvy update                    Update all packages
zenvy update express            Update one package
```

---

## zenvy.json

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "description": "My first Zenvy package",
  "author": "Your Name",
  "license": "MIT",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "build": "webpack"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

---

## Self-Hosting the Registry

```sh
git clone https://github.com/mouriswyatt66-alt/Zenvy-Official.git
cd Zenvy-Official
docker-compose up -d
```

Registry runs at `http://localhost:3000`. Point the CLI at your registry:

```sh
ZENVY_REGISTRY=http://localhost:3000 zenvy install my-package
```

### Registry Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `MONGO_URI` | `mongodb://localhost:27017/zenvy` | MongoDB connection string |
| `JWT_SECRET` | change this | Auth token secret |
| `NODE_ENV` | `development` | Environment mode |

---

## Registry API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Login and get token |
| `GET` | `/auth/verify` | Verify your token |
| `POST` | `/publish` | Publish a package |
| `GET` | `/package/:name` | Get latest version info |
| `GET` | `/package/:name/:version` | Get specific version |
| `DELETE` | `/package/:name/:version` | Unpublish a version |
| `GET` | `/search?q=query` | Search packages |
| `GET` | `/info/:name` | Full package metadata |
| `GET` | `/packages` | Browse all packages |
| `GET` | `/user/:username` | User profile and packages |
| `GET` | `/health` | Health check |

---

## Repository Structure

```
Zenvy-Official/
├── cli/
│   ├── zenvy.js              CLI tool — all commands
│   └── package.json
├── registry/
│   ├── server.js             Registry API server
│   ├── package.json
│   └── Dockerfile
├── installer/
│   ├── zenvy_installer.py    Windows GUI installer source
│   ├── ZenvyInstaller.spec   PyInstaller build config
│   └── build.bat             One-click EXE builder
├── .github/
│   └── workflows/
│       └── ci.yml            Builds EXE and creates GitHub Release on tag push
├── docker-compose.yml        Full stack deployment
├── nginx.conf                Production reverse proxy config
├── LICENSE                   MIT License
└── README.md
```

---

## Contributing

Zenvy is fully open source and all contributions are welcome.

1. Fork this repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Open a Pull Request

Ideas welcome: `zenvy audit`, `zenvy pack`, `zenvy outdated`, macOS installer, Linux installer, org namespaces, package webhooks, web UI for the registry.

---

## License

MIT License — Copyright 2024 **Wyatt Mouris**

---

<div align="center">

Made by **Wyatt Mouris** — [GitHub](https://github.com/mouriswyatt66-alt)

</div>
