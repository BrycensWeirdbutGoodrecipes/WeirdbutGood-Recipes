#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const recipesDir = path.join(ROOT, 'public', 'recipes');
const files = (await fs.readdir(recipesDir)).filter(f => f.endsWith('.html'));

const today = '2026-06-10';
const base = 'https://www.weirdbutgood.recipes';
const urls = [
  { loc: `${base}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
  { loc: `${base}/#about`, priority: '0.95' },
  { loc: `${base}/#drinks`, priority: '0.9' },
  { loc: `${base}/#foods`, priority: '0.7' },
  { loc: `${base}/#snacks`, priority: '0.7' },
  { loc: `${base}/weirdest.html`, lastmod: today, priority: '0.9' },
];
for (const f of files.sort()) urls.push({ loc: `${base}/recipes/${f}`, lastmod: today, priority: '0.8' });

let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const u of urls) {
  xml += `  <url>\n    <loc>${u.loc}</loc>\n`;
  if (u.lastmod) xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
  if (u.changefreq) xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
  if (u.priority) xml += `    <priority>${u.priority}</priority>\n`;
  xml += `  </url>\n`;
}
xml += `</urlset>\n`;
await fs.writeFile(path.join(ROOT, 'public', 'sitemap.xml'), xml);
console.log(`Sitemap written with ${urls.length} URLs`);
