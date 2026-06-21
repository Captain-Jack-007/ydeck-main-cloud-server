For YDeck cloud mode, you need an **Image Asset Pipeline**. Do not let the frontend randomly search/download images. The backend should search, license-check, download, store, optimize, and pass safe image assets to the design agent.

## Best image sources for YDeck

Use these in this order:

| Source                            | Best use                                | Notes                                                                                                                                                                     |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pexels API**                    | MVP stock photos                        | Free for commercial use; attribution not required by license, but their API docs ask apps to show a Pexels link/credit when displaying API results. ([Pexels][1])         |
| **Unsplash API**                  | High-quality lifestyle/startup photos   | Strong quality, but API integrations must credit Unsplash and photographer with links. ([Unsplash Help Center][2])                                                        |
| **Pixabay API**                   | Illustrations, vectors, generic visuals | API supports searching royalty-free images/videos and asks apps to show where assets come from when displaying results. ([Pixabay][3])                                    |
| **Google Custom Search JSON API** | Broad image search later                | Can retrieve image search results in JSON, but license filtering and rights handling are more complex, so don’t use it as your first source. ([Google for Developers][4]) |

My recommendation: start with **Pexels + Pixabay**. Add **Unsplash** if you are ready to handle attribution properly. Avoid broad Google image search in MVP unless you build strong license filtering.

---

# YDeck image architecture

```txt
Slide Content Agent
        ↓
Image Need Detector
        ↓
Image Query Generator
        ↓
Image Search Service
        ↓
License / Source Filter
        ↓
Image Ranker
        ↓
Download + Store Image
        ↓
Image Optimizer
        ↓
Asset Library
        ↓
Design Agent uses assetUrl
        ↓
Slide preview + PPTX export
```

The design agent should not directly call Pexels/Unsplash/Pixabay. It should ask your backend:

```txt
find_image_for_slide(slideNumber, query, style, purpose)
```

Then your backend returns safe, stored image assets.

---

# New backend service: `image-asset-service`

Create a backend service/module:

```txt
image-asset-service
  ├── searchImages()
  ├── rankImages()
  ├── downloadImage()
  ├── optimizeImage()
  ├── storeImage()
  ├── attachImageToDeck()
  ├── getImageAttribution()
  └── validateLicense()
```

Database model:

```ts
ImageAsset {
  id: string;
  workspaceId: string;
  projectId: string;
  deckId: string;
  slideNumber?: number;

  source: "pexels" | "unsplash" | "pixabay" | "user_upload" | "generated";
  sourceImageId: string;
  sourceUrl: string;
  photographerName?: string;
  photographerUrl?: string;
  attributionText?: string;
  licenseType?: string;

  originalUrl: string;
  storedUrl: string;
  thumbnailUrl: string;

  width: number;
  height: number;
  dominantColor?: string;
  orientation: "landscape" | "portrait" | "square";
  tags: string[];

  query: string;
  selectedBy: "agent" | "user" | "fallback";
  createdAt: string;
}
```

---

# Add image tools to the agent system

Add these tools:

## 1. `search_images`

Used by Content Agent / Design Agent.

```json
{
  "name": "search_images",
  "input": {
    "query": "teacher using AI classroom presentation",
    "orientation": "landscape",
    "style": "modern professional",
    "count": 8,
    "sources": ["pexels", "pixabay"]
  }
}
```

Output:

```json
{
  "results": [
    {
      "assetCandidateId": "cand_123",
      "source": "pexels",
      "previewUrl": "...",
      "width": 1920,
      "height": 1080,
      "photographerName": "...",
      "sourceUrl": "...",
      "licenseSummary": "free_to_use"
    }
  ]
}
```

## 2. `select_image`

Used when the agent chooses one.

```json
{
  "name": "select_image",
  "input": {
    "assetCandidateId": "cand_123",
    "projectId": "...",
    "deckId": "...",
    "slideNumber": 4,
    "reason": "Matches classroom AI theme and has wide landscape composition"
  }
}
```

This downloads, stores, optimizes, and attaches the image.

Output:

```json
{
  "imageAsset": {
    "id": "img_123",
    "storedUrl": "https://cdn.ydeck.ai/assets/img_123.webp",
    "thumbnailUrl": "https://cdn.ydeck.ai/assets/img_123_thumb.webp",
    "source": "pexels",
    "attributionText": "Photo by ... on Pexels"
  }
}
```

## 3. `upload_user_image`

For user-uploaded logos/photos.

```json
{
  "name": "upload_user_image",
  "input": {
    "fileId": "...",
    "purpose": "company_logo"
  }
}
```

## 4. `generate_image_prompt`

Later, if you use AI image generation.

```json
{
  "name": "generate_image_prompt",
  "input": {
    "slidePurpose": "show AI agent workflow",
    "style": "clean 3D abstract"
  }
}
```

---

# How the design agent should use images

The slide content should include an image need:

```json
{
  "slideNumber": 3,
  "title": "AI Saves Teachers Hours Every Week",
  "visualIntent": {
    "type": "stock_photo",
    "query": "teacher preparing lesson slides laptop classroom",
    "placement": "right",
    "mood": "professional, warm, modern",
    "avoid": ["children faces close-up", "cartoon", "low quality"]
  }
}
```

Then the Image Asset Service returns:

```json
{
  "image": {
    "assetId": "img_123",
    "storedUrl": "https://cdn.ydeck.ai/assets/img_123.webp",
    "attributionText": "Photo by Jane Doe on Pexels",
    "sourceUrl": "..."
  }
}
```

Then the HTML Designer Agent uses:

```html
<img src="{{asset.storedUrl}}" alt="Teacher preparing AI lesson slides" />
```

