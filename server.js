import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/analyze", async (req, res) => {
  try {
    const snapshot = req.body;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: "You are a strict financial analyst. Use numeric reasoning.",
      input: `Financial snapshot:\n${JSON.stringify(snapshot)}\n\nUser question: ${req.body.question}`,
    });

    res.json({ result: response.output_text });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Owly backend running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
