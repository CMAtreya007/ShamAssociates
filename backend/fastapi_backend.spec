# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Collect only packages needed by the FastAPI backend
datas_pydantic, binaries_pydantic, hiddenimports_pydantic = collect_all('pydantic')
datas_curl, binaries_curl, hiddenimports_curl = collect_all('curl_cffi')
datas_openpyxl, binaries_openpyxl, hiddenimports_openpyxl = collect_all('openpyxl')
datas_fastapi, binaries_fastapi, hiddenimports_fastapi = collect_all('fastapi')

all_datas = datas_pydantic + datas_curl + datas_openpyxl + datas_fastapi
all_binaries = binaries_pydantic + binaries_curl + binaries_openpyxl + binaries_fastapi
all_hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'aiosqlite',
    'sqlalchemy.dialects.sqlite.aiosqlite',
    'apscheduler',
    'apscheduler.schedulers.asyncio',
    'tzlocal',
    'pytz',
] + hiddenimports_pydantic + hiddenimports_curl + hiddenimports_openpyxl + hiddenimports_fastapi

# Exclude heavy unrelated machine learning and scientific packages
excluded_pkgs = [
    'torch', 'torchvision', 'torchaudio', 
    'tensorflow', 'tensorboard', 'keras', 
    'scipy', 'sklearn', 'matplotlib', 
    'pandas', 'numpy', 'scipy', 
    'tkinter', 'notebook', 'pytest', 
    'IPython', 'jupyter'
]

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excluded_pkgs,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='fastapi-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
