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

app.post("/analyze", async (req, res) => {
  try {
    const { snapshot, question } = req.body;

    // ---- VALIDATION ----
    if (!snapshot) {
      return res.status(400).json({ error: "Snapshot is required." });
    }

    if (typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "Question must be a non-empty string." });
    }

    // ---- OPENAI CALL ----
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: `
You are a strict financial analyst.

You are analyzing a user's real financial data.
Be direct, precise, and practical.
No fluff.
No motivational talk.
No disclaimers.

Financial snapshot:
${JSON.stringify(snapshot, null, 2)}

User question:
${question}

Provide:
1. Direct answer
2. Clear reasoning based on data
3. 2–3 actionable recommendations
`
    });

    res.json({
      result: response.output_text
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI analysis failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
