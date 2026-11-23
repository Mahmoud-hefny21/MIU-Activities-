// "Find your club" quiz: 10 short questions, then the 3 best-matching clubs.
// Works for every club on the site (template rule): each club's interests are read from its own
// name, category, tagline and description, so new clubs are included automatically.
// The same engine runs in the browser and on the server (services/quiz-analytics.js scores it again).
(function (root) {
  'use strict';

  // Interest tags and the words that reveal them in a club's details.
  const TAGS = {
    tech: { label: 'technology', words: ['tech', 'code', 'coding', 'program', 'software', 'engineer', 'ieee', 'computer', 'developer', 'microsoft', 'msp', 'acpc', 'hackathon', 'robot', ' ai ', 'artificial', 'web', 'app', 'activex', 'data', 'cyber', 'electronic'] },
    debate: { label: 'debate & public speaking', words: ['debate', 'united nations', 'mun', 'diplomac', 'public speaking', 'politic', 'negotiat', 'model ', 'parliament', 'speech'] },
    art: { label: 'art & design', words: ['art', 'design', 'draw', 'paint', 'photo', 'jewel', 'craft', 'creative', 'visual', 'fashion', 'handmade'] },
    performance: { label: 'stage & music', words: ['theat', 'drama', 'acting', 'music', 'sing', 'band', 'perform', 'stage', 'dance', 'tuner', 'tunner', 'choir'] },
    business: { label: 'business & careers', words: ['business', 'entrepreneur', 'startup', 'marketing', 'finance', 'career', 'aiesec', 'pace', 'cdc', 'workshop', 'warsha', 'econom', 'professional', 'employ', 'internship'] },
    community: { label: 'helping the community', words: ['volunteer', 'charity', 'community', 'social', 'impact', 'sustainab', 'environment', 'donat', 'help', 'awareness', 'entity'] },
    health: { label: 'health', words: ['health', 'medical', 'medicine', 'pharma', 'dental', 'first aid', 'ihepc', 'hospital', 'blood', 'wellbeing', 'nutrition'] },
    media: { label: 'media & storytelling', words: ['media', 'ted', 'talk', 'film', 'video', 'content', 'writ', 'rawi', 'story', 'journal', 'podcast', 'idea'] },
    games: { label: 'gaming', words: ['game', 'gaming', 'esport', 'gamer', 'tournament', 'play'] },
    leadership: { label: 'leadership', words: ['leader', 'lead', 'manag', 'innovation', 'utopia', 'initiative', 'organiz', 'team'] },
    international: { label: 'international culture', words: ['international', 'exchange', 'global', 'travel', 'cultur', 'world', 'language', 'abroad'] }
  };

  const QUESTIONS = [
    { id: 'q1', text: 'What do you enjoy most?', options: [['💻', 'Tech & coding', { tech: 3 }], ['🎨', 'Art & design', { art: 3 }], ['🎭', 'Stage & music', { performance: 3 }], ['🤝', 'Helping people', { community: 2, health: 1 }], ['💼', 'Business', { business: 3 }], ['🎮', 'Gaming', { games: 3 }]] },
    { id: 'q2', text: 'Pick a weekend plan', options: [['🧩', 'A hackathon', { tech: 2 }], ['🎤', 'A talk or workshop', { media: 1, business: 1 }], ['🌱', 'Volunteering', { community: 2 }], ['🎬', 'A show or rehearsal', { performance: 2 }], ['🕹️', 'A game tournament', { games: 2 }]] },
    { id: 'q3', text: 'Which skill do you want?', options: [['⌨️', 'Coding', { tech: 2 }], ['🗣️', 'Public speaking', { debate: 2, leadership: 1 }], ['✏️', 'Design', { art: 2 }], ['🧭', 'Leading a team', { leadership: 2, business: 1 }], ['📖', 'Storytelling', { media: 2 }]] },
    { id: 'q4', text: 'In a team, you are…', options: [['📋', 'The planner', { leadership: 2 }], ['💡', 'The creative', { art: 1, media: 1 }], ['🔧', 'The problem-solver', { tech: 2 }], ['📣', 'The speaker', { debate: 2 }], ['💛', 'The helper', { community: 2 }]] },
    { id: 'q5', text: 'What would you read about?', options: [['🤖', 'Tech & AI', { tech: 2 }], ['🌍', 'World news', { debate: 1, international: 1 }], ['🩺', 'Health', { health: 2 }], ['📈', 'Startups & money', { business: 2 }], ['🎞️', 'Movies & stories', { media: 1, performance: 1 }]] },
    { id: 'q6', text: 'Pick an event', options: [['🏆', 'Coding contest', { tech: 2 }], ['🏛️', 'Debate conference', { debate: 2 }], ['❤️', 'Charity campaign', { community: 1, health: 1 }], ['🎶', 'Concert or play', { performance: 2 }], ['🎙️', 'TED-style talk', { media: 2 }]] },
    { id: 'q7', text: 'How do you like to work?', options: [['🎉', 'With big crowds', { performance: 1, debate: 1 }], ['👥', 'In a small team', { tech: 1, art: 1 }], ['🔀', 'A bit of both', { leadership: 1 }], ['🙋', 'One-to-one, helping', { health: 1, community: 1 }]] },
    { id: 'q8', text: 'Your dream impact', options: [['📱', 'Build an app', { tech: 2 }], ['⚖️', 'Change opinions', { debate: 2 }], ['📢', 'Raise awareness', { health: 1, community: 1 }], ['🚀', 'Start a business', { business: 2 }], ['😄', 'Entertain people', { performance: 1, games: 1 }]] },
    { id: 'q9', text: 'Other cultures & travel?', options: [['✈️', 'Love it', { international: 2 }], ['🙂', 'Sometimes', { international: 1 }], ['🏠', 'Not really', {}]] },
    { id: 'q10', text: 'What do you like making?', options: [['🤖', 'Code or robots', { tech: 2 }], ['📸', 'Photos or videos', { media: 1, art: 1 }], ['💍', 'Crafts or jewellery', { art: 2 }], ['🗓️', 'Plans & events', { leadership: 1, business: 1 }], ['♟️', 'Game strategies', { games: 2 }]] }
  ].map(q => ({ ...q, options: q.options.map(([icon, label, tags], i) => ({ id: q.id + String.fromCharCode(97 + i), icon, label, tags })) }));

  const normalize = text => ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ') + ' ';

  // How strongly a club relates to each tag (name counts double).
  function clubProfile(club) {
    const name = normalize(club.name), details = normalize([club.committee, club.category, club.tagline, club.description].join(' '));
    const profile = {};
    for (const [tag, { words }] of Object.entries(TAGS)) {
      let score = 0;
      for (const word of words) { const w = word.trim(); if (!w) continue; if (name.includes(w)) score += 2; if (details.includes(w)) score += 1; }
      if (score) profile[tag] = Math.min(score, 4);
    }
    return profile;
  }

  function userTags(answers) {
    const tags = {};
    for (const q of QUESTIONS) {
      const option = q.options.find(o => o.id === answers[q.id]);
      if (option) for (const [tag, value] of Object.entries(option.tags)) tags[tag] = (tags[tag] || 0) + value;
    }
    return tags;
  }

  // Top clubs for these answers; closed clubs are left out.
  function recommend(clubs, answers, count = 3) {
    const tags = userTags(answers);
    const rows = (clubs || []).filter(club => club && club.status !== 'closed').map(club => {
      const profile = clubProfile(club);
      let score = 0; const reasons = [];
      for (const [tag, weight] of Object.entries(tags)) if (profile[tag]) { score += weight * profile[tag]; reasons.push([tag, weight * profile[tag]]); }
      return { club, score, reasons: reasons.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([tag]) => TAGS[tag].label) };
    }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || String(a.club.name).localeCompare(String(b.club.name)));
    const top = rows[0]?.score || 1;
    return rows.slice(0, count).map(row => ({ ...row, match: Math.max(40, Math.min(98, Math.round(50 + 48 * Math.pow(row.score / top, 2)))) }));
  }

  const validAnswers = answers => answers && typeof answers === 'object' && QUESTIONS.every(q => q.options.some(o => o.id === answers[q.id]));

  const engine = { TAGS, QUESTIONS, clubProfile, userTags, recommend, validAnswers };
  root.MiuQuizEngine = engine;
  if (typeof document === 'undefined' || typeof window === 'undefined' || root !== window) return;

  // ---------------- Browser UI ----------------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let dialog, answers = {}, step = 0, clubsPromise;

  const loadClubs = () => clubsPromise ||= fetch('/api/clubs', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).catch(() => []);

  function open() {
    void loadClubs();
    answers = {}; step = 0;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'fq-dialog'; dialog.setAttribute('aria-labelledby', 'fqTitle');
      dialog.addEventListener('close', () => document.documentElement.classList.remove('quiz-scroll-lock'));
      dialog.addEventListener('click', event => {
        if (event.target === dialog || event.target.closest('[data-fq-close]')) return dialog.close();
        const option = event.target.closest('[data-fq-option]');
        if (option) { answers[QUESTIONS[step].id] = option.dataset.fqOption; option.classList.add('is-picked'); setTimeout(() => { step++; render(); }, 180); return; }
        if (event.target.closest('[data-fq-back]') && step > 0) { step--; render(); }
        if (event.target.closest('[data-fq-retake]')) { answers = {}; step = 0; render(); }
      });
      document.body.append(dialog);
    }
    render();
    document.documentElement.classList.add('quiz-scroll-lock');
    if (!dialog.open) dialog.showModal();
  }

  function render() {
    if (step >= QUESTIONS.length) return void renderResults();
    const q = QUESTIONS[step];
    dialog.innerHTML = `<div class="fq-card">
      <header class="fq-head"><span class="fq-step">Question ${step + 1} of ${QUESTIONS.length}</span><button type="button" class="fq-close" data-fq-close aria-label="Close quiz">&times;</button></header>
      <div class="fq-progress" aria-hidden="true"><i data-pct="${Math.round(step / QUESTIONS.length * 100)}"></i></div>
      <h2 id="fqTitle" class="fq-question">${esc(q.text)}</h2>
      <div class="fq-options">${q.options.map(o => `<button type="button" class="fq-option${answers[q.id] === o.id ? ' is-picked' : ''}" data-fq-option="${o.id}"><span class="fq-icon" aria-hidden="true">${o.icon}</span><span>${esc(o.label)}</span></button>`).join('')}</div>
      <footer class="fq-foot">${step ? '<button type="button" class="fq-link" data-fq-back>← Back</button>' : '<span></span>'}<span class="fq-hint">Tap an answer</span></footer>
    </div>`;
    dialog.querySelectorAll('[data-pct]').forEach((bar) => { bar.style.width = bar.dataset.pct + '%'; });
    dialog.querySelector('.fq-option')?.focus({ preventScroll: true });
  }

  async function renderResults() {
    dialog.innerHTML = '<div class="fq-card"><p class="fq-step">Finding your clubs…</p></div>';
    const clubs = await loadClubs();
    const top = recommend(clubs, answers);
    dialog.innerHTML = `<div class="fq-card">
      <header class="fq-head"><span class="fq-step">Your top ${top.length || ''} club${top.length === 1 ? '' : 's'}</span><button type="button" class="fq-close" data-fq-close aria-label="Close quiz">&times;</button></header>
      <h2 id="fqTitle" class="fq-question">Clubs that match you</h2>
      ${top.length ? `<ol class="fq-results">${top.map((row, i) => {
        const c = row.club, image = (window.miuImage || String)(c.image || '', 160);
        return `<li class="fq-result"><span class="fq-medal" aria-hidden="true">${['🥇', '🥈', '🥉'][i]}</span>
          ${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : ''}
          <div class="fq-result-text"><strong>${esc(c.name)}</strong><span class="fq-match">${row.match}% match</span><small>Because you like ${esc(row.reasons.join(' and '))}.</small></div>
          <a class="primary-btn fq-view" href="/?club=${encodeURIComponent(c.id)}">${c.status === 'open' ? 'View & apply' : 'View club'}</a></li>`;
      }).join('')}</ol>` : '<p class="fq-empty">No open clubs match yet. Browse all clubs on the home page.</p>'}
      <footer class="fq-foot"><button type="button" class="fq-link" data-fq-retake>↺ Retake quiz</button><a class="fq-link" href="/?explore=clubs">See all clubs</a></footer>
    </div>`;
    dialog.querySelectorAll('.fq-result img').forEach(img => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }));
    // Signed-in accounts add their result to the admin's "Club quiz points".
    fetch('/api/quiz/submissions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId: crypto.randomUUID ? crypto.randomUUID() : undefined, answers }) }).catch(() => {});
  }

  window.MiuQuiz = { open };
})(typeof window !== 'undefined' ? window : globalThis);
