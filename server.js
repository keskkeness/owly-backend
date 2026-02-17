import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import admin from "firebase-admin";

dotenv.config();

const app = express();
app.use(express.json());

/* ------------------------------------------
   FIREBASE ADMIN INIT (BASE64 VERSION)
------------------------------------------- */

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountBase64) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(
    Buffer.from(serviceAccountBase64, "base64").toString("utf8")
  );
} catch (err) {
  throw new Error("Failed to parse FIREBASE_SERVICE_ACCOUNT");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/* ------------------------------------------
   OPENAI INIT
------------------------------------------- */

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ------------------------------------------
   HEALTH CHECK
------------------------------------------- */

app.get("/", (req, res) => {
  res.send("Owly backend running.");
});

/* ------------------------------------------
   SMALL TALK DETECTION
------------------------------------------- */

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

/* ------------------------------------------
   AUTH MIDDLEWARE
------------------------------------------- */

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Invalid Firebase token:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ------------------------------------------
   ANALYZE ENDPOINT
------------------------------------------- */

app.post("/analyze", verifyFirebaseToken, async (req, res) => {
  try {
    const { snapshot, question } = req.body;

    if (typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({
        error: "Question must be a non-empty string."
      });
    }

    const cleanQuestion = question.trim();

    // Small talk response (no AI call needed)
    if (isSmallTalk(cleanQuestion)) {
      return res.json({
        result:
          "Hey, I’m Owly. I’m doing great and keeping an eye on your spending. How can I help you today?"
      });
    }

    if (!snapshot || typeof snapshot !== "object") {
      return res.json({
        result:
          "I don’t have enough financial data yet. Try adding some transactions and ask me again."
      });
    }

    const prompt = `
You are Owly, a friendly AI inside a mobile budgeting app.

Personality:
- Warm
- Calm
- Supportive
- Human
- Not robotic
- Not a strict financial analyst

Rules:
- Keep responses short (max 5 sentences)
- No markdown
- No bullet points
- No symbols like ** or ###
- One clean paragraph
- Be practical
- Only focus on what matters most

Financial Snapshot:
${JSON.stringify(snapshot)}

User Question:
${cleanQuestion}

Respond naturally as Owly.
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_output_tokens: 200,
      input: prompt
    });

    const output =
      response.output_text?.trim() ||
      "Hmm, I couldn’t think of something useful right now. Try asking differently.";

    res.json({ result: output });

  } catch (error) {
    console.error("AI ERROR:", error);

    res.status(500).json({
      error: "Owly ran into an issue. Please try again."
    });
  }
});

/* ------------------------------------------
   START SERVER
------------------------------------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
