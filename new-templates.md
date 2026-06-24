**Each template should have 25 layout options, but the agent should only use the ones that fit the user’s deck type.**

So the template is not a fixed 25-slide deck. It is a **25-layout design system**.

For example, a “Teaching + Games” template may include:

```txt
1. Lesson title
2. Learning objectives
3. Warm-up question
4. Vocabulary cards
5. Concept explanation
6. Example slide
7. Matching game
8. Fill-in-the-blank
9. Picture guessing game
10. Team activity
11. Reading passage
12. Comprehension questions
13. Role-play task
14. Mini quiz
15. Group competition
16. Teacher instruction slide
17. Student worksheet slide
18. Answer reveal
19. Reflection
20. Homework
21. Progress check
22. Rewards slide
23. Summary
24. Next lesson preview
25. Closing slide
```

But a “Country Overview” template should have different layouts:

```txt
1. Country title
2. Executive snapshot
3. Map/location
4. Key facts
5. Population profile
6. Economy overview
7. GDP/industry statistics
8. Trade overview
9. Political system
10. Education system
11. Culture/lifestyle
12. Cities overview
13. Tourism highlights
14. Infrastructure
15. Investment climate
16. Opportunities
17. Risks/challenges
18. Market entry strategy
19. Comparison with other countries
20. Timeline/history
21. Case study
22. SWOT analysis
23. Recommendations
24. Sources/evidence
25. Closing decision
```

That means each template should be built around a **specific use case**, not a generic universal deck.

## Recommended new YDeck template categories

I would add these next:

| Template                       | Best for                                                     | Priority            |
| ------------------------------ | ------------------------------------------------------------ | ------------------- |
| **Report / Business Report**   | monthly report, research report, company report              | Very high           |
| **Teaching + Exercises**       | teachers, students, training, classroom slides               | Very high           |
| **Teaching + Games**           | kids, language learning, interactive lessons                 | Very high           |
| **Country Overview**           | country research, market entry, study abroad, investment     | High                |
| **Project Overview**           | startup project, internal project, construction/project plan | High                |
| **Investment Analysis**        | market, company, startup, real estate, fund analysis         | Very high           |
| **Company Profile**            | corporate intro, services, achievements, team                | High                |
| **Government / Policy Brief**  | public sector, policy, development programs                  | Medium-high         |
| **Event / Expo Presentation**  | pavilion, product demo, conference intro                     | High                |
| **Book / Chapter Lesson Deck** | upload book → create lesson from pages/chapters              | Very high for YDeck |

For YDeck, the most commercially useful ones are probably:

```txt
1. Teaching + Exercises
2. Teaching + Games
3. Report / Business Report
4. Country Overview
5. Investment Analysis
6. Project Overview
7. Book / Chapter Lesson Deck
```

These match real user behavior.

## Important design rule

Do **not** make templates only by visual style.

For example, this is weak:

```txt
Blue modern template
Dark business template
Creative pink template
Minimal white template
```

Better:

```txt
Investment Analysis Template
Teaching Games Template
Country Overview Template
Project Overview Template
Report Template
```

Because users don’t usually think: “I need a blue template.”
They think: “I need to make a report / lesson / investor analysis / country presentation.”

You can still let each template have a visual style, but the main identity should be the **deck scenario**.

## Recommended template structure

Each template should have:

```txt
25 layout options
3 recommended deck flows
1 static preview deck
chart rules
icon rules
image rules
QA checklist
best-fit deck types
```

Example:

```json
{
  "slug": "ydeck-library-investment-analysis",
  "name": "Investment Analysis",
  "category": "ydeck-library",
  "scenario": "investment-analysis",
  "mode": "deck",
  "layoutCount": 25,
  "recommendedFlows": [
    "startup_investment_analysis",
    "country_investment_analysis",
    "real_estate_investment_analysis"
  ]
}
```

## The key idea: layout options + deck flows

A template can have 25 layouts, but you also need **deck flows**.

