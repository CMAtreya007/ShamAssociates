import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def generate_icons():
    icons_dir = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)

    # Base master image 512x512 with sleek modern dark teal/emerald gradient
    size = (512, 512)
    master = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(master)

    # Draw rounded rectangle background
    draw.rounded_rectangle([16, 16, 496, 496], radius=110, fill=(15, 23, 42, 255)) # Dark slate

    # Draw inner glowing emerald accent ring
    draw.rounded_rectangle([28, 28, 484, 484], radius=98, outline=(0, 179, 134, 255), width=8)

    # Draw modern financial candlestick / growth bars
    # Bar 1 (Left - Green)
    draw.rounded_rectangle([90, 240, 150, 420], radius=12, fill=(0, 179, 134, 255))
    draw.rectangle([115, 200, 125, 240], fill=(0, 179, 134, 255)) # Wick top

    # Bar 2 (Middle - Emerald Highest)
    draw.rounded_rectangle([185, 140, 245, 420], radius=12, fill=(52, 211, 153, 255))
    draw.rectangle([210, 100, 220, 140], fill=(52, 211, 153, 255)) # Wick top

    # Bar 3 (Right - Indigo / Cyan Accent)
    draw.rounded_rectangle([280, 190, 340, 420], radius=12, fill=(99, 102, 241, 255))
    draw.rectangle([305, 150, 315, 190], fill=(99, 102, 241, 255)) # Wick top

    # Upward trend dynamic arrow
    draw.line([(90, 320), (215, 190), (390, 110)], fill=(255, 255, 255, 255), width=16)
    draw.polygon([(390, 110), (340, 110), (390, 160)], fill=(255, 255, 255, 255))

    # Standard sizes
    sizes = {
        "32x32.png": (32, 32),
        "64x64.png": (64, 64),
        "128x128.png": (128, 128),
        "128x128@2x.png": (256, 256),
        "icon.png": (512, 512),
        "Square30x30Logo.png": (30, 30),
        "Square44x44Logo.png": (44, 44),
        "Square71x71Logo.png": (71, 71),
        "Square89x89Logo.png": (89, 89),
        "Square107x107Logo.png": (107, 107),
        "Square142x142Logo.png": (142, 142),
        "Square150x150Logo.png": (150, 150),
        "Square284x284Logo.png": (284, 284),
        "Square310x310Logo.png": (310, 310),
        "StoreLogo.png": (50, 50),
    }

    for fname, sz in sizes.items():
        resized = master.resize(sz, Image.Resampling.LANCZOS)
        resized.save(icons_dir / fname, "PNG")
        print(f"Generated {fname} ({sz[0]}x{sz[1]})")

    # Generate multi-resolution .ico for Windows
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(icons_dir / "icon.ico", format="ICO", sizes=ico_sizes)
    print("Generated icon.ico (Multi-size)")

    # For macOS icon.icns (save as png copy for platforms without libicns or copy 512x512)
    master.save(icons_dir / "icon.icns", format="PNG")
    print("Generated icon.icns")

if __name__ == "__main__":
    generate_icons()
