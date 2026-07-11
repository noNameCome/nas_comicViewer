import glob
import os
import sys

from PIL import Image, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(SCRIPT_DIR, "..", "icon")
OUT_DIR = os.path.join(SCRIPT_DIR, "custom")

DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def find_source_image():
    candidates = sorted(
        f for f in glob.glob(os.path.join(SRC_DIR, "*"))
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    )
    if not candidates:
        print(f"No source image found in {SRC_DIR}")
        sys.exit(1)
    return candidates[0]


def make_circle(src_path):
    im = Image.open(src_path).convert("RGB")
    side = min(im.size)
    left = (im.size[0] - side) // 2
    top = (im.size[1] - side) // 2
    im = im.crop((left, top, left + side, top + side)).resize((1024, 1024), Image.LANCZOS)

    supersample = 4096
    mask_big = Image.new("L", (supersample, supersample), 0)
    ImageDraw.Draw(mask_big).ellipse((0, 0, supersample - 1, supersample - 1), fill=255)
    mask = mask_big.resize((1024, 1024), Image.LANCZOS)

    circle = im.copy()
    circle.putalpha(mask)
    return circle


def generate(circle):
    for name, scale in DENSITIES.items():
        legacy_size = int(48 * scale)
        fg_size = int(108 * scale)

        legacy = Image.new("RGBA", (legacy_size, legacy_size), (255, 255, 255, 255))
        inner = int(legacy_size * 0.94)
        art = circle.resize((inner, inner), Image.LANCZOS)
        off = (legacy_size - inner) // 2
        legacy.paste(art, (off, off), art)
        legacy_rgb = legacy.convert("RGB")

        out_dir = os.path.join(OUT_DIR, f"mipmap-{name}")
        os.makedirs(out_dir, exist_ok=True)
        legacy_rgb.save(os.path.join(out_dir, "ic_launcher.png"))
        legacy_rgb.save(os.path.join(out_dir, "ic_launcher_round.png"))

        fg = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
        inner_fg = int(fg_size * 0.62)
        art_fg = circle.resize((inner_fg, inner_fg), Image.LANCZOS)
        off_fg = (fg_size - inner_fg) // 2
        fg.paste(art_fg, (off_fg, off_fg), art_fg)
        fg.save(os.path.join(out_dir, "ic_launcher_foreground.png"))


if __name__ == "__main__":
    src = find_source_image()
    print("Source image:", src)
    generate(make_circle(src))
    print("Icon variants written to:", OUT_DIR)
