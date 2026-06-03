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

// Groq client — key stays on server, users never see it
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PROMPT = `You are a math tutor. Solve the given math problem and respond with ONLY valid JSON, no markdown, no extra text.

JSON format:
{
  "topic": "topic name like Algebra, Calculus, Geometry, Trigonometry, Statistics",
  "question_text": "the math problem as plain text",
  "steps": [
    {
      "step_number": 1,
      "title": "short step title",
      "explanation": "clear simple explanation",
      "expression": "math expression for this step"
    }
  ],
  "final_answer": "the final answer"
}

Rules:
- Minimum 3 steps, maximum 8 steps
- Simple beginner-friendly explanations
- If cannot solve, return: {"error": "reason"}
- Return ONLY JSON, nothing else`;

// Fix MIME type helper
function getCorrectMimeType(file) {
  let mimeType = file.mimetype || '';
  if (!mimeType.startsWith('image/') || mimeType === 'application/octet-stream') {
    const ext = (file.originalname || '').split('.').pop().toLowerCase();
    const mimeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    mimeType = mimeMap[ext] || 'image/jpeg';
  }
  return mimeType;
}

// Solve from image
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
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
            {
              type: 'text',
              text: PROMPT,
            },
          ],
        },
      ],
    });

    fs.unlinkSync(req.file.path);

    const text = response.choices[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
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

    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `${PROMPT}\n\nProblem: ${problem}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    console.error('Text error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MathSolve Pro - Groq' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));*/

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

const PROMPT = `You are an expert mathematics tutor. Solve the given math problem and respond with ONLY valid JSON, no markdown, no extra text.

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
  "final_answer": "the final answer"
}

TOPIC CLASSIFICATION - pick the most accurate one:
- Arithmetic (basic addition, subtraction, multiplication, division)
- Algebra (equations, variables, polynomials, factoring)
- Quadratic Equations (ax2+bx+c=0 type problems)
- Linear Equations (single variable equations)
- Simultaneous Equations (two or more equations)
- Geometry (shapes, area, perimeter, volume, angles)
- Trigonometry (sin, cos, tan, angles, triangles)
- Calculus (differentiation, integration, limits)
- Statistics (mean, median, mode, probability)
- Mensuration (area, surface area, volume of 3D shapes)
- Number Theory (HCF, LCM, prime numbers, divisibility)
- Percentage (%, discount, profit, loss)
- Ratio & Proportion (ratio, proportion, direct/inverse variation)
- Time & Work (work rate problems, pipes and cisterns)
- Time & Distance (speed, distance, time problems)
- Simple Interest (SI = PRT/100)
- Compound Interest (CI problems)
- Profit & Loss (cost price, selling price, profit, loss)
- Matrices (matrix operations, determinants)
- Vectors (vector operations, dot product, cross product)
- Complex Numbers (real, imaginary, complex plane)
- Logarithms (log, ln problems)
- Sequences & Series (AP, GP, HP)
- Permutation & Combination (nPr, nCr)
- Probability (events, outcomes, probability)
- Set Theory (union, intersection, sets)
- Other (if none of the above match)

Rules:
- Minimum 3 steps, maximum 8 steps
- Simple beginner-friendly explanations
- Be VERY accurate with topic - Time & Work is NOT Algebra
- If cannot solve, return: {"error": "reason"}
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

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MathSolve Pro - Groq' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));