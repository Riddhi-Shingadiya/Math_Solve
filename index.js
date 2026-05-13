// server/index.js
// Deploy this on Railway / Render / VPS
// Set ANTHROPIC_API_KEY as environment variable on your server

const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

// ── Middleware ──
app.use(cors());
app.use(express.json());

// Rate limiting per IP — 100 requests/hour
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// ── Anthropic client — API key stays on server only ──
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Set this in your server env vars
});

const SYSTEM_PROMPT = `
You are MathSolve Pro, an expert mathematics tutor. When given a math problem (as text or image), respond with ONLY valid JSON — no markdown, no extra text.

JSON format:
{
  "topic": "short topic name like Algebra, Calculus, Geometry, Trigonometry, Statistics, etc.",
  "question_text": "the extracted math problem as plain text",
  "steps": [
    {
      "step_number": 1,
      "title": "short title for this step",
      "explanation": "clear explanation in simple English",
      "expression": "the math expression or equation for this step"
    }
  ],
  "final_answer": "the final answer as a clean expression"
}

Rules:
- Always show at least 3 steps, maximum 8 steps
- Explanations must be beginner-friendly
- If you cannot solve, return: {"error": "reason"}
`;

// ── Solve from image ──
app.post('/api/solve/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            { type: 'text', text: 'Solve this math problem. Return ONLY JSON.' },
          ],
        },
      ],
    });

    // Cleanup temp file
    fs.unlinkSync(req.file.path);

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    res.json(result);
  } catch (err) {
    if (req.file?.path) fs.unlinkSync(req.file.path).catch?.(() => {});
    console.error('Image solve error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve problem' });
  }
});

// ── Solve from text ──
app.post('/api/solve/text', async (req, res) => {
  try {
    const { problem } = req.body;
    if (!problem?.trim()) {
      return res.status(400).json({ error: 'No problem text provided' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Solve this math problem: ${problem}\nReturn ONLY JSON.`,
        },
      ],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    res.json(result);
  } catch (err) {
    console.error('Text solve error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve problem' });
  }
});

// ── Health check ──
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MathSolve Pro API' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MathSolve Pro server running on port ${PORT}`));
