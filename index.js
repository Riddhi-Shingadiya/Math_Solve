// server/index.js — Google Gemini (FREE)
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
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

// Solve from image
app.post('/api/solve/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const imageData = fs.readFileSync(req.file.path);
    const base64Image = imageData.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]);

    fs.unlinkSync(req.file.path);

    const text = result.response.text();
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

    const result = await model.generateContent(`${PROMPT}\n\nProblem: ${problem}`);
    const text = result.response.text();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    console.error('Text error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to solve' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MathSolve Pro - Gemini' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));