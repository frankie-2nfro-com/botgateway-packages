// What the owner's bot is asked for each input (app_familyhealthrecord_requirements.txt C3 / C8): Aera's classify,
// enrich and process prompts in ONE run - the file (when there is one) is attached, the member's health context
// (C4) is in `data`. Bump PROMPT_VERSION when the task or the schema changes (kept on each input).

import { AREAS, CATEGORIES, CATEGORY_KEYS, KINDS, AREA_KEYS } from "./catalog.js";

export const PROMPT_VERSION = "fhr-read-v2.3";

const num = { type: ["number", "null"] };
const str = (max) => ({ type: ["string", "null"], maxLength: max });

const ENTITY = {
  type: "object", required: ["kind", "title"],
  properties: {
    kind: { type: "string", enum: KINDS },
    category_key: { type: ["string", "null"], enum: [...CATEGORY_KEYS, null] },
    title: { type: "string", maxLength: 200 },
    observed_at: str(40),
    value: num,
    value_text: str(500),
    unit: str(40),
    ref_low: num,
    ref_high: num,
    flag: { type: ["string", "null"], enum: ["high", "low", "normal", "abnormal", null] },
    confidence: num,
    extras: { type: ["object", "null"] },
  },
};

const REMARKS = { type: "object", additionalProperties: false, properties: Object.fromEntries(AREA_KEYS.map((k) => [k, { type: "string", maxLength: 600 }])) };
// The AI's health advice per area (owner 2026-11-04): its own required field, so it is never left out of the remarks.
const ADVICE = { type: "object", additionalProperties: false, properties: Object.fromEntries(AREA_KEYS.map((k) => [k, { type: "string", minLength: 10, maxLength: 400 }])) };

export const SCHEMA = {
  type: "object", required: ["is_health_input", "main_key", "category_key", "confidence", "entities", "advice"],
  properties: {
    is_health_input: { type: "boolean" },
    problem: str(500),
    main_key: { type: "string", enum: AREA_KEYS },
    category_key: { type: "string", enum: CATEGORY_KEYS },
    also_category_keys: { type: "array", maxItems: 4, items: { type: "string", enum: CATEGORY_KEYS } },
    recorded_at: str(10),
    clinic: str(200),
    doctor: str(200),
    summary: str(300),
    confidence: { type: "number", minimum: 0, maximum: 1 },
    entities: { type: "array", maxItems: 200, items: ENTITY },
    domain_remarks: REMARKS,
    advice: ADVICE,
    situation_update: str(1400),
    illness_candidates: {
      type: "array", maxItems: 5,
      items: { type: "object", required: ["label_zh"], properties: { label_zh: { type: "string", maxLength: 120 }, label_en: str(120), evidence: str(300), condition_key: str(40) } },
    },
    warnings: { type: "array", maxItems: 20, items: { type: "string", maxLength: 200 } },
  },
};

const areaLines = () => AREAS.map((a) => `- ${a.key} (${a.name.join(" / ")})`).join("\n");
const categoryLines = () => CATEGORIES.map((c) => `- ${c.key} (${c.name.join(" / ")}) [main=${c.area}] -> typical kinds: ${c.kinds.join("|")}`).join("\n");

// What kind of input it is, in words for the bot.
function inputLine(input) {
  switch (input.kind) {
    case "file": return `A ${input.media_type === "application/pdf" ? "PDF" : "photo"} is attached (file name: ${input.name}). Read it yourself (OCR / vision); Hong Kong / bilingual EN+ZH content is common.`;
    case "text": return "A text record the owner typed (no file): data.input.text.";
    case "mood": return "A mood log (no file): data.input.mood {from, to, note}. The program already records it as a mood record - return entities [].";
    case "sleep": return "A sleep-quality log (no file): data.input.sleep {quality, note}. The program already records it as a sleep record - return entities [].";
    case "height": return "A height the owner entered (no file): data.input.text. The program already records it - return entities [].";
    case "weight": return "A weight the owner entered (no file): data.input.text. The program already records it - return entities [].";
    default: return "An input: see data.input.";
  }
}

