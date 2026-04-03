@echo off
cd /d "%~dp0"

echo.
echo  =========================================
echo   Zenvy Installer Builder
echo   Scripted by Wyatt Mouris
echo  =========================================
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python not found. Install Python 3.11+ from python.org
    pause
    exit /b 1
)

echo  [1/3] Installing PyInstaller...
python -m pip install pyinstaller --quiet
if %errorlevel% neq 0 (
    echo  ERROR: Failed to install PyInstaller.
    pause
    exit /b 1
)

echo  [2/3] Building EXE from installer folder...
python -m PyInstaller ZenvyInstaller.spec --clean --noconfirm
if %errorlevel% neq 0 (
    echo  ERROR: PyInstaller build failed. Check output above.
    pause
    exit /b 1
)

echo  [3/3] Done!
echo.
echo  Output: %~dp0dist\ZenvyInstaller.exe
echo.
echo  Upload dist\ZenvyInstaller.exe to your GitHub Release.
echo.
pause