Do **not** put external Pexels/Unsplash URLs directly into slide HTML. Download/store them first.

---

# Why you should store images on your server

You should store selected images because:

- export to PPTX/PDF needs stable assets
- external URLs can expire or change
- you need consistent preview/export
- you can resize/compress for performance
- you can keep attribution metadata
- you can avoid hotlinking issues
- you can track which asset was used in which deck

Store originals/private copies in:

```txt
S3 / Cloudflare R2 / MinIO / Aliyun OSS
```

For China/global users, consider:

```txt
Global: Cloudflare R2 / AWS S3
China: Alibaba Cloud OSS / Tencent COS
```

---

# Image optimization

When selected, process images:

```txt
download original
verify MIME type
scan/validate file
resize to slide-safe size
crop smartly if needed
convert to WebP/JPEG for preview
keep export-safe version
store metadata
generate thumbnail
```

Recommended sizes:

```txt
Slide preview image: 1600px wide max
Thumbnail: 400px wide
PPTX export image: 1920px wide max
Hero/background image: 1920x1080 preferred
```

Use:

```txt
sharp
```

for Node.js image resizing/cropping/compression.

---

# Image ranking logic

Do not simply take the first image.

Rank by:

```txt
1. Query relevance
2. Landscape orientation
3. Enough resolution
4. Human-safe / business-safe
5. Good empty space for text
6. No watermark
7. Not too busy
8. Professional color mood
9. License/source confidence
10. Slide layout compatibility
```

For slide backgrounds, prefer images with empty space.

For cards/icon slides, prefer simple illustrations or icons.

For business decks, avoid cheesy stock photos.

---

# Important legal/product rule

For production, save attribution metadata even if attribution is not required.

Store:

```txt
source
source image ID
photographer name
photographer URL
source URL
license summary
download date
API provider
```

Why?

Because if later there is a copyright/licensing question, you can show where the image came from.

Also, for Unsplash API, attribution is required for API integrations, including credit to Unsplash and the photographer with links. ([Unsplash Help Center][2])

---

# Where attribution should appear

For YDeck, you have 3 options:

## Option 1: Hidden metadata only

Best for internal tracking, but may not satisfy every API guideline.

## Option 2: Final “Image Credits” slide

Good for decks using external stock photos.

Example:

```txt
Image Credits
Photo by [Name] on Pexels
Photo by [Name] on Unsplash
Image from Pixabay
```

## Option 3: Small caption near image

Useful for public reports, education, and formal documents.

My recommendation:

```txt
Default: metadata + optional image credits slide
Unsplash: include attribution where required
User setting: "Add image credits slide"
```

---

# API choice for YDeck MVP

Use this order:

## Stage 1

```txt
Pexels API
Pixabay API
User-uploaded images/logos
```

## Stage 2

```txt
Unsplash API with correct attribution
Icon libraries
Generated abstract backgrounds
```

## Stage 3

```txt
Google Custom Search with license filters
Premium stock providers
Enterprise brand asset library
AI-generated images
```

---

# How this fits your multi-agent cloud architecture

Add these agents/services:

```txt
Visual Intent Agent
Image Search Service
Image Ranker
Image Asset Manager
Image Attribution Manager
```

Flow:

```txt
Content Agent
  ↓ creates visualIntent
Image Search Service
  ↓ finds candidate images
Image Ranker
  ↓ chooses best image
Image Asset Manager
  ↓ downloads/stores/optimizes
HTML Designer Agent
  ↓ places stored image in slide
Vision QA Agent
  ↓ checks if image works visually
Repair Agent
  ↓ replaces/crops image if bad
Export Agent
  ↓ embeds image in PPTX/PDF
```

---

# Example production flow

```txt
Slide 5 needs a market opportunity visual
        ↓
Visual Intent Agent creates query:
"AI education technology market classroom teacher laptop"
        ↓
Image Search Service searches Pexels + Pixabay
        ↓
Image Ranker picks 5 candidates
        ↓
Vision/model ranker chooses best one
        ↓
Asset Manager downloads and stores it in YDeck storage
        ↓
Designer Agent places it as right-side image
        ↓
Vision QA checks slide
        ↓
If too busy, Repair Agent adds overlay or replaces image
        ↓
Export Agent embeds final stored image into PPTX
```

---

# Do not do this

Avoid:

```txt
Frontend directly searching Pexels
Frontend inserting external image URL into HTML
LLM choosing random image URLs from the web
Using Google Images without license filtering
Using images without storing source metadata
Using copyrighted images from random websites
Hotlinking images from external sources
Forgetting attribution metadata
```

---

# Final recommendation

For YDeck cloud mode, build this:

```txt
Pexels + Pixabay API
        ↓
Backend Image Search Service
        ↓
License/metadata storage
        ↓
Download to YDeck storage
        ↓
Optimize with sharp
        ↓
Return stored assetUrl to design agent
        ↓
HTML/PPTX uses stored assetUrl
```

This is the safest and most production-ready approach.

The design agent should never “just search Google and paste an image.” It should request a safe image asset from your backend, and your backend should own search, licensing, storage, optimization, and attribution.

[1]: https://www.pexels.com/api/documentation/?utm_source=chatgpt.com 'Pexels API'
[2]: https://help.unsplash.com/en/articles/2511315-guideline-attribution?utm_source=chatgpt.com 'Guideline: Attribution'
[3]: https://pixabay.com/api/docs/?utm_source=chatgpt.com 'Pixabay API Documentation'
[4]: https://developers.google.com/custom-search/v1/overview?utm_source=chatgpt.com 'Custom Search JSON API'
