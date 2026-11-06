// What the owner's bot is asked (app_homethingy_requirements.txt 4): read an item's photos and files into its fields
// (one run per item), and answer a question about the household's things. Bump PROMPT_VERSION when a task or a
// schema changes (kept on each item).

import { CATEGORY_KEYS, KIND_KEYS } from "./catalog.js";

export const PROMPT_VERSION = "ht-read-v1";

const str = (max) => ({ type: ["string", "null"], maxLength: max });
const int = (min, max) => ({ type: ["integer", "null"], minimum: min, maximum: max });
const num = { type: ["number", "null"], minimum: 0 };

const FIELDS = {
  name: str(160),
  category: { type: ["string", "null"], enum: [...CATEGORY_KEYS, null] },
  brand: str(100),
  model: str(100),
  serial: str(100),
  quantity: int(1, 9999),
  purchase_date: str(10),
  price: num,
  currency: str(3),
  shop: str(160),
  order_no: str(100),
  warranty_months: int(0, 600),
  warranty_until: str(10),
  place_id: { type: ["integer", "null"] },
  spot: str(160),
  tags: { type: "array", maxItems: 10, items: { type: "string", maxLength: 40 } },
};

export const SCHEMA = {
  type: "object", required: ["is_item", "item", "summary", "confidence"],
  properties: {
    is_item: { type: "boolean" },
    problem: str(500),
    item: { type: "object", properties: FIELDS },
    summary: str(400),
    tips: { type: "array", maxItems: 6, items: { type: "string", maxLength: 400 } },
    files: { type: "array", maxItems: 20, items: { type: "object", required: ["index", "kind"],
      properties: { index: { type: "integer", minimum: 0 }, kind: { type: "string", enum: KIND_KEYS } } } },
    others: { type: "array", maxItems: 10, items: { type: "object", required: ["name"],
      properties: { name: { type: "string", maxLength: 160 }, category: FIELDS.category, brand: str(100), model: str(100),
        quantity: int(1, 9999), price: num } } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", maxItems: 10, items: { type: "string", maxLength: 300 } },
  },
};

export const ASK_SCHEMA = {
  type: "object", required: ["answer", "item_ids"],
  properties: {
    answer: { type: "string", maxLength: 2000 },
    item_ids: { type: "array", maxItems: 40, items: { type: "integer" } },
  },
};

const language = (lang) => (lang === "en" ? "English" : "Traditional Chinese as used in Hong Kong (繁體中文)");

export function readTask(lang, nFiles) {
  return `You read the photos and files of ONE item of a household inventory (Home Thingy) and return its details as JSON.
${nFiles ? `${nFiles} file(s) are attached, in the order of data.files (index 0 first): photos of the thing itself, receipts or invoices, warranty
cards, manuals, labels, boxes. Read them yourself (vision / OCR); Hong Kong shops and bilingual EN + 中文 text are common.` : "No file is attached: use data.item and data.hint only."}
data.item = what is known now; data.owner_fields = the fields the OWNER typed: keep them exactly (return them unchanged or
null); if one looks clearly wrong, say so in warnings instead. data.hint = the owner's note for this reading (hints, not facts).
data.places = the owner's places ({id, path}); data.categories = the allowed categories; data.today; data.default_currency.

1. WHAT IT IS
- is_item: false when the files show no household thing, receipt or document you can read (blank, unreadable, a random
  screenshot): explain in problem, item {}.
- item.name: short and specific, as people call it (e.g. "Dyson V12 吸塵機", "IKEA KALLAX 4格櫃", "結婚戒指"), brand and
  model kept out of the name only when that makes it clumsy. Write it in the language the item is known by (a product name
  stays as printed).
- item.category: exactly one of the allowed keys; "other" only when nothing fits.
- brand, model, serial: only as printed or clearly visible (a serial / S/N / IMEI label); never guessed.
- tags: 2-8 short words that help searching (type of thing, colour, material, room use, e.g. "吸塵", "無線", "white").

2. RECEIPTS AND WARRANTY
- purchase_date: the day on the receipt or invoice (YYYY-MM-DD). shop: the shop or seller; order_no: the receipt / invoice /
  order number. price: what was paid for THIS item (after its discount), not the receipt total unless it is the only item;
  quantity: how many of it were bought. currency: ISO code (HKD for "$" / "HK$" on a Hong Kong receipt, else data.default_currency
  when the currency is not printed).
- warranty_months: the warranty written on the card, receipt or box ("1 year warranty", "保用兩年", "24個月保養"); null when not written.
  warranty_until: only when an end date is written, or purchase_date + warranty_months (YYYY-MM-DD). Never invent a warranty.
- others: OTHER distinct products listed on the same receipt (not this item), so the owner can add them as items too: name,
  category, brand, model, quantity, price. Leave out bags, delivery, service fees and discounts. [] when there are none.

3. WHERE IT IS
- place_id: only when data.hint names the place or a photo clearly shows one of data.places; else null. spot: the exact spot
  when the hint says it ("頂層抽屜", "床底左邊箱").

4. USEFUL NOTES (written in ${language(lang)})
- summary: one or two sentences: what it is and what the files show (「Dyson V12 無線吸塵機，2025-03-02 喺豐澤買，$4,990，保用兩年。」).
- tips: 0-5 short, useful notes for keeping this item: how to claim its warranty exactly as printed (hotline, website,
  "keep the receipt", registration needed within N days), service or replacement intervals the files state (filters,
  batteries, descaling), and well-known general care for this kind of thing (say it is general). Copy phone numbers and
  web addresses exactly; never invent one, a recall or a price.
- files: for each attached file, what it is - {index, kind}: photo (the thing itself), receipt, warranty, manual, other.
- confidence (0-1): lower when photos are blurred, the receipt is cut off or the item is unclear.
- warnings: anything the owner should check (an unreadable price, two possible dates, a value you doubt).`;
}

export function askTask(lang) {
  return `You answer the owner's question about their household things (Home Thingy). data.question = the question;
data.items = their items ({id, name, category, place, spot, brand, model, status, lent_to, quantity, purchase_date, price,
currency, shop, warranty_until, tags, summary}); data.places = their places; data.today.
- Answer from data.items only: where something is, what they have, what was bought when and for how much, what is still
  under warranty or ends soon (compare warranty_until with data.today), what is lent out, totals.
- answer: short and direct, in ${language(lang)}; name the items and their places. Nothing found: say so plainly and suggest
  a better word to search for - never invent an item, place or price.
- item_ids: the ids of the items your answer is about (most relevant first; [] when none).`;
}
