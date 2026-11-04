// The five main areas, their sub-categories and the record kinds (app_familyhealthrecord_requirements.txt C1, as Aera).
// Names are [English, 繁體中文]; the page shows the owner's language.

export const AREAS = [
  { key: "body", name: ["Body", "身體情況"] },
  { key: "diet", name: ["Diet", "飲食"] },
  { key: "exercise", name: ["Exercise", "運動"] },
  { key: "mental", name: ["Mind", "心理"] },
  { key: "medication", name: ["Care", "醫治"] },
];

// key, area, names, the record kinds it usually holds.
export const CATEGORIES = [
  { key: "bloodTest", area: "body", name: ["Blood test", "驗血"], kinds: ["lab_result"] },
  { key: "imaging", area: "body", name: ["Imaging / X-ray", "影像／X光"], kinds: ["imaging"] },
  { key: "ecg", area: "body", name: ["ECG", "心電圖"], kinds: ["note"] },
  { key: "symptomPhoto", area: "body", name: ["Symptom", "症狀"], kinds: ["note"] },
  { key: "bloodPressure", area: "body", name: ["Blood pressure", "血壓"], kinds: ["vital_bp"] },
  { key: "glucose", area: "body", name: ["Blood sugar", "血糖"], kinds: ["vital_glucose"] },
  { key: "weight", area: "body", name: ["Weight", "體重"], kinds: ["vital_weight"] },
  { key: "height", area: "body", name: ["Height", "身高"], kinds: ["vital_height"] },
  { key: "other", area: "body", name: ["Other", "其他"], kinds: ["note"] },
  { key: "food", area: "diet", name: ["Food / meal", "飲食"], kinds: ["food"] },
  { key: "exerciseLog", area: "exercise", name: ["Exercise", "運動紀錄"], kinds: ["exercise"] },
  { key: "mood", area: "mental", name: ["Mood", "情緒／心理"], kinds: ["mood"] },
  { key: "sleep", area: "mental", name: ["Sleep quality", "睡眠質素"], kinds: ["sleep"] },
  { key: "illnessCondition", area: "medication", name: ["Illness / chronic condition", "病患／長期病"], kinds: ["note"] },
  { key: "doctorReport", area: "medication", name: ["Doctor summary", "醫生總結"], kinds: ["visit", "note"] },
  { key: "appointment", area: "medication", name: ["Appointment", "覆診／預約"], kinds: ["visit"] },
  { key: "treatment", area: "medication", name: ["Treatment", "治療紀錄"], kinds: ["visit", "note"] },
  { key: "prescription", area: "medication", name: ["Prescription", "處方"], kinds: ["medication"] },
  { key: "medicationLog", area: "medication", name: ["Medication log", "用藥紀錄"], kinds: ["medication"] },
  { key: "vaccination", area: "medication", name: ["Vaccination", "疫苗"], kinds: ["vaccination"] },
];

export const KINDS = ["vital_height", "vital_weight", "vital_bmi", "vital_bp", "vital_glucose", "lab_result", "visit", "medication",
  "food", "vaccination", "imaging", "note", "mood", "sleep", "exercise"];

export const MOODS = [
  ["calm", "Calm", "平靜"], ["tense", "Tense", "緊張"], ["highPressure", "Under pressure", "高壓"], ["happy", "Happy", "開心"],
  ["disappointed", "Disappointed", "失望"], ["tired", "Tired", "疲累"], ["anxious", "Anxious", "焦慮"], ["content", "Content", "滿足"],
  ["sad", "Sad", "難過"], ["angry", "Angry", "生氣"], ["flat", "Flat", "平淡"], ["isolated", "Isolated", "孤立"],
];

export const SLEEP = [
  ["excellent", "Excellent", "很好"], ["good", "Good", "不錯"], ["fair", "Fair", "一般"], ["poor", "Poor", "差"], ["veryPoor", "Very poor", "很差"],
  ["restless", "Restless", "易醒"], ["hardToSleep", "Hard to fall asleep", "難入睡"], ["dreamHeavy", "Many dreams", "多夢"],
];

// Chronic conditions to pick from (memory A); the owner may add others as text.
export const CONDITIONS = [
  ["diabetes", "Diabetes", "糖尿病"], ["hypertension", "Hypertension", "高血壓"], ["gout", "Gout", "痛風"], ["heartDisease", "Heart disease", "心臟病"],
  ["asthma", "Asthma", "哮喘"], ["hyperlipidemia", "High cholesterol", "高血脂"], ["kidneyDisease", "Kidney disease", "腎病"],
  ["thyroid", "Thyroid disease", "甲狀腺疾病"], ["stroke", "Stroke history", "中風史"], ["copd", "Chronic lung disease", "慢性肺病"],
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const AREA_KEYS = AREAS.map((a) => a.key);
export const areaOf = (category) => CATEGORIES.find((c) => c.key === category)?.area || null;
