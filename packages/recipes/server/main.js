// Recipes: its program in the gateway's sandbox (app_sandbox_requirements.txt 5). The data model, the
// prompt and what the assistant's answer changes are all here; the gateway only runs it.
import { createApp } from "../kit/server.js";

const recipes = {
  name: "recipes", title: "Recipes", item: "recipe", view: "cards", cover: "photo",
  // Its website: visitors read the recipes (and scale them on the page); materials stay private.
  public: ["read"],
  scale: { base: "servings", table: "ingredients" },
  look: "look",
  fields: [
    { name: "title", title: "Title", type: "text", required: true },
    { name: "status", title: "Status", type: "choice", choices: ["draft", "ready"] },
    { name: "look", title: "Look", type: "choice", choices: ["classic", "magazine", "notebook"] },
    { name: "servings", title: "Servings", type: "number" },
    { name: "prep_minutes", title: "Preparation", type: "number", unit: "min" },
    { name: "cook_minutes", title: "Cooking", type: "number", unit: "min" },
    { name: "difficulty", title: "Difficulty", type: "choice", choices: ["easy", "medium", "hard"] },
    { name: "photo", title: "Cover", type: "image" },
    { name: "ingredients", title: "Ingredients", type: "table", columns: [
      { name: "qty", title: "Amount", type: "number" }, { name: "unit", title: "Unit" },
      { name: "name", title: "Ingredient" }, { name: "note", title: "Note" }] },
    { name: "steps", title: "Method", type: "table", numbered: true, columns: [
      { name: "text", title: "Step" }, { name: "picture", title: "Picture", type: "image" }] },
    { name: "tips", title: "Tips", type: "list" },
    { name: "pictures", title: "Pictures", type: "images" },
    { name: "notes", title: "Notes", type: "longtext" },
    { name: "source", title: "Source", type: "text" },
  ],
};

// Materials: files (screenshots, photos, text notes, documents); one can belong to several recipes. The
// assistant says what each one is and how it used it.
const materials = {
  name: "materials", title: "Materials", item: "material", view: "files",
  fields: [
    { name: "file", title: "File", type: "file", required: true },
    { name: "recipe", title: "Recipes", type: "refs", ref: "recipes" },
    { name: "kind", title: "What it is", type: "choice", choices: ["finished dish", "step", "ingredients", "text", "other"] },
    { name: "used", title: "How it was used", type: "text" },
  ],
};

const TASK = (it) => `Write the finished recipe "${it.title}" for a recipe book.
Input: "item" is the recipe as it is now. Its fields may be empty, wrong or in the wrong place (e.g. the
whole recipe pasted into notes). The attached files are its materials (data.related.materials lists them
with their file names): screenshots, photos, text notes, documents. Read the text in the images yourself.

Write the whole recipe again from everything in item and the materials:
1. Put every fact in its own field: title, servings, preparation and cooking minutes, difficulty,
   ingredients, the method's steps in order, tips, source.
2. notes: only what fits no other field (history, storage, variations). Never repeat what is in another
   field. If nothing is left, leave notes out.
3. For each material, say what it is (materials: file, kind, used) and use it:
   - text -> into the fields;
   - a photo of the finished dish -> cover (the best one), the others into pictures;
   - a photo of a step -> that step's picture;
   - a photo of the ingredients -> pictures.
   Name pictures by their file name exactly as given.
4. Ingredients: amount as a number (1/2 -> 0.5; a range: the lower number, the range in note), unit,
   name. Words like 少許 / 適量 / to taste go in unit, with no amount.
5. Use only what item and the materials say. Don't invent amounts or steps. Leave a field out if it is
   unknown.
6. Keep the language of the materials. Don't translate.`;

const SCHEMA = {
  type: "object",
  required: ["title", "ingredients", "steps"],
  properties: {
    title: { type: "string" },
    servings: { type: "number" },
    prep_minutes: { type: "number" },
    cook_minutes: { type: "number" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    ingredients: { type: "array", items: { type: "object", required: ["name"], properties: {
      amount: { type: "number" }, unit: { type: "string" }, name: { type: "string" }, note: { type: "string" } } } },
    steps: { type: "array", items: { type: "object", required: ["text"], properties: {
      text: { type: "string" }, picture: { type: "string", description: "a material's file name" } } } },
    tips: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    source: { type: "string", description: "a link or book the recipe comes from, if the materials show one" },
    cover: { type: "string", description: "the material file name of the best photo of the finished dish" },
    pictures: { type: "array", items: { type: "string" }, description: "other useful photos (material file names)" },
    materials: { type: "array", items: { type: "object", required: ["file", "kind"], properties: {
      file: { type: "string" }, kind: { type: "string", enum: ["finished dish", "step", "ingredients", "text", "other"] },
      used: { type: "string", description: "how it was used, in a few words" } } } },
  },
};

// The answer replaces the recipe (the prompt asks for the whole recipe); pictures are copied from the
// materials under the recipe's name, so they show on its website while the materials stay private.
function apply(a, ctx) {
  const mats = ctx.related.materials || [];
  const byFile = new Map(mats.map((m) => [m.file && m.file.file, m]));
  const pic = (name, field) => (name && byFile.has(name) ? ctx.copyFile(name, field) : null);
  const update = {
    title: a.title,
    status: "ready",
    servings: a.servings ?? null,
    prep_minutes: a.prep_minutes ?? null,
    cook_minutes: a.cook_minutes ?? null,
    difficulty: a.difficulty ?? null,
    ingredients: (a.ingredients || []).map((x) => ({ qty: x.amount, unit: x.unit, name: x.name, note: x.note })),
    steps: (a.steps || []).map((s) => ({ text: s.text, picture: pic(s.picture, "steps") })),
    tips: a.tips || null,
    notes: a.notes || null,
    source: a.source || null,
    pictures: (a.pictures || []).map((p) => pic(p, "pictures")).filter(Boolean),
  };
  const cover = pic(a.cover, "photo");
  if (cover) update.photo = cover;
  if (!ctx.item.look) update.look = "classic";
  ctx.update(update);
  for (const m of a.materials || []) {
    const mat = byFile.get(m.file);
    if (mat) ctx.updateOther("materials", mat.id, { kind: m.kind, used: m.used || null });
  }
}

export const { handle, callTool, onAiResult, onInstall, onUpdate } = createApp({
  name: "Recipes",
  look: { accent: "#b4532a", paper: "#faf6ef", font: "serif", icon: "🍳" },
  collections: [recipes, materials],
  actions: [{ name: "build_recipe", title: "Build recipe", on: "recipes", include: ["materials"], task: TASK, schema: SCHEMA, apply }],
});
