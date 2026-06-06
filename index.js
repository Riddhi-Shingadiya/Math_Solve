/*
// server/index.js — Groq (FREE - 14400 requests/day)
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const Groq = require('groq-sdk');

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

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PROMPT = `You are an expert mathematics professor. Solve the given math problem with 100% accuracy.

IMPORTANT: Think step by step carefully before answering. Double check all calculations.

JSON format:
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

TOPIC CLASSIFICATION - pick the most accurate one:
- Arithmetic, Algebra, Quadratic Equations, Linear Equations
- Simultaneous Equations, Geometry, Trigonometry, Calculus
- Statistics, Mensuration, Number Theory, Percentage
- Ratio & Proportion, Time & Work, Time & Distance
- Simple Interest, Compound Interest, Profit & Loss
- Matrices, Vectors, Complex Numbers, Logarithms
- Sequences & Series, Permutation & Combination
- Probability, Set Theory, Other

CALCULATION RULES - follow strictly:
- ALWAYS verify your answer by substituting back
- For Time & Work: Rate = Work/Time, Combined Rate = Rate1 + Rate2, Time = Work/Combined Rate
- For Time & Distance: Distance = Speed × Time
- For Percentage: (Value/Total) × 100
- For SI: (P × R × T) / 100
- For Profit/Loss: Profit = SP - CP, Profit% = (Profit/CP) × 100
- For Quadratic: use formula x = (-b ± √(b²-4ac)) / 2a
- Show ALL necessary steps, do not skip any
- Each step must have a clear expression
- final_answer must include unit if problem has units
- If NOT a math problem return: {"error": "This doesn't look like a math problem. Please upload a clear photo of a math question."}
- If text NOT math related return: {"error": "This doesn't seem to be a math problem. Please enter a valid math question."}
- Return ONLY JSON, nothing else`;

function getCorrectMimeType(file) {
  let mimeType = file.mimetype || '';
  if (!mimeType.startsWith('image/') || mimeType === 'application/octet-stream') {
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    mimeType = mimeMap[ext] || 'image/jpeg';
  }
  return mimeType;
}

app.post('/api/solve/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString('base64');
    const mimeType = getCorrectMimeType(req.file);
    console.log('File:', req.file.originalname, '| MIME:', mimeType);
    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 2048,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    fs.unlinkSync(req.file.path);
    const text = response.choices[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(clean));
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Image error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

app.post('/api/solve/text', async (req, res) => {
  try {
    const { problem } = req.body;
    if (!problem?.trim()) return res.status(400).json({ error: 'No problem provided' });
    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 2048,
      temperature: 0,
      messages: [{ role: 'user', content: `${PROMPT}\n\nProblem: ${problem}` }],
    });
    const text = response.choices[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(clean));
  } catch (err) {
    console.error('Text error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

// Get short trick for a problem
app.post('/api/trick', async (req, res) => {
  try {
    const { question, topic } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'No question provided' });

    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 512,
      temperature: 0,
      messages: [{
        role: 'user',
content: `You are a math trick generator like a smart tutor.
Problem: ${question}
Topic: ${topic}

Respond with ONLY valid JSON, no markdown:
{
  "trick_title": "short title max 5 words",
  "trick": "Show step by step substitution exactly like this example:\nCombined time = (A×B)/(A+B) × (Required/Total)\n= (8×10)/(8+10) × (30/60)\n= 80/18 × 0.5\n= 2.22 hours ✅",
  "formula": "General formula only. Example: T = (A×B)/(A+B) × (Part/Total)"
}

STRICT Rules:
- trick must show: formula name = general formula, then = values substituted, then = simplified, then = final answer ✅
- Each step on new line starting with =
- formula field must use letters only
- Be 100% mathematically correct
- No extra explanation`,
      }],
    });

  const text = response.choices[0]?.message?.content || '{}';
  const clean = text
    .replace(/```json|```/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') // remove control characters
    .trim();

  // Parse and re-sanitize values
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

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MathSolve Pro - Groq' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));*/

// server/index.js — Google Gemini 1.5 Pro (FREE - better math accuracy)
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
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

// Gemini 1.5 Pro client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
  generationConfig: { temperature: 0 },
});

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

TOPIC CLASSIFICATION - pick most accurate:
- Arithmetic, Algebra, Quadratic Equations, Linear Equations
- Simultaneous Equations, Geometry, Trigonometry, Calculus
- Statistics, Mensuration, Number Theory, Percentage
- Ratio & Proportion, Time & Work, Time & Distance
- Simple Interest, Compound Interest, Profit & Loss
- Matrices, Vectors, Complex Numbers, Logarithms
- Sequences & Series, Permutation & Combination
- Probability, Set Theory, Other

CALCULATION RULES:
- ALWAYS verify answer by substituting back
- For Time & Work: Rate = Work/Time, Combined Rate = Rate1 + Rate2, Time = Work/Combined Rate
- For Time & Distance: Distance = Speed × Time
- For Percentage: (Value/Total) × 100
- For SI: (P × R × T) / 100
- For Profit/Loss: Profit = SP - CP, Profit% = (Profit/CP) × 100
- For Quadratic: x = (-b ± √(b²-4ac)) / 2a
- For Monkey/Snail pole problems: simulate step by step, check if top reached during climb before slip
- Show ALL necessary steps, do not skip any
- final_answer must include unit if problem has units
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

// Solve from image
app.post('/api/solve/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString('base64');
    const mimeType = getCorrectMimeType(req.file);

    console.log('File:', req.file.originalname, '| MIME:', mimeType);

    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]);

    fs.unlinkSync(req.file.path);

    const text = result.response.text();
    res.json(parseResponse(text));
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Image error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

// Solve from text
app.post('/api/solve/text', async (req, res) => {
  try {
    const { problem } = req.body;
    if (!problem?.trim()) return res.status(400).json({ error: 'No problem provided' });

    const result = await model.generateContent(`${PROMPT}\n\nProblem: ${problem}`);
    const text = result.response.text();
    res.json(parseResponse(text));
  } catch (err) {
    console.error('Text error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

// Get short trick
app.post('/api/trick', async (req, res) => {
  try {
    const { question, topic } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'No question provided' });

    const result = await model.generateContent(
      `${TRICK_PROMPT}\n\nProblem: ${question}\nTopic: ${topic}`
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

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MathSolve Pro - Gemini 1.5 Pro' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

/*
{
  "name": "mathsolve-pro-server",
  "version": "1.0.0",
  "description": "MathSolve Pro backend - Groq",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "groq-sdk": "^0.9.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "multer": "^1.4.5-lts.1"
  }
}*/