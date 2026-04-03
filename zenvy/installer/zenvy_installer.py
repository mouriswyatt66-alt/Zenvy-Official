import sys
import os
import subprocess
import urllib.request
import urllib.error
import json
import shutil
import tempfile
import hashlib
import zipfile
import threading
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path

ZENVY_VERSION = "1.0.0"
GITHUB_REPO = "mouriswyatt66-alt/Zenvy-Official"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}"
GITHUB_RAW = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main"

PROGRAM_FILES = Path(os.environ.get("ProgramFiles", "C:\\Program Files"))
INSTALL_DIR = PROGRAM_FILES / "Zenvy"
NODE_VERSION = "20.11.0"
NODE_URL = f"https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-win-x64.zip"
ZENVY_CLI_URL = f"{GITHUB_RAW}/cli/zenvy.js"
ZENVY_PKG_URL = f"{GITHUB_RAW}/cli/package.json"


def is_admin():
    try:
        import ctypes
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False


def run_as_admin():
    import ctypes
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
    sys.exit(0)


def download_file(url, dest, on_progress=None):
    req = urllib.request.Request(url, headers={"User-Agent": "ZenvyInstaller/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        total = int(resp.getheader("Content-Length", 0))
        downloaded = 0
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if on_progress and total:
                    on_progress(downloaded / total * 100)


def get_installed_version():
    vf = INSTALL_DIR / "version.txt"
    return vf.read_text().strip() if vf.exists() else None


def write_version(v):
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    (INSTALL_DIR / "version.txt").write_text(v)


def add_to_path(directory):
    try:
        import winreg
        import ctypes
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
            0, winreg.KEY_ALL_ACCESS
        )
        current, _ = winreg.QueryValueEx(key, "Path")
        dir_str = str(directory)
        if dir_str not in current:
            winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, current + ";" + dir_str)
        winreg.CloseKey(key)
        ctypes.windll.user32.SendMessageW(0xFFFF, 0x001A, 0, "Environment")
    except Exception:
        pass


def register_uninstaller():
    try:
        import winreg
        key = winreg.CreateKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Zenvy"
        )
        winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "Zenvy Package Manager")
        winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, ZENVY_VERSION)
        winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, "Wyatt Mouris")
        winreg.SetValueEx(key, "InstallLocation", 0, winreg.REG_SZ, str(INSTALL_DIR))
        winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, str(INSTALL_DIR / "uninstall.cmd"))
        winreg.SetValueEx(key, "NoModify", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "NoRepair", 0, winreg.REG_DWORD, 1)
        winreg.CloseKey(key)
    except Exception:
        pass


