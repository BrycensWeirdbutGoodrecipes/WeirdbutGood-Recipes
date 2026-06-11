// CRUD for user-added recipes — stored in Vercel Blob as JSON
import { put, head } from '@vercel/blob';
import { logActivity } from './activity.js';

const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];
const HELPER_EMAILS = ['3dmikep@gmail.com'];
const BLOB_KEY = 'recipes.json';

async function loadRecipes() {
  try {
    const info = await head(BLOB_KEY).catch(() => null);
    if (!info) return [];
    const res = await fetch(info.url, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) { return []; }
}

async function saveRecipes(arr) {
  await put(BLOB_KEY, JSON.stringify(arr), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

function isAdmin(email) {
  return email && ADMIN_EMAILS.includes(String(email).toLowerCase());
}
function isHelper(email) {
  return email && HELPER_EMAILS.includes(String(email).toLowerCase());
}
function canAdd(email) { return isAdmin(email) || isHelper(email); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const recipes = await loadRecipes();
    return res.status(200).json({ recipes });
  }

  const adminEmail = req.headers['x-admin-email'];

  if (req.method === 'POST') {
    if (!canAdd(adminEmail)) return res.status(403).json({ error: 'admins and helpers only' });
    const { name, category, image, ingredients, steps } = req.body || {};
    if (!name || !image) return res.status(400).json({ error: 'name + image required' });
    const recipes = await loadRecipes();
    const recipe = {
      id: 'r_' + Math.random().toString(36).slice(2, 10),
      name,
      category: category || 'custom',
      image,
      ingredients: ingredients || '',
      steps: steps || '',
      createdAt: new Date().toISOString(),
      addedBy: adminEmail,
    };
    recipes.unshift(recipe);
    await saveRecipes(recipes);
    await logActivity({ type: 'recipe_added', by: adminEmail, name: recipe.name, category: recipe.category, image: recipe.image, recipeId: recipe.id });
    return res.status(200).json({ ok: true, recipe });
  }

  if (req.method === 'DELETE') {
    if (!isAdmin(adminEmail)) return res.status(403).json({ error: 'admin only for delete' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    let recipes = await loadRecipes();
    const removed = recipes.find(r => r.id === id);
    recipes = recipes.filter(r => r.id !== id);
    await saveRecipes(recipes);
    await logActivity({ type: 'recipe_deleted', by: adminEmail, name: removed?.name || id });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
