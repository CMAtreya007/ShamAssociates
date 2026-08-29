import os
import sys
import platform
import shutil
import subprocess
from pathlib import Path

def get_tauri_target_triple():
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "windows":
        return "x86_64-pc-windows-msvc.exe"
    elif system == "darwin":
        if "arm" in machine or "aarch64" in machine:
            return "aarch64-apple-darwin"
        else:
            return "x86_64-apple-darwin"
    elif system == "linux":
        return "x86_64-unknown-linux-gnu"
    return "unknown"

def build_sidecar():
    backend_dir = Path(__file__).resolve().parent
    root_dir = backend_dir.parent
    tauri_bin_dir = root_dir / "src-tauri" / "binaries"
    tauri_bin_dir.mkdir(parents=True, exist_ok=True)

    print(f"Building standalone FastAPI backend sidecar for {platform.system()} ({platform.machine()})...")
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "-y",
        str(backend_dir / "fastapi_backend.spec")
    ]
    res = subprocess.run(cmd, cwd=str(backend_dir))
    if res.returncode != 0:
        print("PyInstaller build failed.")
        return False

    built_exe = backend_dir / "dist" / "fastapi-backend.exe"
    if not built_exe.exists():
        built_exe = backend_dir / "dist" / "fastapi-backend"

    if built_exe.exists():
        triple = get_tauri_target_triple()
        target_name = f"fastapi-backend-{triple}"
        target_path = tauri_bin_dir / target_name
        shutil.copy2(built_exe, target_path)
        
        # On macOS/Linux, ensure executable permissions
        if platform.system().lower() != "windows":
            os.chmod(target_path, 0o755)
            # Also create universal copy if on mac
            shutil.copy2(built_exe, tauri_bin_dir / "fastapi-backend-universal-apple-darwin")
            os.chmod(tauri_bin_dir / "fastapi-backend-universal-apple-darwin", 0o755)

        # Also copy as default name
        base_name = "fastapi-backend.exe" if platform.system().lower() == "windows" else "fastapi-backend"
        shutil.copy2(built_exe, tauri_bin_dir / base_name)
        
        print(f"Successfully copied sidecar binary to: {target_path}")
        return True
    else:
        print("Built binary not found in dist/")
        return False

if __name__ == "__main__":
    build_sidecar()
