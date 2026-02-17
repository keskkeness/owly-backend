import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Owly backend running.");
});

/*
  Utility: detect small talk / greeting
*/
function isSmallTalk(text) {
  if (!text) return false;

  const normalized = text.toLowerCase().trim();

  const greetings = [
    "hi",
    "hello",
    "hey",
    "how are you",
    "what's up",
    "whats up",
    "good morning",
    "good evening",
    "selam",
    "naber"
  ];

  return greetings.some(g => normalized.includes(g));
}

/*
  Utility: detect finance intent
*/
function seemsFinancial(text) {
  if (!text) return false;

  const keywords = [
    "save",
    "spend",
    "budget",
    "money",
    "expense",
    "risk",
    "cash",
    "income",
    "financial",
    "overspend"
  ];

  const normalized = text.toLowerCase();

  return keywords.some(k => normalized.includes(k));
}

app.post("/analyze", async (req, res) => {
  try {
    const { snapshot, question } = req.body;

    // ---- BASIC VALIDATION ----
    if (typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "Question must be a non-empty string." });
    }

    const cleanQuestion = question.trim();

    // ---- SMALL TALK HANDLING ----
    if (isSmallTalk(cleanQuestion)) {
      return res.json({
        result: "Hey, I’m Owly. I’m doing great and keeping an eye on your spending. How can I help you today?"
      });
    }

    // ---- IF NO SNAPSHOT PROVIDED ----
    if (!snapshot || typeof snapshot !== "object") {
      return res.json({
        result: "I don’t have your financial data yet, but I’m ready whenever you are. Try adding some transactions and ask me again."
      });
    }

    // ---- PROMPT ----
    const prompt = `
You are Owly, a friendly AI inside a mobile budgeting app.

Personality:
- Warm, calm, supportive.
- Speak like a smart but friendly companion.
- Never robotic.
- Never formal financial analyst tone.
- Never use markdown, bullet points, symbols, or formatting.

Behavior Rules:
- If the user asks something non-financial, respond casually and briefly.
- If the user asks something financial, use the snapshot to guide them.
- Do not overanalyze.
- Do not list raw numbers unless truly important.
- Keep answers short (max 5-6 sentences).
- Give practical advice, not lectures.
- No headings.
- No numbering.
- No special characters like ** or ###.
- Return a single clean paragraph.

Financial Snapshot:
${JSON.stringify(snapshot)}

User Question:
${cleanQuestion}

Respond naturally as Owly.
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      max_output_tokens: 220,
      temperature: 0.4,
      input: prompt
    });

    const output =
      response.output_text?.trim() ||
      "Hmm, I couldn’t think of something useful right now. Try asking in a different way.";

    res.json({ result: output });

  } catch (error) {
    console.error("AI ERROR:", error);
    res.status(500).json({
      error: "Owly ran into an issue. Please try again."
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
