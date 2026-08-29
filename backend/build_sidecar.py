import os
import sys
import platform
import shutil
import subprocess
from pathlib import Path

def build_sidecar():
    backend_dir = Path(__file__).resolve().parent
    root_dir = backend_dir.parent
    resources_bin_dir = root_dir / "resources" / "bin"
    resources_bin_dir.mkdir(parents=True, exist_ok=True)

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
        base_name = "fastapi-backend.exe" if platform.system().lower() == "windows" else "fastapi-backend"
        target_path = resources_bin_dir / base_name
        shutil.copy2(built_exe, target_path)

        # On macOS/Linux, ensure executable permissions
        if platform.system().lower() != "windows":
            os.chmod(target_path, 0o755)

        print(f"Successfully copied sidecar binary to: {target_path}")
        return True
    else:
        print("Built binary not found in dist/")
        return False

if __name__ == "__main__":
    build_sidecar()