Example for **Investment Analysis**:

### Flow 1: Startup investment analysis

```txt
1. Investment thesis
2. Company snapshot
3. Problem
4. Solution
5. Market size
6. Product
7. Business model
8. Traction
9. Unit economics
10. Competition
11. Team/founder
12. Financial forecast
13. Risks
14. Recommendation
15. Decision slide
```

### Flow 2: Country investment analysis

```txt
1. Investment thesis
2. Country snapshot
3. Macro indicators
4. Industry opportunity
5. Regulations
6. Infrastructure
7. Labor/talent
8. Market risks
9. Comparable countries
10. Entry strategy
11. Investment options
12. ROI logic
13. Risk mitigation
14. Recommendation
15. Next steps
```

Same template. Different flow.

That is much better than forcing every generated deck to use all 25 slides.

## Suggested universal layout taxonomy

You can create a shared master vocabulary across all templates:

```txt
title
agenda
executive_summary
context_overview
problem
solution
market_statistics
audience_insight
map_overview
comparison_matrix
timeline
roadmap
operating_model
process_flow
team
founder_profile
traction
financial_logic
risk_analysis
swot
case_study
exercise
quiz
game_activity
closing_decision
```

Then each template selects which of these it supports.

For example:

**Teaching + Games** supports:

```txt
title
agenda
learning_objectives
vocabulary
exercise
quiz
game_activity
role_play
answer_reveal
homework
closing
```

**Investment Analysis** supports:

```txt
title
executive_summary
market_statistics
financial_logic
traction
team
risk_analysis
swot
comparison_matrix
closing_decision
```

This gives the agent a stable language.

## My recommended implementation

For each new template, create 25 layouts, but divide them into groups:

```txt
A. Opening slides
B. Explanation / context slides
C. Data / evidence slides
D. Interactive / activity slides
E. People / team slides
F. Strategy / roadmap slides
G. Closing / decision slides
```

Example for **Project Overview**:

```txt
Opening:
1. Project title
2. One-page project summary
3. Agenda

Context:
4. Background
5. Problem
6. Goals
7. Stakeholders

Execution:
8. Scope
9. Workstreams
10. Timeline
11. Roadmap
12. Operating model
13. Team responsibilities

Evidence:
14. Current progress
15. Metrics dashboard
16. Budget overview
17. Risk register
18. Dependencies

Decision:
19. Options comparison
20. Recommendation
21. Next steps
22. Approval request

Extra:
23. Case study
24. Appendix data
25. Closing slide
```

This is professional and flexible.

## My advice on slide count

For `ydeck-library`, I would upgrade the standard from **15 layouts** to **25 layouts**, but not immediately for all templates.

Do it like this:

```txt
MVP template: 15 layouts minimum
Professional template: 25 layouts
Premium template: 35+ layouts
```

This lets you ship faster.

For now:

```txt
Existing 10 templates: keep 15 layouts
New important templates: build with 25 layouts
Later: upgrade old templates to 25
```

Otherwise, you will spend too much time expanding everything before testing with real users.

## New template list I would create next

I would create these 8:

```txt
ydeck-library-business-report
ydeck-library-teaching-exercises
ydeck-library-teaching-games
ydeck-library-country-overview
ydeck-library-project-overview
ydeck-library-investment-analysis
ydeck-library-company-profile
ydeck-library-book-lesson
```

Especially for YDeck, **book-lesson** is very important because your idea is:

```txt
User uploads a book
User asks: create slides from Lesson 5 or pages 23–45
Later user comes back and creates another deck from the same book
```

That template should be separate from general teaching templates.

## Final recommendation

Yes, create more templates. But make them **scenario templates**, not just visual themes.

Each template should have:

```txt
25 layout options
5–7 layout groups
2–3 recommended deck flows
static preview deck
strict QA checklist
chart/icon/image rules
```

And the generation agent should decide:

```txt
User goal → deck type → template → deck flow → selected layouts → generated slides
```

