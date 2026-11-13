#!/usr/bin/env python3
"""Compose the 3:4 promo card. Usage: make-promo.py <screenshot> <out.png>"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1500, 2000
INK, MUTED, LINE, ACCENT = (16, 20, 24), (91, 100, 112), (230, 232, 236), (44, 107, 237)
CJK = '/System/Library/Fonts/STHeiti Medium.ttc'
MONO = '/System/Library/Fonts/Menlo.ttc'


def font(size, mono=False):
    if mono:
        return ImageFont.truetype(MONO, size, index=0)
    return ImageFont.truetype(CJK, size, index=1)


shot_path = sys.argv[1]
out_path = sys.argv[2]

img = Image.new('RGB', (W, H), (255, 255, 255))
d = ImageDraw.Draw(img)


def center(text, f, y, fill):
    width = d.textlength(text, font=f)
    d.text(((W - width) / 2, y), text, font=f, fill=fill)


center('DEEPSEEK HARNESS  ·  笔记插件', font(31), 96, MUTED)
center('笔记', font(96), 158, INK)
center('Obsidian 里的笔记，想在 DSH 里直接读、直接改。', font(37), 292, MUTED)

# Screenshot: scale to 900 wide, rounded corners, soft shadow.
shot = Image.open(shot_path).convert('RGB')
# Keep the top band (title, formulas, diagram, caption) and drop the rest.
sw, sh = shot.size
shot = shot.crop((0, 0, sw, int(sh * 0.67)))
tw = 1240
th = int(shot.height * tw / shot.width)
shot = shot.resize((tw, th), Image.LANCZOS)
mask = Image.new('L', (tw, th), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, tw - 1, th - 1], radius=22, fill=255)
x0, y0 = (W - tw) // 2, 372

shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle(
    [x0 - 4, y0 + 12, x0 + tw + 4, y0 + th + 20], radius=28, fill=(15, 23, 42, 36))
shadow = shadow.filter(ImageFilter.GaussianBlur(22))
img = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')
d = ImageDraw.Draw(img)
img.paste(shot, (x0, y0), mask)
d.rounded_rectangle([x0, y0, x0 + tw - 1, y0 + th - 1], radius=22, outline=LINE, width=2)

# 2x2 selling points.
points = [
    ('格式对齐', '链接、嵌入、标注、高亮'),
    ('Bases 视图', '表格、卡片、列表、看板'),
    ('就地编辑', 'CodeMirror，Cmd+S 保存'),
    ('实时跟随', 'Obsidian 改完自动更新'),
]
grid_top = y0 + th + 70
col_x = [110, 750]
row_h = 146
for index, (title, note) in enumerate(points):
    px = col_x[index % 2]
    py = grid_top + (index // 2) * row_h
    d.rounded_rectangle([px, py - 6, px + 52, py + 46], radius=12,
                        fill=(238, 242, 252))
    d.ellipse([px + 18, py + 10, px + 34, py + 26], fill=ACCENT)
    d.text((px + 72, py - 2), title, font=font(46), fill=INK)
    d.text((px + 72, py + 60), note, font=font(33), fill=MUTED)

# Install card.
card_top = grid_top + 2 * row_h + 18
d.rounded_rectangle([86, card_top, W - 86, card_top + 176], radius=20,
                    outline=LINE, width=2, fill=(250, 251, 253))
d.text((126, card_top + 26), '安装', font=font(30), fill=MUTED)
d.text((126, card_top + 74), 'dsh plugin --profile desktop add dsh-notta',
       font=font(31, mono=True), fill=INK)
d.text((126, card_top + 124), '装完在左侧栏「自动化任务」下面打开「笔记」', font=font(30), fill=MUTED)

center('github.com/jqlong17/dsh-notta  ·  MIT', font(30), H - 96, MUTED)

img.save(out_path)
print(out_path, img.size)