def check_for_updates():
    try:
        req = urllib.request.Request(
            f"{GITHUB_API}/releases/latest",
            headers={"User-Agent": "ZenvyInstaller/1.0", "Accept": "application/vnd.github.v3+json"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            return data.get("tag_name", "").lstrip("v"), data.get("body", "")
    except Exception:
        return None, ""


class ZenvyInstaller(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Zenvy — Open Package Manager  |  by Wyatt Mouris")
        self.geometry("640x500")
        self.resizable(False, False)
        self.configure(bg="#0d1117")
        self._build_ui()
        self._startup_check()

    def _build_ui(self):
        tk.Frame(self, bg="#00e5ff", height=5).pack(fill="x")

        tk.Label(
            self, text="ZENVY", font=("Courier New", 40, "bold"),
            fg="#00e5ff", bg="#0d1117"
        ).pack(pady=(28, 0))

        tk.Label(
            self, text="Open Source Package Manager",
            font=("Courier New", 12), fg="#8b949e", bg="#0d1117"
        ).pack()

        tk.Label(
            self, text="Scripted by Wyatt Mouris  •  MIT License",
            font=("Courier New", 9), fg="#21262d", bg="#0d1117"
        ).pack(pady=(2, 0))

        self.status = tk.Label(
            self, text="Ready.", font=("Courier New", 11),
            fg="#c9d1d9", bg="#0d1117"
        )
        self.status.pack(pady=(22, 4))

        style = ttk.Style()
        style.theme_use("clam")
        style.configure(
            "Z.Horizontal.TProgressbar",
            troughcolor="#161b22", background="#00e5ff",
            bordercolor="#0d1117", lightcolor="#00e5ff", darkcolor="#00e5ff"
        )
        self.bar = ttk.Progressbar(self, length=540, mode="determinate", style="Z.Horizontal.TProgressbar")
        self.bar.pack(pady=6)

        self.log = tk.Text(
            self, height=11, width=72, bg="#161b22", fg="#8b949e",
            font=("Courier New", 9), relief="flat", state="disabled",
            insertbackground="#00e5ff", selectbackground="#1f6feb"
        )
        self.log.pack(pady=8, padx=24)

        btns = tk.Frame(self, bg="#0d1117")
        btns.pack(pady=8)

        self.btn_install = tk.Button(
            btns, text="INSTALL ZENVY", font=("Courier New", 12, "bold"),
            bg="#00e5ff", fg="#0d1117", relief="flat", padx=26, pady=10,
            cursor="hand2", activebackground="#00bcd4", activeforeground="#0d1117",
            command=self._begin_install
        )
        self.btn_install.pack(side="left", padx=8)

        self.btn_update = tk.Button(
            btns, text="CHECK FOR UPDATE", font=("Courier New", 11),
            bg="#161b22", fg="#8b949e", relief="flat", padx=18, pady=10,
            cursor="hand2", activebackground="#21262d", activeforeground="#c9d1d9",
            command=self._check_update_ui
        )
        self.btn_update.pack(side="left", padx=8)

        tk.Frame(self, bg="#00e5ff", height=4).pack(fill="x", side="bottom")

    def _log(self, msg):
        self.log.config(state="normal")
        self.log.insert("end", f"  {msg}\n")
        self.log.see("end")
        self.log.config(state="disabled")

    def _set(self, msg, pct=None):
        self.status.config(text=msg)
        if pct is not None:
            self.bar["value"] = pct
        self.update_idletasks()

    def _lock(self):
        self.btn_install.config(state="disabled")
        self.btn_update.config(state="disabled")

    def _unlock(self):
        self.btn_install.config(state="normal")
        self.btn_update.config(state="normal")

    def _startup_check(self):
        installed = get_installed_version()
        if installed:
            self._log(f"Zenvy {installed} detected. Checking for updates...")
            threading.Thread(target=self._auto_update, daemon=True).start()
        else:
            self._log("Zenvy is not installed. Click INSTALL ZENVY to begin.")

    def _auto_update(self):
        latest, notes = check_for_updates()
        installed = get_installed_version()
        if latest and latest != installed:
            self.after(0, lambda: self._prompt_update(latest, notes))
        else:
            self.after(0, lambda: self._set("Zenvy is up to date."))

    def _prompt_update(self, version, notes):
        msg = f"Zenvy {version} is available!\n\n{notes[:300]}\n\nInstall now?"
        if messagebox.askyesno("Update Available", msg):
            self._begin_install()

    def _check_update_ui(self):
        self._set("Checking for updates...")
        self._log("Contacting GitHub releases API...")
        threading.Thread(target=self._auto_update, daemon=True).start()

    def _begin_install(self):
        self._lock()
        threading.Thread(target=self._install, daemon=True).start()

    def _install(self):
        try:
            tmpdir = Path(tempfile.mkdtemp(prefix="zenvy_install_"))
            self.after(0, lambda: self._log(f"Temp dir: {tmpdir}"))

            self.after(0, lambda: self._set("Downloading Node.js LTS...", 5))
            self.after(0, lambda: self._log(f"Fetching Node.js v{NODE_VERSION} from nodejs.org..."))
            node_zip = tmpdir / "node.zip"
            download_file(NODE_URL, node_zip, lambda p: self.after(0, lambda: self._set(f"Downloading Node.js... {p:.0f}%", p * 0.45)))

            self.after(0, lambda: self._set("Extracting Node.js...", 47))
            self.after(0, lambda: self._log("Extracting node zip..."))
            with zipfile.ZipFile(node_zip, "r") as z:
                z.extractall(tmpdir)
            node_src = next(tmpdir.glob("node-v*-win-x64"))
            node_dest = INSTALL_DIR / "node"
            if node_dest.exists():
                shutil.rmtree(node_dest)
            shutil.copytree(str(node_src), str(node_dest))
            self.after(0, lambda: self._log(f"Node.js installed to {node_dest}"))

            self.after(0, lambda: self._set("Downloading Zenvy CLI...", 55))
            self.after(0, lambda: self._log("Pulling zenvy.js from GitHub..."))
            cli_dir = INSTALL_DIR / "cli"
            cli_dir.mkdir(parents=True, exist_ok=True)
            download_file(ZENVY_CLI_URL, cli_dir / "zenvy.js")
            download_file(ZENVY_PKG_URL, cli_dir / "package.json")
            self.after(0, lambda: self._log("CLI files downloaded."))

            self.after(0, lambda: self._set("Installing CLI dependencies...", 65))
            self.after(0, lambda: self._log("Running npm install (this may take a moment)..."))
            npm_cmd = node_dest / "npm.cmd"
            result = subprocess.run(
                [str(npm_cmd), "install", "--prefix", str(cli_dir)],
                cwd=str(cli_dir), capture_output=True, text=True
            )
            if result.returncode != 0:
                raise RuntimeError(f"npm install failed:\n{result.stderr[:400]}")
            self.after(0, lambda: self._log("npm install complete."))

            self.after(0, lambda: self._set("Creating zenvy.cmd shim...", 80))
            shim = INSTALL_DIR / "zenvy.cmd"
            shim.write_text(
                f'@echo off\r\n"{node_dest / "node.exe"}" "{cli_dir / "zenvy.js"}" %*\r\n'
            )
            self.after(0, lambda: self._log(f"Shim created: {shim}"))

            self.after(0, lambda: self._set("Writing uninstaller...", 84))
            uninstaller = INSTALL_DIR / "uninstall.cmd"
            uninstaller.write_text(
                f'@echo off\r\n'
                f'echo Uninstalling Zenvy...\r\n'
                f'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Zenvy" /f 2>nul\r\n'
                f'rmdir /s /q "{INSTALL_DIR}"\r\n'
                f'echo Done.\r\npause\r\n'
            )

            self.after(0, lambda: self._set("Updating system PATH...", 88))
            add_to_path(INSTALL_DIR)
            self.after(0, lambda: self._log("PATH updated."))

            self.after(0, lambda: self._set("Registering in Windows Apps...", 92))
            register_uninstaller()
            self.after(0, lambda: self._log("Registered in Add/Remove Programs."))

            write_version(ZENVY_VERSION)
            shutil.rmtree(str(tmpdir), ignore_errors=True)

            self.after(0, lambda: self._set("Zenvy installed successfully!", 100))
            self.after(0, lambda: self._log(""))
            self.after(0, lambda: self._log("Installation complete!"))
            self.after(0, lambda: self._log("Open a NEW terminal window and run:  zenvy --version"))
            self.after(0, lambda: messagebox.showinfo(
                "Zenvy Installed!",
                "Zenvy has been installed successfully!\n\n"
                "Open a new terminal and run:\n"
                "    zenvy --version\n\n"
                "Scripted by Wyatt Mouris"
            ))
        except Exception as e:
            self.after(0, lambda: self._set(f"Error during install."))
            self.after(0, lambda: self._log(f"ERROR: {e}"))
            self.after(0, lambda: messagebox.showerror("Install Failed", str(e)))
        finally:
            self.after(0, self._unlock)


if __name__ == "__main__":
    if not is_admin():
        run_as_admin()
    app = ZenvyInstaller()
    app.mainloop()