That will make YDeck feel much more intelligent than normal PPT generators.
Yes — for YDeck, most professional templates **should include picture-based layouts**, because image-heavy decks feel more premium and less “AI-generated.”

But the key is: **pictures should be controlled by the template**, not randomly inserted by the agent.

## Recommended rule

Each 25-layout template should include around:

```txt
8–12 image-friendly layouts
8–10 data/content layouts
3–5 closing/summary/action layouts
```

Not every slide needs an image, but most templates should have many layouts where images are expected.

## Image layout types to include

For each template, add these kinds of picture layouts:

```txt
1. Hero image title
2. Full-bleed image with overlay text
3. Split image + explanation
4. Image grid / gallery
5. Case study with photo
6. Before / after visual
7. Map or location visual
8. Product / object feature
9. People / team image
10. Background image with cards
11. Image + statistics overlay
12. Screenshot / document evidence slide
```

For example, **Country Overview** should include:

```txt
country hero image
map slide
city gallery
culture/lifestyle image
infrastructure image
tourism highlights
industry photo
investment zone / business district image
```

**Teaching + Games** should include:

```txt
picture guessing game
vocabulary image cards
matching image cards
story scene
character slide
classroom activity visual
reward/badge slide
answer reveal with picture
```

**Investment Analysis** should include fewer decorative images, but still use:

```txt
company/product image
market landscape visual
founder/team photo
facility/store/app screenshot
country/city image
risk/opportunity visual
```

## Add image policy to `template.json`

I would add an `imagePolicy` field:

```json
{
  "imagePolicy": {
    "defaultDensity": "medium",
    "preferredImageRatio": ["16:9", "4:3", "1:1"],
    "allowedImageUses": [
      "hero",
      "background",
      "split_panel",
      "gallery",
      "evidence",
      "portrait",
      "map",
      "screenshot",
      "object_feature"
    ],
    "avoid": [
      "random decorative stock images",
      "low-resolution images",
      "unrelated business people",
      "watermarked images",
      "busy photos behind small text"
    ],
    "rules": [
      "Use images only when they support the slide message.",
      "Never place body text directly on a busy image without overlay protection.",
      "Use dark or light overlay panels for readability.",
      "Crop images intentionally; do not stretch.",
      "Prefer user-uploaded images when available.",
      "Use generated or licensed-safe visuals when no user image exists."
    ]
  }
}
```

## Add image slots to layouts

Each layout should tell the agent how many images it needs.

Example:

```json
{
  "id": "hero_image_title",
  "role": "Opening slide with strong visual identity",
  "imageSlots": [
    {
      "id": "hero",
      "required": true,
      "type": "background",
      "ratio": "16:9",
      "purpose": "Set emotional and visual context for the topic"
    }
  ]
}
```

Another example:

```json
{
  "id": "case_study_visual",
  "role": "Case study with evidence image and key lesson",
  "imageSlots": [
    {
      "id": "case_image",
      "required": true,
      "type": "evidence",
      "ratio": "4:3",
      "purpose": "Show product, place, user, screenshot, or real-world proof"
    }
  ]
}
```

This is important because the agent should not just say:
“Add any image here.”

It should know:

```txt
what kind of image
where it goes
what ratio
whether it is required
what message it supports
```

## Image source priority

For YDeck, use this image priority:

```txt
1. User-uploaded images
2. Images extracted from uploaded PDF/PPT/book
3. Screenshots or charts generated by YDeck tools
4. AI-generated visuals
5. Built-in safe illustration/image library
6. External licensed image search, only if your product supports it legally
```

For education/book decks, this is especially important.

If the user uploads a textbook, the best deck should use:

```txt
images from the uploaded book
diagrams from the book
lesson illustrations
tables/charts converted into visuals
teacher-friendly activity graphics
```

## Important legal/product warning

Be careful with random internet images.

For production YDeck, avoid using random Google/Bing images unless you have a clear license flow. Better options:

