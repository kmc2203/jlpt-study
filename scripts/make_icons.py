"""PWA 아이콘 생성 (Pillow 필요). 이미 icons/ 에 파일이 있으니 디자인을 바꾸고 싶을 때만 실행."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
FONTS = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def font(size):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bg = (36, 87, 214, 255)
    if maskable:  # 전체를 채우고 글자는 안전영역(중앙 80%) 안에
        d.rectangle([0, 0, size, size], fill=bg)
        scale = 0.62
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=bg)
        scale = 0.74
    f1 = font(int(size * 0.46 * scale / 0.74))
    f2 = font(int(size * 0.2 * scale / 0.74))
    d.text((size / 2, size * 0.39), "日", font=f1, fill="white", anchor="mm")
    d.text((size / 2, size * 0.78), "N2", font=f2, fill=(255, 255, 255, 230), anchor="mm")
    return img


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    make(192).save(OUT / "icon-192.png")
    make(512).save(OUT / "icon-512.png")
    make(512, maskable=True).save(OUT / "icon-512-maskable.png")
    print("icons written to", OUT, file=sys.stderr)
