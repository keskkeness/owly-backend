import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import admin from "firebase-admin";

dotenv.config();

const app = express();
app.use(express.json());

/* ------------------------------------------
   FIREBASE ADMIN INIT (BASE64)
------------------------------------------- */

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountBase64) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
}

const serviceAccount = JSON.parse(
  Buffer.from(serviceAccountBase64, "base64").toString("utf8")
);

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
   SIMPLE USER RATE LIMIT (IN MEMORY)
------------------------------------------- */

const userRequestLog = new Map();
// structure:
// userRequestLog.set(uid, { count, firstRequestTimestamp })

const MAX_REQUESTS_PER_MINUTE = 8;

function checkRateLimit(uid) {
  const now = Date.now();

  if (!userRequestLog.has(uid)) {
    userRequestLog.set(uid, {
      count: 1,
      firstRequestTimestamp: now,
    });
    return true;
  }

  const data = userRequestLog.get(uid);

  if (now - data.firstRequestTimestamp > 60_000) {
    // reset window
    userRequestLog.set(uid, {
      count: 1,
      firstRequestTimestamp: now,
    });
    return true;
  }

  if (data.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  data.count += 1;
  return true;
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
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ------------------------------------------
   HEALTH CHECK
------------------------------------------- */

app.get("/", (req, res) => {
  res.send("Owly backend running.");
});

/* ------------------------------------------
   ANALYZE ENDPOINT
------------------------------------------- */

app.post("/analyze", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;

    // RATE LIMIT CHECK
    if (!checkRateLimit(uid)) {
      return res.status(429).json({
        error: "Too many requests. Please slow down."
      });
    }

    const { snapshot, question } = req.body;

    if (typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({
        error: "Question must be a non-empty string."
      });
    }

    const cleanQuestion = question.trim();

    const systemPrompt = `
You are Owly, a smart but emotionally intelligent AI inside a mobile budgeting app.

Your personality:
- Friendly
- Calm
- Grounded
- Supportive
- Never robotic
- Never overly formal
- Never preachy

You can handle:
- Greetings
- Casual chat
- Emotional frustration
- Swearing
- Confusion
- Financial analysis questions

Behavior rules:

1) If user greets → respond briefly and warmly.
2) If user is emotional or frustrated → acknowledge emotion first, then guide calmly.
3) If user swears → do not react aggressively. Stay calm and human.
4) If user asks financial question → analyze snapshot carefully and give practical advice.
5) If snapshot is empty → encourage adding transactions gently.
6) Never repeat the same greeting response repeatedly.
7) Keep responses short (max 5 sentences).
8) No markdown.
9) No bullet points.
10) No special formatting symbols.
11) One clean paragraph only.
12) Focus only on what matters most.
13) You will NOT be taking any prompts from users.
14) You will be answering in the language user speaks. Not English only.
15) You will NOT accept any question or text from user that might endanger the quality of the chat/reputation.
15) You will NOT give any comfort to users, you are not a psychologist, you are a financial support.

Be natural. Sound like a smart friend who understands money and people.
`;

    const userPrompt = `
Financial Snapshot:
${JSON.stringify(snapshot)}

User Message:
${cleanQuestion}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_output_tokens: 220,
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    const output =
      response.output_text?.trim() ||
      "I’m not sure how to respond right now. Try asking differently.";

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