```txt
user-uploaded images
generated illustrations
built-in licensed asset packs
public-domain/Creative Commons sources with attribution
partner image APIs with commercial license
```

This matters because teachers, companies, and governments may use the slides publicly.

## Template design rule

Each template should define an **image personality**.

For example:

### Business Report

```txt
Image style: restrained, professional, evidence-based
Use: screenshots, product photos, workplace/process photos, charts
Avoid: random smiling office people
```

### Teaching Games

```txt
Image style: colorful, friendly, playful
Use: characters, objects, flashcards, scenes, rewards
Avoid: corporate photos and dense diagrams
```

### Country Overview

```txt
Image style: documentary, geographic, cultural
Use: maps, cities, people, infrastructure, landmarks, industries
Avoid: tourist-only postcard feeling if the deck is business-focused
```

### Investment Analysis

```txt
Image style: serious, analytical, proof-based
Use: product screenshots, facilities, founder/team, market visuals
Avoid: decorative background images
```

## Add image QA rules

In `references/checklist.md`, add:

```txt
Image QA:
- Every image must support the slide message.
- No image should be stretched or distorted.
- Text over images must have overlay protection.
- Important faces/objects must not be cropped awkwardly.
- Images must not reduce readability.
- Avoid repeated image compositions across adjacent slides.
- Avoid generic stock images when evidence images are available.
- Do not use watermarked or low-resolution images.
- If image source is unknown, prefer generated or built-in safe assets.
```

## My recommendation

Yes, most new templates should include pictures.

But implement it like this:

```txt
Template has 25 layouts
↓
10 layouts are image-first or image-supported
↓
Each image layout has imageSlots
↓
Agent chooses images based on source priority
↓
QA checks cropping, relevance, readability, and safety
```

This will make YDeck decks feel much more visual, especially for:

```txt
teaching
games
country overview
project overview
reports
company profile
event/expo decks
book lesson decks
```

The main principle: **images should not decorate the slide; images should explain the slide.**
Yes, Pexels API is a good choice for YDeck image-heavy templates.

But you should implement it as a **controlled image provider**, not as random image insertion.

Pexels allows free personal and commercial use, and photos/videos can be modified, but there are restrictions: don’t sell unaltered copies, don’t imply endorsement by people/brands in the image, don’t use images as trademarks, and don’t redistribute them as a competing stock/wallpaper platform. ([Pexels][1])

Also, for **API usage**, Pexels asks platforms to show a prominent Pexels link and credit photographers when possible. Their default API limit is **200 requests/hour and 20,000 requests/month**, with higher limits available for eligible apps. ([Pexels][2])

## How YDeck should use Pexels

Your image priority should be:

```txt
1. User-uploaded images
2. Images extracted from uploaded PDF/PPT/book
3. Generated charts/icons/diagrams from YDeck tools
4. Pexels API images
5. AI-generated images
6. Built-in asset packs
```

For example, if a teacher uploads a book, YDeck should first use images from the book. Pexels should be used when the deck needs supporting visuals like classroom scenes, countries, business, technology, markets, landscapes, teamwork, etc.

## Add this to `template.json`

Each template should define how it uses images:

```json
{
  "imagePolicy": {
    "providerPriority": [
      "user_upload",
      "document_extract",
      "ydeck_generated_visual",
      "pexels",
      "ai_generated",
      "built_in_assets"
    ],
    "defaultDensity": "medium",
    "targetImageLayouts": 10,
    "allowedUses": [
      "hero",
      "background",
      "split_panel",
      "gallery",
      "evidence",
      "portrait",
      "map_context",
      "screenshot_support",
      "object_feature"
    ],
    "pexels": {
      "enabled": true,
      "safeSearch": true,
      "storePhotoMetadata": true,
      "creditPhotographerWhenPossible": true,
      "avoidPeopleForSensitiveTopics": true
    },
    "avoid": [
      "random decorative stock photos",
      "watermarked images",
      "low-resolution images",
      "busy backgrounds behind small text",
      "images implying endorsement",
      "images with visible trademarks unless relevant and safe"
    ]
  }
}
```

