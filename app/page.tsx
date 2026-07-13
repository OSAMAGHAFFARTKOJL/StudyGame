"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { createFallbackStudyPlan, type StudyPlan } from "@/lib/study";

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (data: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
      }>;
    }>;
  };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJs;
  }
}

const sampleText = `The human nervous system controls body activities through electrical and chemical signals. Neurons receive information through dendrites, process it in the cell body, and send impulses through axons. Synapses allow neurons to communicate by releasing neurotransmitters. The brain interprets sensory information, controls movement, stores memories, and regulates emotions. The spinal cord carries messages between the brain and the body and helps produce quick reflex actions.`;

const ranks = [
  { name: "Beginner", xp: 0 },
  { name: "Explorer", xp: 120 },
  { name: "Scholar", xp: 260 },
  { name: "Master", xp: 460 },
  { name: "Genius", xp: 760 }
];

export default function Home() {
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [activePartIndex, setActivePartIndex] = useState(0);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [completedParts, setCompletedParts] = useState<string[]>([]);
  const [xp, setXp] = useState(0);
  const [coins, setCoins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [status, setStatus] = useState("Drop a PDF or launch the sample quest.");
  const [isLoading, setIsLoading] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [lessonPhase, setLessonPhase] = useState<"idle" | "speaking" | "quiz">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const narrationTimerRef = useRef<number | null>(null);

  const activePart = studyPlan?.parts[activePartIndex] || null;
  const questParts = studyPlan?.parts || [];
  const activeQuestion = activePart?.mcqs[activeQuestionIndex] || null;
  const answeredCorrectly = selectedOption !== null && selectedOption === activeQuestion?.answer;
  const rank = useMemo(() => getRank(xp), [xp]);
  const nextRank = ranks.find((item) => item.xp > xp);
  const rankProgress = nextRank ? Math.min(100, Math.round((xp / nextRank.xp) * 100)) : 100;
  const badgeCount = completedParts.length + (streak >= 3 ? 1 : 0) + (xp >= 300 ? 1 : 0);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
        if (narrationTimerRef.current) {
          window.clearTimeout(narrationTimerRef.current);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!activePart) {
      return;
    }

    setLessonPhase("speaking");
    setIsNarrating(false);
    clearNarrationTimer();
    window.speechSynthesis?.cancel();

    const timer = window.setTimeout(() => {
      startNarration(activePart);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [activePart?.id]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      await buildQuestFromFile(file);
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await buildQuestFromFile(file);
    }
  }

  async function buildQuestFromFile(file: File) {
    setIsLoading(true);
    setStatus("Reading the PDF pages...");

    try {
      const extractedText = await extractPdfText(file);
      setStatus("Forging story levels and quiz bubbles...");
      const plan = await generateStudyPlan(extractedText, file.name);
      resetProgress(plan);
      setStatus(plan.notice || "LLM exam quest ready.");
    } catch {
      const plan = createFallbackStudyPlan(sampleText, file.name);
      resetProgress(plan);
      setStatus("The PDF text was difficult to read, so a sample quest is loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  async function launchSample() {
    setIsLoading(true);
    setStatus("Forging a sample quest...");
    const plan = await generateStudyPlan(sampleText, "Nervous System Primer");
    resetProgress(plan);
    setStatus(plan.notice || "LLM exam sample ready.");
    setIsLoading(false);
  }

  function resetProgress(plan: StudyPlan) {
    clearNarrationTimer();
    window.speechSynthesis?.cancel();
    setStudyPlan(plan);
    setActivePartIndex(0);
    setActiveQuestionIndex(0);
    setSelectedOption(null);
    setCompletedParts([]);
    setXp(0);
    setCoins(0);
    setStreak(0);
    setIsNarrating(false);
    setLessonPhase("idle");
  }

  function chooseOption(optionIndex: number) {
    if (!activeQuestion || selectedOption !== null || lessonPhase !== "quiz") {
      return;
    }

    setSelectedOption(optionIndex);
    const isCorrect = optionIndex === activeQuestion.answer;
    setXp((current) => current + (isCorrect ? 35 : 8));
    setCoins((current) => current + (isCorrect ? 12 : 2));
    setStreak((current) => (isCorrect ? current + 1 : 0));
  }

  function continueQuest() {
    if (!activePart) {
      return;
    }

    const isLastQuestion = activeQuestionIndex >= activePart.mcqs.length - 1;
    if (!isLastQuestion) {
      setActiveQuestionIndex((current) => current + 1);
      setSelectedOption(null);
      return;
    }

    setCompletedParts((current) =>
      current.includes(activePart.id) ? current : [...current, activePart.id]
    );
    setXp((current) => current + 60);
    setCoins((current) => current + 25);

    const nextPartIndex = activePartIndex + 1;
    if (studyPlan && nextPartIndex < studyPlan.parts.length) {
      setActivePartIndex(nextPartIndex);
      setActiveQuestionIndex(0);
      setSelectedOption(null);
      setLessonPhase("idle");
      setStatus("Next level unlocked.");
    } else {
      setSelectedOption(null);
      setLessonPhase("quiz");
      setStatus("Quest complete.");
    }
  }

  function selectPart(index: number) {
    if (!studyPlan) {
      return;
    }

    const previousPart = studyPlan.parts[index - 1];
    const isUnlocked = index === 0 || completedParts.includes(previousPart?.id);
    if (!isUnlocked) {
      setStatus("Complete the previous level to unlock this one.");
      return;
    }

    window.speechSynthesis?.cancel();
    clearNarrationTimer();
    setIsNarrating(false);
    setLessonPhase("idle");
    setActivePartIndex(index);
    setActiveQuestionIndex(0);
    setSelectedOption(null);
  }

  function startNarration(part = activePart) {
    if (!part || typeof window === "undefined" || !window.speechSynthesis) {
      setLessonPhase("quiz");
      return;
    }

    const script = part.teachingScript || part.story;
    const utterance = new SpeechSynthesisUtterance(script);
    const voice = pickFemaleVoice();
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.9;
    utterance.pitch = 1.08;
    utterance.onend = () => {
      clearNarrationTimer();
      setIsNarrating(false);
      setLessonPhase("quiz");
      setStatus("Concept check unlocked.");
    };
    utterance.onerror = () => {
      clearNarrationTimer();
      setIsNarrating(false);
      setLessonPhase("quiz");
      setStatus("Narration could not start, so the quiz is unlocked.");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    clearNarrationTimer();
    narrationTimerRef.current = window.setTimeout(() => {
      setIsNarrating(false);
      setLessonPhase("quiz");
      setStatus("Concept check unlocked.");
    }, Math.min(90000, Math.max(14000, script.length * 75)));
    setIsNarrating(true);
    setLessonPhase("speaking");
    setStatus("Listening mode started. Skip anytime to unlock the quiz.");
  }

  function skipNarration() {
    clearNarrationTimer();
    window.speechSynthesis?.cancel();
    setIsNarrating(false);
    setLessonPhase("quiz");
    setStatus("Narration skipped. Concept check unlocked.");
  }

  function clearNarrationTimer() {
    if (narrationTimerRef.current) {
      window.clearTimeout(narrationTimerRef.current);
      narrationTimerRef.current = null;
    }
  }

  const backgroundPrompt = encodeURIComponent(
    activePart?.imagePrompt ||
      `${activePart?.theme || "interactive learning interface"}, educational game background, bright readable, no text`
  );
  const quizLocked = Boolean(activePart && lessonPhase !== "quiz");

  return (
    <main className="app-shell">
      <div className="ambient-grid" />
      <header className="topbar">
        <button className="brand" onClick={() => fileInputRef.current?.click()} type="button">
          <span className="brand-mark">S</span>
          <span>
            <strong>StudyRealm</strong>
            <small>PDF Quest Engine</small>
          </span>
        </button>

        <div className="stat-strip" aria-label="Player stats">
          <Stat label="XP" value={xp.toString()} />
          <Stat label="Coins" value={coins.toString()} />
          <Stat label="Streak" value={streak.toString()} />
          <Stat label="Rank" value={rank.name} />
        </div>
      </header>

      <section className="workspace">
        <aside className="left-rail panel">
          <div className="rail-heading">
            <span>Quest Map</span>
            <strong>{studyPlan ? `${completedParts.length}/${studyPlan.parts.length}` : "0/0"}</strong>
          </div>

          <div className="map-path">
            {questParts.map((part, index) => {
              const previousPart = questParts[index - 1];
              const isComplete = completedParts.includes(part.id);
              const isUnlocked = index === 0 || Boolean(previousPart && completedParts.includes(previousPart.id));
              const isActive = index === activePartIndex;

              return (
                <button
                  className={`map-node ${isComplete ? "complete" : ""} ${isActive ? "active" : ""}`}
                  disabled={!isUnlocked}
                  key={part.id}
                  onClick={() => selectPart(index)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{part.title}</strong>
                    <small>{isUnlocked ? part.difficulty : "Locked"}</small>
                  </div>
                </button>
              );
            })}

            {!studyPlan && (
              <div className="empty-map">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        </aside>

        <section className="main-stage panel">
          {!studyPlan ? (
            <div
              className={`upload-stage ${isLoading ? "loading" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                accept="application/pdf"
                className="hidden-input"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <div className="portal-visual">
                <span className="ring ring-one" />
                <span className="ring ring-two" />
                <span className="ring ring-three" />
                <span className="core">PDF</span>
              </div>
              <img
                alt=""
                className="upload-art"
                src="https://image.pollinations.ai/prompt/interactive%20AI%20study%20game%20dashboard%20with%20students%20learning%20from%20a%20PDF%2C%20bright%20educational%20illustration%2C%20no%20text%2C%20no%20watermark?width=720&height=360&nologo=true"
              />
              <h1>StudyRealm</h1>
              <p>{status}</p>
              <div className="action-row">
                <button className="primary-action" onClick={() => fileInputRef.current?.click()} type="button">
                  Upload PDF
                </button>
                <button className="secondary-action" onClick={launchSample} type="button">
                  Sample Quest
                </button>
              </div>
            </div>
          ) : (
            <article className="quest-stage">
              <div className="world-scene">
                <img
                  alt=""
                  src={`https://image.pollinations.ai/prompt/${backgroundPrompt}?width=1200&height=620&nologo=true`}
                />
                <div className="scene-overlay">
                  <span className="level-chip">{activePart?.difficulty}</span>
                  <h1>{activePart?.title}</h1>
                  <p>{activePart?.subtitle}</p>
                </div>
              </div>

              <div className="story-panel">
                <div className="story-header">
                  <span>{activePart?.theme}</span>
                  <div className="lesson-controls">
                    <button className="icon-button" onClick={() => startNarration()} title="Replay voice" type="button">
                      {isNarrating ? "Replay" : "Listen"}
                    </button>
                    <button className="skip-button" onClick={skipNarration} type="button">
                      Skip Voice
                    </button>
                  </div>
                </div>
                <div className="summary-box">
                  <strong>Easy Summary</strong>
                  <p>{activePart?.plainSummary}</p>
                </div>
                <p>{activePart?.teachingScript || activePart?.story}</p>
              </div>

              <div className={`quiz-zone ${quizLocked ? "locked" : ""}`}>
                <div className="quiz-heading">
                  <span>{quizLocked ? "Listen First" : "Concept Check"}</span>
                  <strong>
                    {activeQuestionIndex + 1}/{activePart?.mcqs.length}
                  </strong>
                </div>

                {quizLocked ? (
                  <div className="quiz-lock">
                    <strong>{isNarrating ? "Teaching voice is playing" : "Preparing the lesson voice"}</strong>
                    <span>The quiz will appear automatically when the explanation ends.</span>
                    <button onClick={skipNarration} type="button">
                      Skip To Quiz
                    </button>
                  </div>
                ) : (
                  <>
                    <h2>{activeQuestion?.question}</h2>

                    <div className="bubble-options">
                      {activeQuestion?.options.map((option, index) => {
                        const isSelected = selectedOption === index;
                        const isCorrect = activeQuestion.answer === index;
                        const reveal = selectedOption !== null;
                        return (
                          <button
                            className={`answer-bubble ${isSelected ? "selected" : ""} ${
                              reveal && isCorrect ? "correct" : ""
                            } ${reveal && isSelected && !isCorrect ? "wrong" : ""}`}
                            key={`${option}-${index}`}
                            onClick={() => chooseOption(index)}
                            type="button"
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {selectedOption !== null && !quizLocked && (
                  <div className={`result-banner ${answeredCorrectly ? "win" : "retry"}`}>
                    <strong>{answeredCorrectly ? "+35 XP" : "+8 XP"}</strong>
                    <span>{activeQuestion?.explanation}</span>
                    <button onClick={continueQuest} type="button">
                      Continue
                    </button>
                  </div>
                )}
              </div>
            </article>
          )}
        </section>

        <aside className="right-rail panel">
          <div className="rank-card">
            <span className="rank-orbit">{rank.name.charAt(0)}</span>
            <div>
              <small>Current Rank</small>
              <strong>{rank.name}</strong>
            </div>
          </div>

          <div className="meter-block">
            <div>
              <span>Next Rank</span>
              <strong>{nextRank?.name || "Max"}</strong>
            </div>
            <div className="meter">
              <span style={{ width: `${rankProgress}%` }} />
            </div>
          </div>

          <div className="reward-grid">
            <Reward active={completedParts.length >= 1} label="First Clear" />
            <Reward active={streak >= 3} label="Hot Streak" />
            <Reward active={xp >= 300} label="XP Hunter" />
            <Reward active={badgeCount >= 4} label="Realm Key" />
          </div>

          <div className="key-ideas">
            <span>Key Ideas</span>
            {(activePart?.keyIdeas || ["Upload a PDF", "Start a quest", "Earn rewards"]).map((idea) => (
              <button key={idea} type="button">
                {idea}
              </button>
            ))}
          </div>

          {studyPlan?.notice && (
            <p className={`mode-line ${studyPlan.mode === "fallback" ? "warning" : ""}`}>
              {studyPlan.notice}
            </p>
          )}

          <p className="status-line">{status}</p>
        </aside>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-pill">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Reward({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`reward ${active ? "active" : ""}`}>
      <span />
      <strong>{label}</strong>
    </div>
  );
}

function getRank(xp: number) {
  return [...ranks].reverse().find((rank) => xp >= rank.xp) || ranks[0];
}

function pickFemaleVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const preferredNames = ["female", "zira", "samantha", "jenny", "aria", "susan", "victoria", "karen"];

  return (
    englishVoices.find((voice) =>
      preferredNames.some((name) => voice.name.toLowerCase().includes(name))
    ) ||
    englishVoices[0] ||
    voices[0] ||
    null
  );
}

async function generateStudyPlan(text: string, title: string): Promise<StudyPlan> {
  try {
    const response = await fetch("/api/study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title })
    });

    if (!response.ok) {
      throw new Error("Study generation failed");
    }

    return (await response.json()) as StudyPlan;
  } catch {
    return createFallbackStudyPlan(text, title);
  }
}

async function extractPdfText(file: File) {
  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  const maxPages = Math.min(pdf.numPages, 18);

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str || "").join(" ");
    pages.push(pageText);
  }

  const text = pages.join("\n").trim();
  if (!text) {
    throw new Error("No PDF text extracted");
  }

  return text.slice(0, 22000);
}

function loadPdfJs(): Promise<PdfJs> {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error("PDF.js did not load"));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("PDF.js failed to load"));
    document.body.appendChild(script);
  });
}
