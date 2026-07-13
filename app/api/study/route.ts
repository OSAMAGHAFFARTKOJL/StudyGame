import { NextResponse } from "next/server";
import { createFallbackStudyPlan, type StudyPlan } from "@/lib/study";

export const runtime = "nodejs";
export const maxDuration = 60;

const LLM_TIMEOUT_MS = 18_000;

type RequestBody = {
  text?: string;
  title?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const text = body.text?.slice(0, 26000) || "";
  const title = body.title || "Study Quest";
  const apiKey = process.env.FIREWORKS_API_KEY;
  const model = process.env.FIREWORKS_MODEL || "accounts/fireworks/models/gpt-oss-120b";

  if (!apiKey) {
    return NextResponse.json({
      ...createFallbackStudyPlan(text, title),
      notice: "Set FIREWORKS_API_KEY in the local .env file and restart npm run dev. The current content is a basic fallback."
    });
  }

  const planPromise = generateStudyPlan(text, title, apiKey, model);
  return streamJsonResponse(planPromise);
}

async function generateStudyPlan(text: string, title: string, apiKey: string, model: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  console.log("API Key present:", !!apiKey);
  console.log("Using model:", model);

  try {
    const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.18,
        max_tokens: 3600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a senior exam paper setter, academic tutor, and curriculum designer.",
              "Your MCQs must look like real exam questions, not toy quiz questions.",
              "Every wrong option must be relevant, plausible, and based on a common misconception.",
              "Return only valid JSON. Do not return markdown."
            ].join(" ")
          },
          {
            role: "user",
            content: buildExamPrompt(title, text)
          }
        ]
      })
    });

    console.log("Fireworks response status:", response.status);
    console.log("Fireworks response ok:", response.ok);
    if (!response.ok) {
      const errorText = await response.text();
      console.log("Fireworks error response:", errorText);
      return {
        ...createFallbackStudyPlan(text, title),
        notice: buildFallbackNotice(response.status, title)
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    console.log("Fireworks response data:", data);
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = parsePlan(content);

    return normalizePlan(parsed, text, title);
  } catch (error) {
    console.log("Error in generateStudyPlan:", error);
    return {
      ...createFallbackStudyPlan(text, title),
      notice: "The LLM request timed out or could not reach Fireworks. Check network access, model access, and the API key."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildFallbackNotice(status: number, title: string) {
  if (status === 401 || status === 403) {
    return "Fireworks rejected the key or model access for this request. Check FIREWORKS_API_KEY and FIREWORKS_MODEL.";
  }

  if (status === 404) {
    return "Fireworks could not find the requested model. Check FIREWORKS_MODEL.";
  }

  if (status === 429) {
    return "Fireworks rate-limited this request. Try again in a moment or use a smaller input.";
  }

  if (status >= 500) {
    return "Fireworks returned a server error, so this is a fallback. Try again later.";
  }

  return `The LLM request failed with HTTP ${status}, so this is a basic fallback for ${title}.`;
}

function streamJsonResponse(planPromise: Promise<StudyPlan>) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("\n"));

      planPromise
        .then((plan) => {
          controller.enqueue(encoder.encode(JSON.stringify(plan)));
          controller.close();
        })
        .catch((error) => {
          controller.error(error);
        });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function buildExamPrompt(title: string, text: string) {
  return `You will receive text extracted from an academic PDF.

First, understand the PDF. Remove noise such as headers, footers, page numbers, author info, references, random spacing, and repeated fragments.

Then create a learning plan that teaches the material and tests it like a real exam.

Return this exact JSON shape:
{
  "title": "short academic title",
  "overview": "what the student will learn",
  "parts": [
    {
      "id": "part-1",
      "title": "specific concept title",
      "subtitle": "specific learning objective",
      "theme": "short visual theme",
      "plainSummary": "4-6 easy sentences. Keep only important teachable content from this part.",
      "teachingScript": "160-230 words. Mature, simple explanation. Explain definitions, relationships, cause/effect, and one example if useful. No childish fantasy story.",
      "imagePrompt": "educational illustration prompt for this concept, no text, no labels, no watermark",
      "difficulty": "Spark",
      "story": "same as teachingScript",
      "keyIdeas": ["important term", "important term", "important term"],
      "mcqs": [
        {
          "question": "exam-style conceptual question",
          "options": ["relevant option", "relevant option", "relevant option", "relevant option"],
          "answer": 0,
          "explanation": "short explanation of the logic"
        }
      ]
    }
  ],
  "mode": "llm"
}

Strict section rules:
- Divide the PDF into 4 to 7 logical concepts in learning order.
- Do not make a level from tiny fragments, headings, citations, or formatting.
- Each part must focus on one meaningful concept.
- Use easy language, but keep the science/math/academic meaning correct.

Strict MCQ rules:
- Each part must have exactly 5 MCQs.
- Each MCQ must have exactly 4 options.
- Questions must look like real exam questions.
- Questions must test: definition, relationship, cause/effect, application, and misconception.
- Do not ask useless questions like "what is the main idea", "which sentence matches", page numbers, headings, filenames, or PDF formatting.
- Every option must be related to the same topic and similar in style/length.
- Exactly one option must be correct.
- Wrong options must be plausible wrong answers a student might choose.
- Avoid joke options, obvious nonsense, vague options, and options like "all of the above" or "none of the above".
- Keep options concise but meaningful.
- The explanation must explain why the correct option is correct, not just repeat it.
- Ground every MCQ in the given PDF text. Do not invent outside facts.

Quality bar:
Bad question: "What is the main focus of this level?"
Good question: "Why does a neuron use synapses instead of directly touching every other neuron?"

Bad options: ["random guessing", "page numbering", "file name", "decoration"]
Good options: ["To transmit signals through neurotransmitters", "To store oxygen for the cell", "To digest waste proteins", "To prevent all electrical activity"]

PDF title: ${title}

PDF text:
${text}`;
}

function parsePlan(content: string): StudyPlan | null {
  try {
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) {
      return null;
    }

    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as StudyPlan;
    if (!parsed.parts?.length) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function normalizePlan(plan: StudyPlan | null, text: string, title: string): StudyPlan {
  if (!plan?.parts?.length) {
    return createFallbackStudyPlan(text, title);
  }

  const fallback = createFallbackStudyPlan(text, title);
  const parts = plan.parts.slice(0, 7).map((part, index) => {
    const fallbackPart = fallback.parts[index] || fallback.parts[0];
    const teachingScript = part.teachingScript || part.story || fallbackPart.teachingScript;
    const plainSummary = part.plainSummary || fallbackPart.plainSummary;
    const keyIdeas = Array.isArray(part.keyIdeas) && part.keyIdeas.length ? part.keyIdeas.slice(0, 6) : fallbackPart.keyIdeas;
    const validMcqs = Array.isArray(part.mcqs)
      ? part.mcqs.map(normalizeMcq).filter((mcq): mcq is NonNullable<ReturnType<typeof normalizeMcq>> => Boolean(mcq))
      : [];
    const mcqs = validMcqs.length >= 3 ? validMcqs.slice(0, 5) : fallbackPart.mcqs;

    return {
      ...fallbackPart,
      ...part,
      id: part.id || `part-${index + 1}`,
      title: part.title || fallbackPart.title,
      subtitle: part.subtitle || fallbackPart.subtitle,
      theme: part.theme || fallbackPart.theme,
      plainSummary,
      teachingScript,
      imagePrompt: part.imagePrompt || fallbackPart.imagePrompt,
      difficulty: part.difficulty || fallbackPart.difficulty,
      story: teachingScript,
      keyIdeas,
      mcqs
    };
  });

  return {
    title: plan.title || fallback.title,
    overview: plan.overview || fallback.overview,
    parts,
    mode: "llm",
    notice: "Generated with LLM exam mode."
  };
}

type NormalizedMcq = StudyPlan["parts"][number]["mcqs"][number];

function normalizeMcq(mcq: NormalizedMcq): NormalizedMcq | null {
  if (!mcq || typeof mcq.question !== "string" || !Array.isArray(mcq.options)) {
    return null;
  }

  const options = uniqueText(mcq.options.map((option) => cleanText(option))).slice(0, 4);
  const answer = Number(mcq.answer);
  const question = cleanText(mcq.question);
  const explanation = cleanText(mcq.explanation || "");

  if (
    options.length !== 4 ||
    !Number.isInteger(answer) ||
    answer < 0 ||
    answer >= options.length ||
    question.length < 18 ||
    explanation.length < 20 ||
    isBannedQuestion(question) ||
    hasBannedOption(options)
  ) {
    return null;
  }

  return {
    question: question.endsWith("?") ? question : `${question}?`,
    options,
    answer,
    explanation
  };
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueText(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function isBannedQuestion(question: string) {
  const lower = question.toLowerCase();
  return [
    "main idea",
    "main focus",
    "best matches",
    "which sentence",
    "page number",
    "file name",
    "pdf"
  ].some((term) => lower.includes(term));
}

function hasBannedOption(options: string[]) {
  return options.some((option) => {
    const lower = option.toLowerCase();
    return [
      "random guessing",
      "page numbering",
      "file name",
      "decoration",
      "all of the above",
      "none of the above",
      "not enough information"
    ].some((term) => lower.includes(term));
  });
}
