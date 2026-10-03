/**
 * Suggests a folder emoji from its name ("Reading list" → 📚), from a
 * curated list of common folder topics. No network and no AI: names the
 * list doesn't cover get no suggestion (the dialog keeps the default 🦪).
 */

/** Each topic's emoji and the words that point to it (singular, lowercase). */
const TOPICS: readonly (readonly [emoji: string, words: readonly string[]])[] = [
  ["📚", ["read", "reading", "book", "library", "longread", "literature", "novel"]],
  ["📰", ["news", "article", "newsletter", "press", "journalism"]],
  ["✍️", ["writing", "write", "blog", "essay", "post"]],
  ["🎨", ["design", "art", "illustration", "color", "colour", "typography", "font", "ui", "ux"]],
  ["💻", ["code", "coding", "dev", "developer", "development", "programming", "engineering", "software", "frontend", "backend", "web"]],
  ["🤖", ["ai", "ml", "llm", "robot", "automation", "agent"]],
  ["🧪", ["science", "research", "experiment", "lab", "chemistry"]],
  ["🔭", ["space", "astronomy", "physics", "universe"]],
  ["📊", ["data", "analytics", "chart", "statistics", "stats", "dashboard", "metric"]],
  ["💼", ["work", "job", "career", "office", "business", "company", "client"]],
  ["🚀", ["startup", "launch", "product", "growth", "side", "project"]],
  ["📈", ["marketing", "seo", "sales", "ads", "advertising"]],
  ["💰", ["money", "finance", "budget", "investing", "investment", "stock", "crypto", "saving", "tax"]],
  ["🛒", ["shopping", "shop", "buy", "wishlist", "deal", "store"]],
  ["🎁", ["gift", "present", "birthday", "christmas"]],
  ["✈️", ["travel", "trip", "vacation", "holiday", "flight", "abroad"]],
  ["🗺️", ["map", "place", "city", "explore", "guide"]],
  ["🏠", ["home", "house", "apartment", "interior", "furniture", "decor"]],
  ["🌱", ["garden", "gardening", "plant", "nature", "sustainability", "green"]],
  ["🐶", ["dog", "pet", "puppy"]],
  ["🐱", ["cat", "kitten"]],
  ["🍳", ["recipe", "cooking", "cook", "kitchen", "baking", "meal"]],
  ["🍕", ["food", "restaurant", "eat", "eating", "dinner", "lunch"]],
  ["☕", ["coffee", "cafe", "tea"]],
  ["🍷", ["wine", "cocktail", "drink", "bar"]],
  ["💪", ["fitness", "gym", "workout", "exercise", "training", "strength"]],
  ["🏃", ["running", "run", "marathon", "cardio"]],
  ["🧘", ["yoga", "meditation", "mindfulness", "wellbeing", "wellness", "calm"]],
  ["🩺", ["health", "medical", "doctor", "medicine"]],
  ["🧠", ["psychology", "learning", "learn", "knowledge", "brain", "mind", "philosophy"]],
  ["🎓", ["school", "university", "course", "study", "education", "class", "lecture"]],
  ["📝", ["note", "notes", "todo", "task", "list", "checklist"]],
  ["💡", ["idea", "inspiration", "inspo", "brainstorm"]],
  ["🔖", ["later", "bookmark", "saved", "someday", "queue"]],
  ["⭐", ["favorite", "favourite", "best", "starred", "top"]],
  ["🎵", ["music", "song", "playlist", "album", "band", "spotify"]],
  ["🎧", ["podcast", "audio", "listen", "audiobook"]],
  ["🎬", ["movie", "film", "cinema", "watch", "series", "tv", "show"]],
  ["📺", ["video", "youtube", "stream", "streaming"]],
  ["📷", ["photo", "photography", "camera", "picture"]],
  ["🎮", ["game", "gaming", "videogame", "play"]],
  ["⚽", ["football", "soccer", "sport", "sports"]],
  ["🏀", ["basketball", "nba"]],
  ["🎾", ["tennis"]],
  ["🚴", ["cycling", "bike", "bicycle"]],
  ["🏔️", ["hiking", "mountain", "outdoor", "climbing", "camping"]],
  ["🌊", ["surf", "surfing", "beach", "ocean", "sea"]],
  ["🚗", ["car", "cars", "auto", "driving"]],
  ["👗", ["fashion", "clothes", "outfit", "style", "wardrobe"]],
  ["💄", ["beauty", "makeup", "skincare"]],
  ["💍", ["wedding", "engagement"]],
  ["👶", ["baby", "parenting", "kid", "children"]],
  ["❤️", ["love", "relationship", "dating"]],
  ["👥", ["people", "team", "community", "friend", "network", "contact"]],
  ["🗓️", ["event", "calendar", "meetup", "conference", "schedule"]],
  ["📦", ["resource", "tool", "toolkit", "library", "asset", "kit", "component"]],
  ["🔒", ["security", "privacy", "password"]],
  ["⚙️", ["setting", "config", "setup", "admin", "ops", "devops"]],
  ["🌍", ["world", "global", "politics", "language", "culture"]],
  ["📜", ["history", "archive", "old"]],
  ["⚖️", ["law", "legal", "contract"]],
  ["🏛️", ["government", "policy"]],
  ["🔬", ["biology", "medicine", "lab"]],
  ["🎤", ["talk", "speech", "presentation", "keynote"]],
  ["🧩", ["puzzle", "hobby", "diy", "craft"]],
  ["🛠️", ["build", "maker", "hardware", "repair"]],
  ["🎯", ["goal", "focus", "plan", "planning", "strategy", "okr"]],
  ["📱", ["mobile", "app", "ios", "android", "iphone"]],
  ["✨", ["new", "fresh", "cool", "interesting"]],
];

/** Each topic word → its emoji (first topic wins on duplicates). */
const WORD_TO_EMOJI: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [emoji, words] of TOPICS) {
    for (const word of words) if (!map.has(word)) map.set(word, emoji);
  }
  return map;
})();

/** `word` and simple variants of it: plural (`books`), `-ing` (`cooking`). */
function variants(word: string): string[] {
  const forms = [word];
  if (word.endsWith("ies") && word.length > 4) forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 3) forms.push(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 3) forms.push(word.slice(0, -1));
  if (word.endsWith("ing") && word.length > 5) forms.push(word.slice(0, -3));
  return forms;
}

/**
 * The emoji for the first word of `name` that names a known topic, or null.
 * Case and punctuation don't matter ("UI/UX" matches "ui").
 */
export function suggestFolderEmoji(name: string): string | null {
  const words = name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) {
    for (const form of variants(word)) {
      const emoji = WORD_TO_EMOJI.get(form);
      if (emoji) return emoji;
    }
  }
  return null;
}

/** Every emoji the suggestions can produce (for validation in tests). */
export const TOPIC_EMOJI: readonly string[] = TOPICS.map(([emoji]) => emoji);
