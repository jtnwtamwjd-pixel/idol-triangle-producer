# 追加アイドル素材

組み込みのImageGenで3枚を個別生成。既存の char02.jpg を画風・照明の参考とし、別の人物として制作しました。

- img/char10.png：熱血、珊瑚色の髪・赤白ジャケット
- img/char11.png：マイペース、ミント色の髪・月のモチーフ
- img/char12.png：クール、紫ボブ・紺銀ジャケット

素材は9人分から12人分に増えました。manifest.js経由で新規候補生に自動割り当てます。保存済みのcharIdは保持し、既存メンバーは変更しません。ゲーム内でのリアルタイム画像生成ではありません。

## 使用プロンプト

```json
[
  {
    "id": "char10",
    "personality": "nekketsu",
    "prompt": "Use case: stylized-concept. Asset type: individual character portrait for Japanese idol management game. Generate a SINGLE adult female idol, age 22, original character. Premium anime game illustration, detailed clean linework, luminous eyes, finely shaded hair, sparkling stage lights and tasteful silver costume details. Vertical portrait 3:4, head and upper torso, entire hair and head visible with generous margin above head, face in upper third, centered so avatar crops work. Backdrop: defocused concert stage, stars, glow sticks and soft bokeh. Elegant stage costume, fully clothed, no text, no logos, no watermark, no collage, no other people. Visual style similar in polish and lighting to the supplied STYLE REFERENCE; invent a completely different identity and costume, do not copy the reference person. Subject: energetic performer with short coral-red hair, amber eyes, confident bright open smile, one fist cheerfully lifted near shoulder. Red and white tailored stage jacket with gold trim over a high-neck white top. Warm red and gold lighting."
  },
  {
    "id": "char11",
    "personality": "mypace",
    "prompt": "Use case: stylized-concept. Asset type: individual character portrait for Japanese idol management game. Generate a SINGLE adult female idol, age 22, original character. Premium anime game illustration, detailed clean linework, luminous eyes, finely shaded hair, sparkling stage lights and tasteful silver costume details. Vertical portrait 3:4, head and upper torso, entire hair and head visible with generous margin above head, face in upper third, centered so avatar crops work. Backdrop: defocused concert stage, stars, glow sticks and soft bokeh. Elegant stage costume, fully clothed, no text, no logos, no watermark, no collage, no other people. Visual style similar in polish and lighting to the supplied STYLE REFERENCE; invent a completely different identity and costume, do not copy the reference person. Subject: relaxed dreamy performer with long mint-green hair in a loose low side ponytail, teal eyes, small gentle sleepy smile. White and lavender stage dress with capelet and silver moon motif, modest neckline. Soft teal and lavender lighting."
  },
  {
    "id": "char12",
    "personality": "cool",
    "prompt": "Use case: stylized-concept. Asset type: individual character portrait for Japanese idol management game. Generate a SINGLE adult female idol, age 22, original character. Premium anime game illustration, detailed clean linework, luminous eyes, finely shaded hair, sparkling stage lights and tasteful silver costume details. Vertical portrait 3:4, head and upper torso, entire hair and head visible with generous margin above head, face in upper third, centered so avatar crops work. Backdrop: defocused concert stage, stars, glow sticks and soft bokeh. Elegant stage costume, fully clothed, no text, no logos, no watermark, no collage, no other people. Visual style similar in polish and lighting to the supplied STYLE REFERENCE; invent a completely different identity and costume, do not copy the reference person. Subject: composed sophisticated performer with a sharp short plum-purple bob, icy violet eyes, quiet confident subtle smile. Navy and silver high-collar military-inspired idol stage jacket with small crystalline brooch. Cool purple and blue lighting."
  }
]
```
