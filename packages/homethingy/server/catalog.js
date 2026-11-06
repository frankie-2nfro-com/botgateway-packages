// What Home Thingy knows (app_homethingy_requirements.txt 3): categories, what an item's files are, an item's
// status and the usual rooms. Names are [English, 繁體中文]; the page shows the owner's language.

export const CATEGORIES = [
  { key: "electronics", icon: "💻", name: ["Electronics", "電子產品"] },
  { key: "appliance", icon: "🔌", name: ["Appliances", "家電"] },
  { key: "furniture", icon: "🛋️", name: ["Furniture", "傢俬"] },
  { key: "kitchen", icon: "🍳", name: ["Kitchen", "廚具餐具"] },
  { key: "tools", icon: "🔧", name: ["Tools & DIY", "工具"] },
  { key: "clothing", icon: "👕", name: ["Clothes & bags", "衣物手袋"] },
  { key: "valuables", icon: "💍", name: ["Jewellery & valuables", "首飾貴重物品"] },
  { key: "documents", icon: "🗂️", name: ["Documents & IDs", "證件文件"] },
  { key: "books", icon: "📚", name: ["Books & media", "書籍影音"] },
  { key: "toys", icon: "🧸", name: ["Toys & games", "玩具遊戲"] },
  { key: "sports", icon: "⚽", name: ["Sports & outdoor", "運動戶外"] },
  { key: "care", icon: "🧴", name: ["Health & personal care", "保健護理"] },
  { key: "garden", icon: "🪴", name: ["Plants & garden", "植物園藝"] },
  { key: "vehicle", icon: "🚲", name: ["Bikes & vehicles", "單車汽車"] },
  { key: "collectibles", icon: "🏺", name: ["Collectibles & art", "收藏藝術品"] },
  { key: "other", icon: "📦", name: ["Other", "其他"] },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// What one of an item's files is.
export const KINDS = [
  ["photo", "Photo", "相片"],
  ["receipt", "Receipt", "單據"],
  ["warranty", "Warranty card", "保養卡"],
  ["manual", "Manual", "說明書"],
  ["other", "Other", "其他"],
];
export const KIND_KEYS = KINDS.map((k) => k[0]);

// Where an item is now; "gone" items are kept as a record and hidden unless asked for.
export const STATUSES = [
  ["have", "In use", "使用中"],
  ["stored", "Put away", "收埋咗"],
  ["lent", "Lent out", "借咗出去"],
  ["repair", "Being repaired", "維修中"],
  ["gone", "Gone (sold, given, thrown)", "已唔喺度"],
];
export const STATUS_KEYS = STATUSES.map((s) => s[0]);

// The owner may add these places in one go (in the page's language).
export const ROOMS = [
  ["living", "Living room", "客廳", "🛋️"],
  ["bedroom", "Bedroom", "睡房", "🛏️"],
  ["kitchen", "Kitchen", "廚房", "🍳"],
  ["bathroom", "Bathroom", "浴室", "🛁"],
  ["study", "Study", "書房", "📚"],
  ["storeroom", "Storeroom", "儲物房", "📦"],
  ["balcony", "Balcony", "露台", "🪴"],
];
