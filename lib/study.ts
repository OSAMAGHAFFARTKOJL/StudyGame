export type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type StudyPart = {
  id: string;
  title: string;
  subtitle: string;
  theme: string;
  plainSummary: string;
  teachingScript: string;
  imagePrompt: string;
  difficulty: "Spark" | "Quest" | "Boss";
  story: string;
  keyIdeas: string[];
  mcqs: QuizQuestion[];
};

export type StudyPlan = {
  title: string;
  overview: string;
  parts: StudyPart[];
  mode?: "llm" | "fallback";
  notice?: string;
};

const fallbackText = `Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to create glucose and oxygen. Chlorophyll inside chloroplasts captures light energy. The light-dependent reactions create energy carriers, while the Calvin cycle uses carbon dioxide to build sugar. This process supports plant growth and releases oxygen into the atmosphere.`;

const themes = [
  "concept observatory",
  "interactive science lab",
  "memory workshop",
  "logic studio",
  "exam training arena"
];

export function createFallbackStudyPlan(rawText: string, sourceTitle = "Study Quest"): StudyPlan {
  const cleaned = normalizeText(rawText || fallbackText);
  const chunks = splitIntoStudySections(cleaned);
  const parts = chunks.map((chunk, index) => createPart(chunk, index));

  return {
    title: titleFromSource(sourceTitle),
    overview:
      "The material is divided into teachable concept levels with simple explanations, voice guidance, and concept checks.",
    parts,
    mode: "fallback",
    notice: "LLM exam mode is not configured in this deployment. Add FIREWORKS_API_KEY and FIREWORKS_MODEL to enable LLM-generated exam mode."
  };
}

function createPart(chunk: string, index: number): StudyPart {
  const sentences = splitSentences(chunk);
  const keywords = extractKeywords(chunk).slice(0, 6);
  const title = makeTitle(keywords, index);
  const focus = keywords[0] || "core idea";
  const support = keywords[1] || "important detail";
  const result = keywords[2] || "final outcome";
  const theme = themes[index % themes.length];
  const plainSummary = buildPlainSummary(sentences, focus, support, result);
  const teachingScript = buildTeachingScript(sentences, focus, support, result);

  return {
    id: `part-${index + 1}`,
    title,
    subtitle: `Concept ${index + 1}: understand the idea before the quiz`,
    theme,
    plainSummary,
    teachingScript,
    imagePrompt: buildImagePrompt(title, keywords, plainSummary),
    difficulty: index >= 3 ? "Boss" : index > 1 ? "Quest" : "Spark",
    story: teachingScript,
    keyIdeas: keywords.length ? keywords : ["main concept", "supporting detail", "learning outcome"],
    mcqs: buildQuestions(sentences, keywords, index)
  };
}

function buildPlainSummary(sentences: string[], focus: string, support: string, result: string) {
  const source = sentences.slice(0, 2).join(" ");
  return trimTo(
    `This part is mainly about ${focus}. The important link is ${support}, because it helps explain ${result}. ${source}`,
    360
  );
}

function buildTeachingScript(sentences: string[], focus: string, support: string, result: string) {
  const importantSentences = sentences.slice(0, 4).join(" ");
  return trimTo(
    `Let's understand this slowly. First, remember the main idea: ${focus}. It matters because it connects with ${support}. Now think of it as a simple chain: one thing happens, it affects another thing, and the result is ${result}. ${importantSentences} So the key is not to memorize words only. Try to understand what starts the process, what changes during it, and what final result it creates.`,
    820
  );
}

function buildImagePrompt(title: string, keywords: string[], summary: string) {
  const ideas = keywords.slice(0, 4).join(", ");
  return `${title}, educational concept illustration, clear labeled-style visual without text, showing ${ideas || summary}, bright academic game art`;
}

