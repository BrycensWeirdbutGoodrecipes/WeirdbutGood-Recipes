# 🦊 Weird But Good Recipes

> 150+ hand-drawn AI-illustrated recipe cards made by an 11-year-old

**Live site:** [weirdbutgood.recipes](https://www.weirdbutgood.recipes)

![Made by Brycen](https://img.shields.io/badge/made_by-Brycen_Perina_(age_11)-ff6b9d?style=for-the-badge)
![Hosting](https://img.shields.io/badge/hosted_on-Vercel-black?style=for-the-badge&logo=vercel)
![Domain](https://img.shields.io/badge/domain-weirdbutgood.recipes-feca57?style=for-the-badge)
![Recipes](https://img.shields.io/badge/recipes-150%2B-7bed9f?style=for-the-badge)

## What is this?

I'm Brycen, I'm 11, and I made a recipe site because regular kid recipe sites are boring. Every card is **hand-drawn by AI** in a style I designed — ingredients on the left, steps on the right, doodles everywhere.

### Categories (20+!)
🥤 Drinks · 🍕 Foods · 🍿 Snacks · ☕ Coffee · ⚡ Energy · 🥂 Mocktail · 🍓 Fruit · 🔥 Hot · 💧 Low-Cal · 🐟 Pescetarian · 🥗 Vegetarian · 🍬 Candy · 😬 Sour · 🥨 Crunchy · 🥛 Creamy · 🧀 Cheesy · 🧂 Salty · 🌙 Late Night · 🎮 Gamer Fuel · 🥶 Frozen · 🌭 Junk Food

## Features

- 🎨 **150+ hand-drawn AI recipe cards** (generated via Gemini 3 Pro Image)
- 📄 **Per-recipe pages** with ingredients, steps, and schema.org Recipe data
- 📖 **6 long-form blog posts** ranking for kid recipe searches
- 📱 **PWA** — install to home screen, opens like a real app
- ⚔️ **Friend Cook-Off** — 1v1 AI-judged cooking battles, loser pays $1
- 📸 **Photo-to-recipe** — snap your fridge, get a recipe back
- 💝 **Tip jar** — Cash App + Tendy donations
- 📊 **Live stats dashboard** at [/stats](https://www.weirdbutgood.recipes/stats.html)
- 🔍 **Full SEO** — sitemap, schema.org, canonical URLs, OG images
- 📈 **Vercel Analytics + Speed Insights** + Google Search Console

## Tech Stack

- **Frontend:** Static HTML + vanilla JavaScript (no framework)
- **Hosting:** Vercel
- **AI:** Google Gemini 2.5 Flash (text) + Gemini 3 Pro Image (illustrations)
- **Schema:** schema.org structured data for SEO
- **PWA:** manifest.json + apple touch icons

## Project Structure

```
public/
├── index.html              # Main site (155+ recipes embedded)
├── all.html                # A-Z index of every recipe
├── stats.html              # Live analytics dashboard
├── weirdest.html           # "Top 10 Weirdest" blog post
├── best-*-for-kids.html    # 5 SEO blog posts
├── images/
│   ├── cards/              # AI-generated drawn cards (PNG)
│   ├── drinks/             # Drink illustrations
│   ├── foods/              # Food illustrations
│   └── snacks/             # Snack illustrations
└── recipes/                # 150+ dedicated per-recipe HTML pages
api/                        # Vercel serverless functions
scripts/                    # Image generation scripts (Gemini)
```

## About Me

I'm **Brycen Perina**, 11 years old, from Staten Island NY. I built this with help from my dad and our AI fox **Kit** 🦊.

This is my first real website. The whole thing was built in about a week. I learned HTML, JavaScript, schema.org, and how SEO works while making it.

If you want to message me or send a tip, hit the chat button on the site or use Cash App `$brycenperina6`.

## License

MIT — feel free to learn from it, fork it, or use parts of it. Credit appreciated 🦊