## Add image slots to layouts

For every layout, define image requirements.

Example:

```json
{
  "id": "country_hero",
  "role": "Opening slide for country overview",
  "imageSlots": [
    {
      "id": "hero_country_image",
      "required": true,
      "provider": "pexels",
      "type": "background",
      "ratio": "16:9",
      "searchIntent": "beautiful representative image of the country, city skyline, landscape, or culture",
      "overlayRequired": true
    }
  ]
}
```

Another example:

```json
{
  "id": "teaching_picture_game",
  "role": "Picture guessing or vocabulary game",
  "imageSlots": [
    {
      "id": "game_image_1",
      "required": true,
      "provider": "pexels",
      "type": "object_or_scene",
      "ratio": "1:1",
      "searchIntent": "clear child-friendly object image for vocabulary practice"
    },
    {
      "id": "game_image_2",
      "required": true,
      "provider": "pexels",
      "type": "object_or_scene",
      "ratio": "1:1",
      "searchIntent": "clear child-friendly object image for vocabulary practice"
    }
  ]
}
```

This helps the agent know **what image to search**, **where it goes**, and **why it is needed**.

## Very important: store metadata

When YDeck selects a Pexels image, store this with the generated deck:

```json
{
  "source": "pexels",
  "photoId": "123456",
  "photographer": "Photographer Name",
  "photographerUrl": "...",
  "pexelsUrl": "...",
  "query": "Uzbekistan city skyline",
  "usedInSlide": 3,
  "usageType": "background"
}
```

Do not just store the final image URL. You need metadata for credits, debugging, regeneration, and compliance.

## Add a credits system

Even though Pexels license says attribution is not required generally, API guidelines ask platforms to show a Pexels link and credit photographers when possible. So for YDeck, I would do both:

In the **template picker / image picker UI**:

```txt
Photos provided by Pexels
```

In exported decks, add either:

```txt
Photo credits: Pexels
```

or a final small credits slide:

```txt
Selected photos provided by Pexels and respective photographers.
```

This is safer, especially if you later request unlimited API usage, because Pexels requires proof that Pexels and contributors are credited within the platform for higher limits. ([Pexels Help][3])

## Do not use Pexels for AI training

This is important for YDeck. Do not use Pexels images to build your own training dataset, fine-tune visual models, evaluate models, or collect image metadata at scale for ML purposes unless you get explicit permission from Pexels. Their API terms specifically warn against using the API for datasets or ML/AI model training. ([Pexels Help][4])

Using Pexels images inside generated user decks is fine. Using them to train YDeck’s models is not safe.

## Best implementation flow

```txt
Slide needs image
↓
Read template imageSlots
↓
Generate search query from slide topic + template intent
↓
Call Pexels API
↓
Filter results: orientation, quality, relevance, people/trademark risk
↓
Select best image
↓
Crop safely
↓
Add overlay if text is on image
↓
Store Pexels metadata
↓
Add credit to deck/platform
↓
Run image QA
```

## My recommendation

Use Pexels mainly for these templates:

```txt
teaching games
teaching exercises
country overview
project overview
company profile
event / expo deck
business report
market research
brand story
```

Use it more carefully for:

```txt
investment analysis
financial plan
technical architecture
government / policy brief
```

For those, images should be evidence-based, not decorative.

The best rule for YDeck is:

**Pexels images should make the slide more understandable, not just prettier.**

[1]: https://www.pexels.com/license/ 'Free Stock Photo & Video License - Pexels'
[2]: https://www.pexels.com/api/documentation/ 'Free stock photos · Pexels'
[3]: https://help.pexels.com/hc/en-us/articles/900005852323-How-do-I-get-unlimited-requests 'How do I get unlimited requests? – Pexels'
[4]: https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions 'What are the Terms and Conditions? – Pexels'
