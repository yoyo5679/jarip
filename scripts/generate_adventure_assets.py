# -*- coding: utf-8 -*-
"""
자립 모험 모드(횡스크롤) 이미지 에셋 생성기 — Gemini 이미지 모델 사용
Usage:
  python scripts/generate_adventure_assets.py            # 없는 파일만 생성
  python scripts/generate_adventure_assets.py --force    # 전부 다시 생성
  python scripts/generate_adventure_assets.py char_a bg_town   # 특정 에셋만
API 키는 .env 의 GEMINI_API_KEY 에서 읽는다.

※ 저작권: 특정 게임(메이플스토리 등)의 캐릭터·몬스터·UI를 복제하지 않는다.
   "귀여운 2D 횡스크롤 MMO 느낌"이라는 일반적인 장르 스타일만 참고한 오리지널 디자인이다.
"""
import sys
import os
import io
import time
import base64
import requests
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "adventure")
RAW_DIR = os.path.join(OUT_DIR, "_raw")
os.makedirs(RAW_DIR, exist_ok=True)

MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image", "gemini-3-pro-image"]

SPRITE_STYLE = (
    "Original character design for a cute 2D side-scrolling fantasy MMO game, "
    "super-deformed chibi proportions (big head, small body, about 2.5 heads tall), "
    "clean thick dark outlines, soft cel shading, bright pastel colors, "
    "full body, facing right in a 3/4 side view, standing idle pose, centered, "
    "on a perfectly flat solid pure green (#00FF00) background with no shadow, no floor, no text, no border. "
    "Do not use any green color on the character itself. "
    "Must be an original design, not resembling any existing game character."
)
MONSTER_STYLE = (
    "Original cute monster for a 2D side-scrolling fantasy MMO game, round simple body, big expressive eyes, "
    "clean thick dark outlines, soft cel shading, pastel colors, full body, facing left, centered, "
    "on a perfectly flat solid pure green (#00FF00) background with no shadow, no floor, no text. "
    "Do not use any green color on the monster itself. Original design, not from any existing game."
)
BG_STYLE = (
    "Wide panoramic background art for a cute 2D side-scrolling fantasy MMO game, "
    "hand-painted storybook style, soft pastel colors, layered depth, bright and cheerful, "
    "the bottom quarter of the image is plain soft ground color (the game draws its own platforms there), "
    "no characters, no people, no text, no UI, no logos."
)

SPRITES = {
    # 플레이어 선택 캐릭터 4명
    "char_a": "an 18-year-old Korean boy with fluffy brown hair, oversized navy hoodie, beige cargo pants, white sneakers, small backpack, cheerful smile",
    "char_b": "an 18-year-old Korean girl with long black ponytail, cream knit cardigan over orange t-shirt, denim skirt with leggings, red sneakers, bright determined smile",
    "char_c": "an 18-year-old Korean boy with short black hair and round glasses, sky-blue baseball cap, white shirt with yellow vest, dark jeans, holding a small notebook, calm gentle smile",
    "char_d": "an 18-year-old Korean girl with short wavy pink-brown bob hair and a star hairpin, purple overalls over a white shirt, yellow rain boots, playful wink",
    # NPC
    "npc_clerk": "a friendly Korean community service center clerk woman in her 30s, neat bun hair, light blue office blouse with a name badge, holding a document folder, facing left",
    "npc_banker": "a kind Korean bank teller man in his 40s, neat side-parted hair, navy vest and tie, holding a small piggy bank, facing left",
    "npc_house": "a warm Korean housing consultant woman in her 50s, short curly hair, orange cardigan, holding a house key with a tag, facing left",
    "npc_mentor": "a cool Korean youth mentor in his mid 20s, messy dark hair, denim jacket with a small pinwheel pin, thumbs-up pose, facing left",
    "npc_counselor": "a gentle Korean counselor woman in her 30s, long wavy brown hair, soft lavender sweater, holding a warm mug, facing left",
    "npc_director": "a kind elderly Korean group home director woman, gray short hair, pink apron over a sweater, waving hand, facing left",
    # 몬스터 (걱정·빚·외로움을 상징하는 오리지널 몬스터)
    "mob_worry": "a small gray storm-cloud creature with a worried face, tiny raindrops falling, little stubby arms",
    "mob_debt": "a grumpy walking bronze coin creature with angry eyebrows and a tiny bill-paper cape, short legs",
    "mob_lonely": "a shy dark indigo shadow blob creature with glowing sad eyes and wispy edges, droopy",
    "mob_boss": "a big chubby purple 'Anxiety' blob monster wearing a crooked crown made of receipts, many small worried eyes, but still cute and not scary",
}

