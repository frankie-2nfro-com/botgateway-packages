// Recipes: its program in the gateway's sandbox (app_sandbox_requirements.txt 5). The data model, the
// prompt and what the assistant's answer changes are all here; the gateway only runs it.
import { createApp } from "../kit/server.js";

const recipes = {
  name: "recipes", title: "Recipes", item: "recipe", view: "cards", cover: "photo",
  // Its website: visitors read the published recipes (and scale them on the page); materials stay private.
  public: ["read"],
  publish: { field: "status", value: "published" },
  // The cover opens a viewer with the cover and the album.
  album: "pictures",
  // Its page shows when it was created and last changed.
  dates: true,
  scale: { base: "servings", table: ["ingredients", "seasonings"] },
  look: "look",
  fields: [
    { name: "title", title: "Title", type: "text", required: true },
    // Version of the written recipe: 1, 2, 3, ... - one more each time the assistant writes it again.
    { name: "revision", title: "Version", type: "number", auto: true, format: "v{n}" },
    { name: "status", title: "Status", type: "choice", choices: ["unpublished", "published"], default: "unpublished" },
    { name: "look", title: "Look", type: "choice", choices: ["classic", "magazine", "notebook", "minimal", "bistro"] },
    { name: "servings", title: "Servings", type: "number" },
    { name: "prep_minutes", title: "Preparation", type: "number", unit: "min" },
    { name: "cook_minutes", title: "Cooking", type: "number", unit: "min" },
    { name: "difficulty", title: "Difficulty", type: "choice", choices: ["easy", "medium", "hard"] },
    { name: "photo", title: "Cover", type: "image" },
    { name: "ingredients", title: "Ingredients", type: "table", columns: [
      { name: "qty", title: "Amount", type: "number" }, { name: "unit", title: "Unit" },
      { name: "name", title: "Ingredient" }, { name: "note", title: "Note" }] },
    // Salt, sugar, sauces, oil, spices: their own section (they follow the servings too).
    { name: "seasonings", title: "Seasonings", type: "table", columns: [
      { name: "qty", title: "Amount", type: "number" }, { name: "unit", title: "Unit" },
      { name: "name", title: "Seasoning" }, { name: "note", title: "Note" }] },
    { name: "steps", title: "Method", type: "table", numbered: true, columns: [
      { name: "text", title: "Step" }, { name: "picture", title: "Picture", type: "image" }] },
    { name: "tips", title: "Tips", type: "list" },
    { name: "pictures", title: "Album", type: "images" },
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
    // owned: deleting a recipe deletes the materials used only by it; shared ones are kept.
    { name: "recipe", title: "Recipes", type: "refs", ref: "recipes", owned: true },
    { name: "kind", title: "What it is", type: "choice", choices: ["finished dish", "step", "ingredients", "text", "other"] },
    { name: "used", title: "How it was used", type: "text" },
  ],
};

const BUILD_HINT = "The assistant writes the recipe from its materials. Anything else it should do this time? e.g. \"for 4 people\", \"less sugar\", \"write it in English\", \"add a tip about storing it\". Leave empty for none.";

const IMG = /\.(png|jpe?g|gif|webp)$/i;
// The photos the assistant may use: the recipe's own (cover, album) and the materials' pictures.
const ownPhotos = (it) => [it.photo && it.photo.file, ...(it.pictures || []).map((p) => p && p.file)].filter(Boolean);
const photosOf = (it, related) => [...new Set([...ownPhotos(it),
  ...((related && related.materials) || []).map((m) => m.file && m.file.file).filter((n) => n && IMG.test(n))])];

const TASK = (it, related) => `Write the finished recipe "${it.title}" for a recipe book.
Input: "item" is the recipe as it is now. Its fields may be empty, wrong or in the wrong place (e.g. the
whole recipe pasted into notes). The attached files are its materials (data.related.materials lists them
with their file names): screenshots, photos, text notes, documents. Read the text in the images yourself.

Write the whole recipe again from everything in item and the materials:
1. Put every fact in its own field: title, servings, preparation and cooking minutes, difficulty,
   ingredients, seasonings, the method's steps in order, tips, source.
2. notes: only what fits no other field (history, storage, variations). Never repeat what is in another
   field. If nothing is left, leave notes out.
3. For each material, say what it is (materials: file, kind, used) and use it:
   - text -> into the fields;
   - a photo of a step -> that step's picture;
   - the photos to show (the finished dish, the ingredients) -> step 4.
4. Photos: the "photos" line at the end lists every photo you may use - the materials' and the ones the owner already put in
   the recipe (its cover and its album). Pick the best photo of the finished dish as cover. Put the other
   photos worth showing in pictures (the album), best first. Every photo the owner put in the cover or the
   album stays: in cover or in pictures. Name photos by their file name exactly as given.
5. Ingredients and seasonings, each in its own list: seasonings = what gives taste - salt, sugar,
   sauces (soy sauce, oyster sauce, vinegar, wine), oil, spices, herbs, stock powder; ingredients = the
   rest (meat, fish, vegetables, eggs, rice, noodles, flour ...). A sauce mixed beforehand: its parts
   in seasonings, with the sauce's name in note. Amount as a number (1/2 -> 0.5; a range: the lower
   number, the range in note), unit, name. Words like 少許 / 適量 / to taste go in unit, with no amount.
6. Use only what item and the materials say. Don't invent amounts or steps. Leave a field out if it is
   unknown.
7. Keep the language of the materials. Don't translate.

photos: ${photosOf(it, related).join(", ") || "(none)"}`;

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
    seasonings: { type: "array", description: "salt, sugar, sauces, oil, spices ... (not in ingredients)", items: { type: "object", required: ["name"], properties: {
      amount: { type: "number" }, unit: { type: "string" }, name: { type: "string" }, note: { type: "string" } } } },
    steps: { type: "array", items: { type: "object", required: ["text"], properties: {
      text: { type: "string" }, picture: { type: "string", description: "a material's file name" } } } },
    tips: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    source: { type: "string", description: "a link or book the recipe comes from, if the materials show one" },
    cover: { type: "string", description: "the file name (from photos) of the best photo of the finished dish" },
    pictures: { type: "array", items: { type: "string" }, description: "the album: the other photos worth showing, best first (file names from photos)" },
    materials: { type: "array", items: { type: "object", required: ["file", "kind"], properties: {
      file: { type: "string" }, kind: { type: "string", enum: ["finished dish", "step", "ingredients", "text", "other"] },
      used: { type: "string", description: "how it was used, in a few words" } } } },
  },
};

