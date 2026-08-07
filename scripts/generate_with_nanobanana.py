# -*- coding: utf-8 -*-
"""
Nano Banana / Gemini Image Generation Script for 15 Escape Room Scenes & Haram Avatar
Usage: python scripts/generate_with_nanobanana.py YOUR_API_KEY
"""
import sys
import os
import json
import base64
import requests

ASSETS_DIR = r"c:\Users\USER\Desktop\은성\프로그램\자립정책\assets\game"
os.makedirs(ASSETS_DIR, exist_ok=True)

PROMPTS = {
    "haram_avatar": "Clean 2D anime game character sprite of an 18-year-old Korean youth named Haram, casual modern jacket and hoodie, friendly warm expression, full body standing front view, game character art, transparent background",
    "room_1": "Modern anime digital illustration of a cozy Korean studio apartment bedroom at dawn, packed luggage bags near wooden desk, soft morning light streaming through window, clean webtoon background art, no people",
    "room_2": "Modern anime digital illustration of a warm Korean group home living room, wooden table with tea cups, wall calendar with extension dates marked, cozy atmosphere, no people",
    "room_3": "Modern anime digital illustration of a Korean youth independence education classroom, lecture chalkboard with financial planning notes, clean desks, bright daytime light, no people",
    "room_4": "Modern anime digital illustration of a Korean public community service center (주민센터) counter, official desk with settlement grant (자립정착금 2000만원) document, clean office background, no people",
    "room_5": "Modern anime digital illustration of a Korean welfare center service desk (주민센터 복지창구), monthly allowance application document and public transit card on desk, bright welcoming atmosphere, no people",
    "room_6": "Modern anime digital illustration of a Korean bank consultation counter, matching fund piggy bank and savings passbook on desk, clean financial center background, no people",
    "room_7": "Modern anime digital illustration of a sunny studio apartment interior on moving day, wooden floor, lease contract document (100만원 보증금) on small table, golden sunlight through window, no people",
    "room_8": "Modern anime digital illustration of a studio apartment kitchen table with delicious home-cooked Korean side dish containers (반찬통) and a warm sticky note from group home director, no people",
    "room_9": "Modern anime digital illustration of a cozy 1-on-1 counseling room, comfortable armchair sofa, warm table lamp, peaceful supportive atmosphere, no people",
    "room_10": "Modern anime digital illustration of a tech academy IT classroom, rows of open laptops on desks, digital screen on wall, modern educational space, no people",
    "room_11": "Modern anime digital illustration of a clean clinic reception counter and pharmacy desk, first aid box with red cross emblem, medical guidance papers, no people",
    "room_12": "Modern anime digital illustration of a youth support agency lobby, Korea regional support map poster on wall, comfortable seating lounge, no people",
    "room_13": "Modern anime digital illustration of a cozy night study desk, calculator and budget notebook calculating 50 million KRW support, warm lamp light, no people",
    "room_14": "Modern anime digital illustration of a scenic outdoor walking path and bridge leading to a new city neighborhood at golden hour sunset, beautiful landscape, no people",
    "room_15": "Modern anime digital illustration of a joyful housewarming party setting in a sunny apartment living room, colorful balloons, gift boxes on table, bright celebratory atmosphere, no people"
}

def generate_image(api_key, name, prompt):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1" if name == "haram_avatar" else "16:9"
        }
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        if response.status_code == 200:
            data = response.json()
            predictions = data.get("predictions", [])
            if predictions and "bytesBase64Encoded" in predictions[0]:
                img_data = base64.b64decode(predictions[0]["bytesBase64Encoded"])
                out_path = os.path.join(ASSETS_DIR, f"{name}.png")
                with open(out_path, "wb") as f:
                    f.write(img_data)
                print(f"[SUCCESS] Saved {out_path}")
                return True
        print(f"[ERROR {response.status_code}] {response.text}")
    except Exception as e:
        print(f"[EXCEPTION] {e}")
    return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_with_nanobanana.py YOUR_API_KEY")
        sys.exit(1)

    api_key = sys.argv[1]
    print(f"Starting Nano Banana image generation for {len(PROMPTS)} assets...")

    for name, prompt in PROMPTS.items():
        print(f"Generating {name}...")
        generate_image(api_key, name, prompt)

if __name__ == "__main__":
    main()