BACKGROUNDS = {
    "bg_home": "a cozy hilltop village with a warm red-roof group home house, flower gardens, laundry lines, cherry trees, morning sky with fluffy clouds",
    "bg_town": "a lively Korean-style small town street with a community service center building, bakery, bus stop, streetlamps, afternoon sky",
    "bg_bank": "a bright plaza with a round-roofed friendly bank building with coin decorations, fountain, trees, clear blue sky",
    "bg_house": "a peaceful residential neighborhood with small apartment buildings and one cute new studio apartment with a welcome banner, sunset sky",
    "bg_forest": "a calm healing forest with glowing fireflies, giant soft trees, a small wooden counseling cabin with warm lights, twilight sky",
    "bg_title": "a grand panoramic view of a cheerful fantasy town at sunrise seen from a hill, winding road leading to the town, floating islands in the sky, hopeful mood",
}


def load_key():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_API_KEY 가 .env 에 없어요")


def call_gemini(key, prompt, aspect):
    for model in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}},
        }
        for attempt in range(3):
            try:
                res = requests.post(url, json=payload, timeout=120, headers={"x-goog-api-key": key})
                if res.status_code == 200:
                    for cand in res.json().get("candidates", []):
                        for part in cand.get("content", {}).get("parts", []):
                            data = part.get("inlineData", {}).get("data")
                            if data:
                                return base64.b64decode(data), model
                    print(f"  [{model}] 이미지 없음, 재시도")
                elif res.status_code in (429, 500, 503):
                    time.sleep(4 * (attempt + 1))
                else:
                    print(f"  [{model} {res.status_code}] {res.text[:160]}")
                    break
            except Exception as e:
                print(f"  [{model}] {e}")
                time.sleep(3)
    return None, None


def chroma_key(img):
    """초록 배경 제거 + 초록 번짐(despill) 정리 + 여백 자르기."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dom = g - max(r, b)
            if dom > 70 and g > 120:
                px[x, y] = (0, 0, 0, 0)
            elif dom > 25:
                # 가장자리: 반투명 + 초록기 제거
                alpha = int(255 * max(0.0, min(1.0, (70 - dom) / 45)))
                px[x, y] = (r, max(r, b), b, min(a, alpha))
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def build(key, name, force):
    is_bg = name in BACKGROUNDS
    out = os.path.join(OUT_DIR, f"{name}.jpg" if is_bg else f"{name}.png")
    if os.path.exists(out) and not force:
        print(f"[skip] {name}")
        return True
    if is_bg:
        prompt, aspect = f"{BG_STYLE} Scene: {BACKGROUNDS[name]}", "16:9"
    else:
        style = MONSTER_STYLE if name.startswith("mob_") else SPRITE_STYLE
        prompt, aspect = f"{style} Subject: {SPRITES[name]}", "1:1"

    raw, model = call_gemini(key, prompt, aspect)
    if not raw:
        print(f"[FAIL] {name}")
        return False
    with open(os.path.join(RAW_DIR, f"{name}.png"), "wb") as f:
        f.write(raw)

    img = Image.open(io.BytesIO(raw))
    if is_bg:
        img = img.convert("RGB")
        img.thumbnail((1600, 900), Image.LANCZOS)
        img.save(out, "JPEG", quality=84, optimize=True)
    else:
        img = chroma_key(img)
        target_h = 300 if name == "mob_boss" else 200
        ratio = target_h / img.height
        img = img.resize((max(1, int(img.width * ratio)), target_h), Image.LANCZOS)
        img.save(out, "PNG", optimize=True)
    print(f"[OK] {name} ({model})")
    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    names = args or list(SPRITES) + list(BACKGROUNDS)
    key = load_key()
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda n: build(key, n, force or bool(args)), names))
    failed = [n for n, ok in zip(names, results) if not ok]
    print(f"\n완료: {len(names) - len(failed)}/{len(names)}" + (f"  실패: {failed}" if failed else ""))


if __name__ == "__main__":
    main()