function buildQuestions(sentences: string[], keywords: string[], partIndex: number): QuizQuestion[] {
  const mainKeyword = keywords[0] || "the main concept";
  const secondKeyword = keywords[1] || "the supporting idea";
  const thirdKeyword = keywords[2] || "the outcome";
  const mainFact = sentenceForKeyword(sentences, mainKeyword) || sentences[0] || "The topic explains an important academic idea.";
  const displayKeyword = toTitleCase(mainKeyword);

  return [
    createQuestion(
      `Which explanation best matches ${mainKeyword}?`,
      trimTo(mainFact, 112),
      [
        `The material mentions ${displayKeyword} without explaining any role.`,
        `The topic treats ${displayKeyword} as separate from the rest of the concept.`,
        `The section says to ignore ${displayKeyword}.`
      ],
      `The correct option comes directly from the material and explains what ${mainKeyword} does in context.`,
      partIndex
    ),
    createQuestion(
      `How does ${secondKeyword} relate to the main concept?`,
      `It helps explain how ${mainKeyword} works or connects to the topic`,
      [
        `It replaces ${mainKeyword} completely`,
        "It is only a formatting detail from the PDF",
        "It makes the concept unrelated to the lesson"
      ],
      `${secondKeyword} is a supporting idea, so it helps the main concept make sense.`,
      partIndex + 1
    ),
    createQuestion(
      "When studying this part, what should you look for first?",
      "The cause, the change, and the final result",
      [
        "Only the longest sentence on the page",
        "Only words that look difficult",
        "Only the order of the PDF paragraphs"
      ],
      "Conceptual understanding comes from following how an idea starts, changes, and produces a result.",
      partIndex + 2
    ),
    createQuestion(
      `Which learning strategy fits this concept best?`,
      `Connect ${mainKeyword}, ${secondKeyword}, and ${thirdKeyword} in one simple explanation`,
      [
        "Memorize every line without checking meaning",
        "Skip the supporting details completely",
        "Focus only on the quiz score"
      ],
      "The strongest learning strategy is to connect the important ideas into one clear explanation.",
      partIndex + 3
    )
  ];
}

function sentenceForKeyword(sentences: string[], keyword: string) {
  const normalizedKeyword = keyword.toLowerCase();
  return sentences.find((sentence) => sentence.toLowerCase().includes(normalizedKeyword));
}


function createQuestion(
  question: string,
  correctOption: string,
  distractors: string[],
  explanation: string,
  seed: number
): QuizQuestion {
  const options = shuffleOptions(uniqueOptions([correctOption, ...distractors]), seed);

  return {
    question,
    options,
    answer: options.indexOf(correctOption),
    explanation
  };
}

function uniqueOptions(options: string[]) {
  const unique = [...new Set(options)];
  while (unique.length < 4) {
    unique.push(`Study clue ${unique.length}`);
  }
  return unique.slice(0, 4);
}

function shuffleOptions(options: string[], seed: number) {
  const copy = [...options];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = (seed + index * 2) % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").replace(/[^\S\r\n]+/g, " ").trim();
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitIntoStudySections(text: string) {
  const paragraphSections = text
    .split(/\n{2,}|(?=\b(?:chapter|section|unit|topic|module|lesson)\b[:\s\d.-])/i)
    .map((section) => section.trim())
    .filter((section) => section.length > 160);

  if (paragraphSections.length >= 3) {
    return paragraphSections.slice(0, 6);
  }

  return splitIntoChunks(text, text.length > 12000 ? 6 : text.length > 6000 ? 5 : 4);
}

function splitIntoChunks(text: string, desiredChunks: number) {
  const sentences = splitSentences(text);
  if (sentences.length <= desiredChunks) {
    return sentences.length ? sentences : [fallbackText];
  }

  const chunkSize = Math.max(3, Math.ceil(sentences.length / desiredChunks));
  const chunks = [];
  for (let index = 0; index < sentences.length; index += chunkSize) {
    chunks.push(sentences.slice(index, index + chunkSize).join(" "));
  }

  return chunks.slice(0, desiredChunks);
}

function extractKeywords(text: string) {
  const stopWords = new Set([
    "about",
    "above",
    "after",
    "again",
    "against",
    "also",
    "activities",
    "based",
    "because",
    "between",
    "body",
    "chemical",
    "controls",
    "could",
    "different",
    "during",
    "each",
    "electrical",
    "example",
    "important",
    "from",
    "have",
    "information",
    "into",
    "level",
    "material",
    "more",
    "other",
    "process",
    "such",
    "that",
    "their",
    "then",
    "there",
    "these",
    "this",
    "through",
    "used",
    "uses",
    "using",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would"
  ]);

  const counts = new Map<string, number>();
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));

  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || second[0].length - first[0].length)
    .map(([word]) => humanize(word));
}

function makeTitle(keywords: string[], index: number) {
  if (keywords.length >= 2) {
    return `${toTitleCase(keywords[0])} Concept`;
  }

  return ["Core Idea", "Key Mechanism", "Concept Link", "Master Checkpoint"][index] || "Quest Level";
}

function titleFromSource(sourceTitle: string) {
  const name = sourceTitle.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
  return name || "Study Quest";
}

function trimTo(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function humanize(word: string) {
  return word.replace(/-/g, " ");
}

function toTitleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
