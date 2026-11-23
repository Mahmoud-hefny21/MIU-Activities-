const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  attemptId: { type: String, required: true, unique: true },
  scores: [{ _id: false, clubId: { type: Number, required: true }, points: { type: Number, required: true, min: 0 } }]
}, { timestamps: true });
const QuizSubmission = require('../database').bindModel(mongoose.models.QuizSubmission || mongoose.model('QuizSubmission', schema));

// Same quiz engine as the browser (public/assets/js/quiz.js), run on the server so points cannot be faked.
const context = vm.createContext({ window: undefined });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/js/quiz.js'), 'utf8'), context, { filename: 'quiz.js' });
const engine = context.MiuQuizEngine;

// Top 3 clubs for these answers get 3, 2 and 1 points.
function scoreSubmission(body, clubs = []) {
  const answers = body?.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || !engine.validAnswers(answers)) return null;
  const top = engine.recommend(clubs, answers);
  return { scores: top.map((row, index) => ({ clubId: Number(row.club.id), points: 3 - index })) };
}

// Account submissions use a separate key namespace from older anonymous attempts.
const accountSubmissions = { attemptId: { $gte: 'account:', $lt: 'account;' } };
// Only records in the current format count: at most three clubs scoring 3, 2 and 1. Records saved by an
// older scoring version (which added points up across retakes) are left out of the totals.
const validScores = scores => Array.isArray(scores) && scores.length <= 3
  && JSON.stringify(scores.map(row => Number(row.points)).sort((a, b) => b - a)) === JSON.stringify([3, 2, 1].slice(0, scores.length))
  && new Set(scores.map(row => Number(row.clubId))).size === scores.length;

function registerQuizAnalytics(app, { requireAdmin, requireLiveDatabase, getClubs, getAccountEmail, model = QuizSubmission }) {
  const safe = handler => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requireLiveDatabase(res)) return;
    try { await handler(req, res); } catch (error) {
      console.error('Quiz analytics unavailable:', error.name);
      res.status(503).json({ message: 'Quiz points are temporarily unavailable. Please try again.' });
    }
  };
  app.post('/api/quiz/submissions', safe(async (req, res) => {
    const submission = scoreSubmission(req.body, getClubs());
    if (!submission) return res.status(400).json({ message: 'Complete all quiz questions with valid answers.' });
    const email = String(await getAccountEmail(req, res) || '').trim().toLowerCase();
    if (!email) return res.status(401).json({ message: 'Sign in to have your quiz points counted.' });
    // The server session determines identity; changing browser IDs, retaking or
    // using another device cannot give the same account another set of points.
    submission.attemptId = 'account:' + crypto.createHash('sha256').update(email).digest('hex');
    try {
      await model.findOneAndUpdate({ attemptId: submission.attemptId }, { $set: submission }, { upsert: true, runValidators: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await model.findOneAndUpdate({ attemptId: submission.attemptId }, { $set: submission }, { runValidators: true });
    }
    res.json({ saved: true });
  }));
  app.get('/api/admin/quiz-points', requireAdmin, safe(async (req, res) => {
    const records = (await model.aggregate([{ $match: accountSubmissions }])).filter(record => validScores(record.scores));
    const totalSubmissions = records.length;
    const byId = new Map();
    for (const record of records) for (const row of record.scores) byId.set(Number(row.clubId), (byId.get(Number(row.clubId)) || 0) + Number(row.points));
    const clubs = new Map();
    for (const club of getClubs()) clubs.set(Number(club.id), { clubId: Number(club.id), name: club.name });
    res.json({ totalSubmissions, clubs: [...clubs.values()].map(club => ({ ...club, points: byId.get(club.clubId) || 0 }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)) });
  }));
}
module.exports = { QuizSubmission, scoreSubmission, registerQuizAnalytics, validScores };