// The answer replaces the recipe (the prompt asks for the whole recipe; publishing stays the owner's choice).
// Photos from the materials are copied under the recipe's name, so they show on its website while the
// materials stay private; the recipe's own photos are used as they are, and none of them is ever dropped.
function apply(a, ctx) {
  const mats = ctx.related.materials || [];
  const byFile = new Map(mats.map((m) => [m.file && m.file.file, m]));
  const own = ownPhotos(ctx.item);
  const pic = (name, field) => (!name ? null : own.includes(name) ? { file: name } : byFile.has(name) ? ctx.copyFile(name, field) : null);
  // Cover: the assistant's pick, else the one it had. Album: the picks, then any own photo left out.
  const cover = pic(a.cover, "photo") || (ctx.item.photo && ctx.item.photo.file ? { file: ctx.item.photo.file } : null);
  const album = [];
  const add = (p) => { if (p && p.file !== (cover && cover.file) && !album.some((x) => x.file === p.file)) album.push(p); };
  for (const name of a.pictures || []) add(pic(name, "pictures"));
  for (const name of own) add({ file: name });
  const update = {
    revision: (Number(ctx.item.revision) || 0) + 1,
    title: a.title,
    servings: a.servings ?? null,
    prep_minutes: a.prep_minutes ?? null,
    cook_minutes: a.cook_minutes ?? null,
    difficulty: a.difficulty ?? null,
    ingredients: (a.ingredients || []).map((x) => ({ qty: x.amount, unit: x.unit, name: x.name, note: x.note })),
    seasonings: (a.seasonings || []).map((x) => ({ qty: x.amount, unit: x.unit, name: x.name, note: x.note })),
    steps: (a.steps || []).map((s) => ({ text: s.text, picture: pic(s.picture, "steps") })),
    tips: a.tips || null,
    notes: a.notes || null,
    source: a.source || null,
    pictures: album,
  };
  if (cover) update.photo = cover;
  if (!ctx.item.look) update.look = "classic";
  ctx.update(update);
  for (const m of a.materials || []) {
    const mat = byFile.get(m.file);
    if (mat) ctx.updateOther("materials", mat.id, { kind: m.kind, used: m.used || null });
  }
}

// Before 0.5.0 the status was draft / ready and every recipe was on the website: "ready" ones stay
// published, the others become unpublished.
// 0.5.3: a published recipe without a version is version 1.
function upgrade(kit) {
  for (const it of kit.items("recipes")) {
    if (it.status !== "published" && it.status !== "unpublished") {
      it.status = it.status === "ready" ? "published" : "unpublished";
      kit.update("recipes", it.id, { status: it.status });
    }
    if (it.status === "published" && it.revision === undefined) kit.update("recipes", it.id, { revision: 1 });
  }
}

// The page in English or Chinese (the switch in its top bar); the recipes themselves stay as written.
const ZH = {
  "Recipes": "食譜", "recipe": "食譜", "Materials": "素材", "material": "素材",
  "Title": "標題", "Status": "狀態", "Look": "版面", "Servings": "份量", "Preparation": "準備時間", "Cooking": "烹調時間",
  "Difficulty": "難度", "Cover": "封面", "Ingredients": "材料", "Amount": "數量", "Unit": "單位", "Ingredient": "材料", "Seasonings": "調味料", "Seasoning": "調味料",
  "Note": "備註", "Method": "做法", "Step": "步驟", "Picture": "圖片", "Tips": "小貼士", "Pictures": "相片", "Album": "相簿",
  "Notes": "筆記", "Source": "來源", "File": "檔案", "What it is": "類別", "How it was used": "用途", "min": "分鐘",
  "unpublished": "未發佈", "published": "已發佈", "classic": "經典", "magazine": "雜誌", "notebook": "筆記本", "minimal": "極簡", "bistro": "餐館",
  "easy": "容易", "medium": "中等", "hard": "困難",
  "finished dish": "成品", "step": "步驟", "ingredients": "材料", "text": "文字", "other": "其他",
  "Build recipe": "生成食譜", "Version": "版本",
  [BUILD_HINT]: "助手會根據素材寫出食譜。今次還有其他要求嗎？例如「4 人份」、「少糖」、「用英文寫」、「加一個保存的小貼士」。沒有就留空。",
};

export const { handle, callTool, onAiResult, onInstall, onUpdate } = createApp({
  upgrade,
  languages: ["en", "zh"],
  words: { zh: ZH },
  name: "Recipes",
  look: { accent: "#b4532a", paper: "#faf6ef", font: "serif", icon: "icon.png", cover: "cover.svg" },
  collections: [recipes, materials],
  actions: [{ name: "build_recipe", title: "Build recipe", on: "recipes", include: ["materials"], task: TASK, schema: SCHEMA, apply,
    ask: { title: "Build recipe", hint: BUILD_HINT } }],
});
