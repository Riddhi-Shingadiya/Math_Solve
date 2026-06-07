// server/index.js — Google Gemini with API Key Rotation (FREE - unlimited!)
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// ── API Key Rotation ──
const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean);

if (apiKeys.length === 0) {
  console.error('No Gemini API keys found! Set GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.');
  process.exit(1);
}

let currentKeyIndex = 0;

function getModel() {
  const key = apiKeys[currentKeyIndex];
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
    generationConfig: { temperature: 0 },
  });
}

function rotateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  console.log(`Rotated to API key ${currentKeyIndex + 1} of ${apiKeys.length}`);
}

async function generateWithRotation(contentFn) {
  let lastError;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    try {
      const model = getModel();
      return await contentFn(model);
    } catch (err) {
      lastError = err;
      if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many Requests')) {
        console.log(`Key ${currentKeyIndex + 1} hit rate limit, rotating...`);
        rotateKey();
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// ── Prompts ──
const PROMPT = `You are an expert mathematics professor. Solve the given math problem with 100% accuracy.

IMPORTANT: Think step by step carefully. Double check ALL calculations before answering.

Respond with ONLY valid JSON, no markdown, no extra text:
{
  "topic": "exact topic name from the list below",
  "question_text": "the math problem as plain text",
  "steps": [
    {
      "step_number": 1,
      "title": "short step title",
      "explanation": "clear simple explanation",
      "expression": "math expression for this step"
    }
  ],
  "final_answer": "the final answer with unit"
}

TOPIC CLASSIFICATION - pick ONLY ONE topic from this list:
- Arithmetic
- Algebra
- Quadratic Equations
- Linear Equations
- Simultaneous Equations
- Geometry
- Trigonometry
- Calculus
- Statistics
- Mensuration
- Number Theory
- Percentage
- Ratio & Proportion
- Time & Work
- Time & Distance
- Simple Interest
- Compound Interest
- Profit & Loss
- Matrices
- Vectors
- Complex Numbers
- Logarithms
- Sequences & Series
- Permutation & Combination
- Probability
- Set Theory
- Other

CALCULATION RULES:
- ALWAYS verify answer by substituting back
- For Time & Work: Rate = Work/Time, Combined Rate = Rate1 + Rate2, Time = Work/Combined Rate
- For Time & Distance: Distance = Speed x Time
- For Percentage: (Value/Total) x 100
- For SI: (P x R x T) / 100
- For Profit/Loss: Profit = SP - CP, Profit% = (Profit/CP) x 100
- For Quadratic: x = (-b +/- sqrt(b^2-4ac)) / 2a
- For Monkey/Snail pole problems: simulate step by step, check if top reached during climb before slip
- topic must be ONE single topic only, never write multiple topics
- expression must be plain text only, NO LaTeX, NO backslashes
- Show ALL necessary steps, do not skip any
- final_answer must include unit if problem has units
- "final_answer" must be SHORT and CLEAN — include the value WITH unit
- If NOT a math problem return: {"error": "This doesn't look like a math problem. Please upload a clear photo of a math question."}
- If text NOT math related return: {"error": "This doesn't seem to be a math problem. Please enter a valid math question."}
- Return ONLY JSON, nothing else`;

const TRICK_PROMPT = `You are a math trick generator like a smart tutor.

Respond with ONLY valid JSON, no markdown:
{
  "trick_title": "short title max 5 words",
  "trick": "Show step by step substitution with actual values from the problem. Format: Formula = general form, then = values substituted, then = simplified, then = final answer",
  "formula": "General formula using letters only"
}

STRICT Rules:
- Be 100% mathematically correct
- Each calculation step on new line
- formula field must use letters only
- No extra explanation`;

function getCorrectMimeType(file) {
  let mimeType = file.mimetype || '';
  if (!mimeType.startsWith('image/') || mimeType === 'application/octet-stream') {
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    mimeType = mimeMap[ext] || 'image/jpeg';
  }
  return mimeType;
}

function parseResponse(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── Solve from image ──
app.post('/api/solve/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString('base64');
    const mimeType = getCorrectMimeType(req.file);
    console.log('File:', req.file.originalname, '| MIME:', mimeType);

    const result = await generateWithRotation((model) =>
      model.generateContent([
        PROMPT,
        { inlineData: { data: base64Image, mimeType } },
      ])
    );

    fs.unlinkSync(req.file.path);
    const text = result.response.text();
    res.json(parseResponse(text));
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Image error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

// ── Solve from text ──
app.post('/api/solve/text', async (req, res) => {
  try {
    const { problem } = req.body;
    if (!problem?.trim()) return res.status(400).json({ error: 'No problem provided' });

    const result = await generateWithRotation((model) =>
      model.generateContent(`${PROMPT}\n\nProblem: ${problem}`)
    );

    const text = result.response.text();
    res.json(parseResponse(text));
  } catch (err) {
    console.error('Text error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

// ── Get short trick ──
app.post('/api/trick', async (req, res) => {
  try {
    const { question, topic } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'No question provided' });

    const result = await generateWithRotation((model) =>
      model.generateContent(`${TRICK_PROMPT}\n\nProblem: ${question}\nTopic: ${topic}`)
    );

    const text = result.response.text();
    const clean = text
      .replace(/```json|```/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .trim();

    const parsed = JSON.parse(clean);
    const sanitized = {
      trick_title: (parsed.trick_title || '').replace(/\n/g, ' ').trim(),
      trick: (parsed.trick || '').replace(/\\n/g, '\n').trim(),
      formula: (parsed.formula || '').replace(/\n/g, ' ').trim(),
    };
    res.json(sanitized);
  } catch (err) {
    console.error('Trick error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to get trick' });
  }
});

// ── Health check ──
app.get('/health', (_, res) => res.json({
  status: 'ok',
  service: 'MathSolve Pro - Gemini',
  keys: apiKeys.length,
  currentKey: currentKeyIndex + 1,
}));

// ── Keep server awake ──
setInterval(() => {
  https.get('https://math-solve-w394.onrender.com/health', (res) => {
    console.log('Keep alive ping:', res.statusCode);
  }).on('error', (err) => {
    console.log('Ping error:', err.message);
  });
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Loaded ${apiKeys.length} API key(s)`);
});