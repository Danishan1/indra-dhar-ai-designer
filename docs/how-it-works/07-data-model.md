# 7. Key data structures

Simplified shapes with real field names. Lengths are always **millimetres**; coordinates are in the
piece's own space (x right, y down).

## Pattern spec — the recipe (`garment-model/src/schema/pattern-spec.ts`)

```jsonc
{
  "family": "top", // dress | top | skirt | trousers | jumpsuit | jacket | dungarees
  "audience": "boys", // women | men | girls | boys
  "size": "8y", // entry of that audience's size chart
  "body": { "bust": 680 }, // only the measurements you changed; the rest comes from the chart
  "ease": { "bust": null, "waist": null, "hip": null }, // null = from the fit
  "seamAllowanceMm": 10,
  "hemAllowanceMm": 30,
  "style": {
    // the first garment (key "main")
    "topType": "shirt",
    "fit": "regular",
    "collar": "shirt",
    "closure": "front_buttons",
    "placket": "separate",
    "buttons": 6,
    "sleeve": "short",
    "cuff": "none",
    "hemShape": "straight",
    "yoke": true,
    "pockets": "none",
    "darts": false,
    // …all other options keep their defaults
  },
  "garments": [
    // other garments of a co-ord set (same body)
    {
      "key": "shorts",
      "family": "trousers",
      "style": {
        "length": "above_knee",
        "leg": "straight",
        "waistband": true,
        "waistbandType": "fitted",
        "beltLoops": 6,
        "closure": "fly_zip",
        "pockets": "slant",
        "backPockets": "patch",
        "backPocketCount": 2,
        "pleats": "none",
        "turnUps": false,
      },
    },
  ],
}
```

All style options with their values: `fit`, `topType`, `jacketType`, `neckline`, `neckDepthMm`,
`neckWidthMm`, `collar`, `hood`, `sleeve`, `sleeveStyle`, `sleeveLengthMm`, `cuff`, `closure`,
`placket`, `buttons`, `hemShape`, `yoke`, `backPleat`, `darts`, `pockets`, `pocketCount`,
`waistSeam`, `skirt`, `tiers`, `length`, `lengthMm`, `leg`, `waistband`, `waistbandType`,
`beltLoops`, `backPockets`, `backPocketCount`, `cargoPockets`, `pleats`, `turnUps`, `lining`,
`ribbing`, `peplum`, `wrap`, `ruffles`, `gatherRatio`.

## Pattern piece (`garment-model/src/schema/pattern.ts`)

```jsonc
{
  "pieceId": "pat_…", "componentId": "cmp_…", "name": "Front leg",
  "outline": [{ "x": 0, "y": 0 }, …],              // the SEAM line, closed
  "edges": [                                         // named seams as index ranges on the outline
    { "name": "waist", "from": 0, "to": 5, "intakeMm": 18 },   // intake = darts/pleats sewn into it
    { "name": "crotch", "from": 5, "to": 21, "intakeMm": 0 }, …
  ],
  "path": [{ "x": 0, "y": 0, "in": null, "out": {…}, "smooth": false, "seg": "waist" }, …], // editable Bézier
  "seamAllowanceMm": 10,
  "allowances": { "hem": 30 },                       // per-edge overrides; fold edges always 0
  "grainline": { "from": {…}, "to": {…} },
  "foldLine": null,                                  // set → cut on the fold
  "notches": [{…}],
  "markings": [{ "kind": "zip", "points": [...], "label": "fly zip" }],  // dart, button, buttonhole, placement, gather, zip, pleat, line, fold
  "cutQuantity": 2, "mirrored": true, "fabricRole": "main",              // main, lining, interfacing, rib
  "source": "generated",                             // generated | user (edited by hand)
  "status": "provisional",
  "draft": { "method": "parametric", "template": "shorts.trouser_front", "inputs": {…} },
  "canvas": { "x": 120, "y": 900 },                  // where it sits in the editor (layout only)
  "notes": ["…"]
}
```

## Components — the parts tree

```
garment_body  "Shirt + Shorts set"
├── set_garment "Shirt"        part:g.main
│   ├── front_body_panel "Front"         part:front        → piece Front ×2
│   ├── back_body_panel  "Back"          part:back         → piece Back (fold)
│   ├── yoke             "Yoke"          part:yoke         → piece Back yoke ×2
│   ├── sleeve           "Sleeves"       part:sleeves      → piece Sleeve ×2
│   ├── collar           "Collar"        part:collar       → piece Collar ×2
│   │   └── collar_stand "Collar stand"  part:collar_stand → piece Collar stand ×2
│   └── placket          "Button placket"
└── set_garment "Shorts"       part:g.shorts
    ├── leg_panel  "Legs"          part:shorts.legs        → Front leg ×2, Back leg ×2
    ├── facing     "Fly"           part:shorts.fly         → Fly facing, Fly shield
    ├── pocket     "Slant pockets" part:shorts.pocket_bags → Side front ×2, Pocket bag ×2
    ├── pocket     "Back pockets"  part:shorts.back_pockets
    └── waistband  "Waistband"     part:shorts.waistband   → Waistband
        └── belt_loop "Belt loops" part:shorts.belt_loops  → Belt loop strip
```

The `part:` tag is how a redraft recognises a component and keeps its id.

## Design, working copy, revision

| Record           | What it holds                                                                          |
| ---------------- | -------------------------------------------------------------------------------------- |
| **Design**       | name, display id (DSN-000001), project, head revision, approved revision               |
| **Working copy** | the current design state + a version number (one writer at a time)                     |
| **Operation**    | one recorded change (type, payload, inverse for undo, label, who, when)                |
| **Revision**     | immutable snapshot of the state, revision number (R001…), canonical-JSON hash, summary |

## Analysis result (Component 1 output)

```jsonc
{
  "mode": "sketch",
  "classification": { "gender": "male", "ageGroup": "child", "ageYears": 8, "sections": ["upper","lower"],
                      "garments": [{ "type": "shirt", "section": "upper", … }, { "type": "shorts", … }], … },
  "garments": [{ "key": "main", "type": "shirt", "family": "top", … }, { "key": "shorts", … }],
  "spec": { …pattern spec… },
  "fromSketch": { "main": ["collar", "sleeve", …], "shorts": ["beltLoops", …] },
  "unsure":     { "main": ["yoke"], "shorts": ["backPockets", "pockets"] },
  "reading": { "label": "Boys' shirt and shorts set", "description": "…", "details": [], "uncertain": ["Back view not shown"] },
  "notes": ["…"], "provider": "gemini", "models": { … }
}
```

## Tech pack document (Component 3 output)

`header`, `description`, `references`, `views`, `pattern` (spec section: garments, style, body,
finished, checks), `bom`, `measurements`, `patterns` (sheet, pieces with drawings and allowance notes,
markers), `construction` (steps, stitching, finishing), `quality`, `care`, `missing`, `processing`.
