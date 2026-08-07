# -*- coding: utf-8 -*-
"""
Generate 15 High-Resolution Pokemon Game Boy Color Style PNG Room Assets & Haram Avatar
"""
import os
from PIL import Image, ImageDraw, ImageFont

ASSETS_DIR = r"c:\Users\USER\Desktop\은성\프로그램\자립정책\assets\game"
os.makedirs(ASSETS_DIR, exist_ok=True)

WIDTH, HEIGHT = 640, 576

# Palette
COLOR_GROUND_LIGHT = (255, 241, 242)
COLOR_GROUND_DARK = (255, 228, 230)
COLOR_DOT = (251, 113, 133)

COLOR_WOOD_LIGHT = (254, 240, 138)
COLOR_WOOD_DARK = (253, 230, 138)
COLOR_WOOD_BORDER = (217, 119, 6)

COLOR_TILE_LIGHT = (226, 232, 240)
COLOR_TILE_DARK = (203, 213, 225)
COLOR_TILE_BORDER = (148, 163, 184)

COLOR_WALL = (51, 65, 85)
COLOR_WALL_DARK = (15, 23, 42)

COLOR_BLUE_TREE_DARK = (30, 64, 175)
COLOR_BLUE_TREE_MID = (59, 130, 246)
COLOR_BLUE_TREE_LIGHT = (147, 197, 253)

def draw_gbc_ground(draw, theme='indoor'):
    tile_size = 32
    cols = WIDTH // tile_size
    rows = HEIGHT // tile_size

    for r in range(rows):
        for c in range(cols):
            x0 = c * tile_size
            y0 = r * tile_size
            x1 = x0 + tile_size
            y1 = y0 + tile_size
            alt = (c + r) % 2 == 0

            if theme == 'outdoor':
                bg = COLOR_GROUND_LIGHT if alt else COLOR_GROUND_DARK
                draw.rectangle([x0, y0, x1, y1], fill=bg)
                draw.rectangle([x0 + 8, y0 + 8, x0 + 12, y0 + 12], fill=COLOR_DOT)
            elif theme == 'office':
                bg = COLOR_TILE_LIGHT if alt else COLOR_TILE_DARK
                draw.rectangle([x0, y0, x1, y1], fill=bg, outline=COLOR_TILE_BORDER)
            else:
                bg = COLOR_WOOD_LIGHT if alt else COLOR_WOOD_DARK
                draw.rectangle([x0, y0, x1, y1], fill=bg)
                draw.line([x0, y1 - 2, x1, y1 - 2], fill=COLOR_WOOD_BORDER, width=2)

def draw_wall_header(draw, title_text, kicker_text, wall_color=(51, 65, 85)):
    # Wall top
    draw.rectangle([0, 0, WIDTH, 130], fill=wall_color)
    draw.rectangle([0, 122, WIDTH, 130], fill=COLOR_WALL_DARK)

    # Title Plate
    draw.rectangle([30, 20, 480, 65], fill=(250, 204, 21), outline=(113, 63, 18), width=3)
    # Text placeholder
    draw.rectangle([40, 75, 400, 110], fill=(15, 23, 42))

def draw_blue_tree(draw, x, y):
    # Shadow
    draw.ellipse([x - 2, y + 20, x + 58, y + 45], fill=(15, 23, 42, 100))
    # Dark base
    draw.ellipse([x, y, x + 56, y + 56], fill=COLOR_BLUE_TREE_DARK)
    # Mid highlights
    draw.ellipse([x + 6, y + 6, x + 46, y + 46], fill=COLOR_BLUE_TREE_MID)
    # Light highlight
    draw.rectangle([x + 12, y + 12, x + 20, y + 20], fill=COLOR_BLUE_TREE_LIGHT)

def draw_prop_desk(draw, x, y, label=""):
    draw.rectangle([x, y, x + 120, y + 60], fill=(180, 83, 9), outline=(120, 53, 15), width=3)
    draw.rectangle([x + 10, y + 10, x + 110, y + 50], fill=(245, 158, 11))

def create_room_image(room_num, kicker, title, theme='indoor', wall_color=(51, 65, 85)):
    img = Image.new('RGB', (WIDTH, HEIGHT), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # 1. Ground
    draw_gbc_ground(draw, theme)

    # 2. Wall
    draw_wall_header(draw, title, kicker, wall_color)

    # 3. Trees or Specific Props
    if theme == 'outdoor':
        # Left Cliff
        draw.rectangle([0, 200, 90, HEIGHT], fill=(153, 27, 27))
        draw.rectangle([0, 195, 85, 205], fill=(248, 113, 113))

        # Blue Trees
        for tx in [0, 60, 120, 460, 520, 580]:
            draw_blue_tree(draw, tx, 10)
        for ty in [100, 160, 220, 280, 340, 400]:
            draw_blue_tree(draw, 570, ty)
    else:
        # Counter / Desk
        draw_prop_desk(draw, 140, 220)

    # Door Frame
    draw.rectangle([540, 200, 610, 310], fill=(16, 185, 129), outline=(6, 95, 70), width=4)
    draw.ellipse([550, 250, 562, 262], fill=(250, 204, 21))

    save_path = os.path.join(ASSETS_DIR, f"room_{room_num}.png")
    img.save(save_path)
    print(f"Saved {save_path}")

def create_haram_avatar():
    img = Image.new('RGBA', (64, 64), color=(0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Body
    draw.rectangle([18, 26, 46, 52], fill=(37, 99, 235))
    # Pants
    draw.rectangle([22, 50, 42, 60], fill=(30, 58, 138))
    # Head
    draw.rectangle([20, 12, 44, 30], fill=(254, 215, 170))
    # Red Cap
    draw.rectangle([16, 4, 48, 18], fill=(220, 38, 38))
    draw.rectangle([30, 18, 50, 22], fill=(220, 38, 38))
    # Eyes
    draw.rectangle([26, 20, 30, 24], fill=(17, 24, 39))
    draw.rectangle([36, 20, 40, 24], fill=(17, 24, 39))

    save_path = os.path.join(ASSETS_DIR, "haram_avatar.png")
    img.save(save_path)
    print(f"Saved {save_path}")

def main():
    themes = {
        1: ('indoor', (71, 85, 105)),
        2: ('indoor', (51, 65, 85)),
        3: ('office', (30, 41, 59)),
        4: ('office', (15, 23, 42)),  # 주민센터 정착금 창구
        5: ('office', (15, 23, 42)),  # 주민센터 수당 창구
        6: ('office', (30, 27, 75)),
        7: ('indoor', (51, 65, 85)),
        8: ('indoor', (22, 78, 99)),
        9: ('indoor', (112, 26, 117)),
        10: ('office', (6, 95, 70)),
        11: ('office', (3, 105, 161)),
        12: ('office', (21, 128, 61)),
        13: ('indoor', (51, 65, 85)),
        14: ('outdoor', (15, 23, 42)),
        15: ('indoor', (190, 18, 60))
    }

    for num in range(1, 16):
        t_type, color = themes.get(num, ('indoor', (51, 65, 85)))
        create_room_image(num, f"ROOM {num}", f"Chapter {num}", theme=t_type, wall_color=color)

    create_haram_avatar()

if __name__ == '__main__':
    main()