export function buildTask(input, member) {
  return `You read one input of a personal family health archive (FamilyHealthRecords) for the family member ${member.name}${member.birth_year ? ` (born ${member.birth_year})` : ""}, and return it as JSON.
${inputLine(input)}
${input.owner_day ? `The owner dated this input ${input.owner_day}: recorded_at = ${input.owner_day}, and the day of every value without its own date in the input.` : `Default day (when the input has no clearer date): ${input.day}.`}
data.health_context = this member's trusted profile (chronic_conditions), rolling memory (memory) and prior comparable records (prior_records, newest first).
${input.remarks ? `The owner's remarks for reading it again (hints only, do not invent facts): data.input.remarks.\n` : ""}${input.category_hint ? `The owner says the primary sub-category is ${input.category_hint}.\n` : ""}
Allowed main areas (main_key):
${areaLines()}
Allowed sub-categories (category_key; each belongs to one main area):
${categoryLines()}

1. CLASSIFY
- is_health_input: false when it is not health related, blank or unreadable - say why in problem, entities [], no memory change.
- category_key: exactly ONE primary sub-category (where the input lives); main_key = its main. Never invent keys.
- also_category_keys: 0-4 more sub-categories only when the same input clearly covers more topics (a doctor's letter ->
  doctorReport, also prescription when drugs are listed, appointment when a follow-up is stated). Never repeat the primary.
- Routing: a home BP meter photo (SYS/DIA, often pulse) -> bloodPressure (pulse is a fact, not a category); symptom text or
  photo (pain, rash, gout signs) -> symptomPhoto; a doctor's letter with an illness summary -> doctorReport; a pure Rx ->
  prescription; a pure booking slip -> appointment; a meal photo or nutrition label -> food. Prefer a specific key; "other" only
  when nothing fits.

2. READ (photos / files)
- Read the whole input yourself. Keep numbers, dates, names, units, lab values and drug names exactly. Never guess.
- Meal photos: be concrete about what is visible (dishes, drinks, packaging); estimates are allowed and marked 估計 (calories,
  sugar, salt, fat, fiber); a readable nutrition label wins over estimates.
- Symptom photos: appearance, severity, body part, as seen.

3. STRUCTURE (entities)
- One input may give MANY entities; the primary category is a filing hint, not a limit - emit every clear fact with the right
  kind and set category_key on EACH entity to the sub-category that should own it (else it goes under the primary).
- also-keys give extra entities ONLY when the text supports a separate fact (do not invent meals, drugs or workouts).
- observed_at: the measurement / visit time when present (YYYY-MM-DD or full ISO time); else recorded_at.
- recorded_at: the best single day for the input (visit / lab / measure day, not the print day), else the default day.
- confidence (0-1, top level and per entity): lower when the photo is blurred or values are ambiguous.
- flag and ref_low / ref_high: only when the reference range is written. Never invent ranges.
- Keep titles short; long narrative goes in extras.
- Shapes:
  vital_bp: title "血壓", value = systolic, unit "mmHg", extras {systolic, diastolic, pulse, pulse_unit "bpm"} - ONE entity, pulse inside.
  vital_weight: kg (convert lb when labelled); vital_height: cm (convert ft/in); vital_glucose: value + unit, extras {timing: fasting|random|postprandial|null}.
  vital_bmi: omit (the page computes BMI).
  lab_result: ONE entity per analyte line, title = the name / code as written (e.g. "HbA1c", "MCH", "紅血球"), value = the number
    (REQUIRED - only when BOTH the name and its number are clearly readable; a cut-off row is omitted and listed in warnings as
    "omitted_partial:<name>"), unit, ref_low / ref_high / flag from the reference column, extras {code, raw}.
  visit: extras {provider, place, reason, findings, plan, follow_up, follow_up_relative ("約10週後")}.
  medication: one per drug, extras {drug, dose, route, frequency, duration, instructions}.
  vaccination: extras {vaccine, dose_number, site}. imaging: extras {modality: xray|mri|ct|ultrasound|other, body_part, impression}.
  food: title = concrete items + key tags (e.g. "菠蘿包 · 高糖 · 約280kcal"), extras {meal: breakfast|lunch|dinner|snack|null, items [],
    portion, calories_kcal, sugar, salt, fat, fiber, tags [], nutrition, assessment, notes}.
  exercise: extras {activity, duration_min, distance_km, notes}. mood: extras {from, to, note}. sleep: extras {quality, note}.
  note (symptom, ECG comment, free text): extras {text, symptom: true|false|null, body_part}.
- A doctor's letter: SEPARATE entities - (1) the clinical summary -> visit / note, category_key doctorReport; (2) each drug ->
  medication, category_key prescription; (3) the follow-up -> visit, category_key appointment.
- Symptom + diet in one note ("多喝水，痛風好像好了") -> note (symptom) + food (多喝水 / 補水), not the paragraph twice.
- Almost nothing structured -> one note with extras.text = the useful text. Empty / illegible -> entities [] + warnings.

4. REMARKS AND MEMORY (write these in Traditional Chinese, Hong Kong; address the member as 您, never 使用者 / 用戶)
- summary: one short sentence (<= 160 characters) of what this input is.
- domain_remarks: ONLY for the main areas this input touches; 2-3 short sentences, facts only (the advice goes in advice):
  (1) what was logged this time (「您記錄了身高為 177 cm」「您飲咗橙汁」);
  (2) a finding against prior_records of the same kind: the change and the rough time span (「比較兩星期前的血壓，收縮壓低了約
      8 mmHg」「比較上次體重，您輕了約 1.2 kg」); no prior of that kind -> 「這是您檔案中首次記錄的…」; never invent priors, numbers
      or dates, do not mention BMI;
  (3) optional: a chronic condition in chronic_conditions linked to this input (「您有痛風病史」).
- advice: REQUIRED - for EVERY area you wrote in domain_remarks, your own health advice for this member (the owner asked
  for it and knows it comes from an AI, not a doctor): 1-3 sentences, concrete and practical, from what was logged, the
  change found, out-of-range values, chronic_conditions and the memory. Explain briefly what an out-of-range value can
  mean in general, and what to do: lifestyle (food, drink, exercise, sleep), what to measure or record next, when to
  re-test, and when to see a doctor (clearly out of range, worsening, or a worrying symptom -> see a doctor soon; urgent
  signs -> seek medical help now). Examples:
  「白血球偏高常見於感染或發炎；如有發燒、喉嚨痛等不適，或一兩星期後覆驗仍偏高，建議請醫生跟進。」
  「拉花奶咖啡約150kcal，可以揀少糖或低脂奶；咖啡因會影響睡眠，下午後宜少飲。」
  「血壓比上次高，建議連續一星期早晚量血壓並記錄，持續高於135/85請見醫生。」
  Even when everything is normal, give a short useful tip (keep doing X, re-check in N months). Never tell them to stop,
  start or change a prescribed medicine or dose (say to ask the doctor), never state a diagnosis as fact, no false
  reassurance. Not a health input -> advice {}.
- situation_update: the WHOLE rolling memory rewritten (<= 1100 characters): the prior memory + this input as dated bullets
  (「2026-11-04 血壓 128/82」), notable findings when room allows, stale trivia dropped. Facts only (the advice stays in domain_remarks), no BMI.
  If this input is already in the memory (it is read again), do not add it twice. Not a health input -> leave it out.
- illness_candidates: ONLY when clinical text clearly names a chronic condition or diagnosis NOT already in chronic_conditions;
  condition_key from diabetes, hypertension, gout, heartDisease, asthma, hyperlipidemia, kidneyDisease, thyroid, stroke, copd
  when it matches, else null. They are candidates the owner confirms - never facts. Else [].

Advice only in advice (4); everything else is what the input says.`;
}
