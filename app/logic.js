// WOLO-PURE core logic (no dependencies). Works in browser (window.WOLO) and Node.
(function (root) {
  const EVIDENCE = ['SOURCE-SUPPORTED CLAIM', 'ORAL TESTIMONY', 'CONTESTED ACCOUNT', 'UNKNOWN / NOT YET VERIFIED'];
  const SCOPES = ['private-to-contributor', 'household', 'approved-wider-use'];
  // PRODUCT HYPOTHESIS: review cadence in days; families may adjust or skip.
  const DEFAULT_CADENCE = [0, 3, 7, 30, 90];
  // Illustrative neutral prompts only. No heritage-specific facts.
  const PROMPTS = [
    { id: 'p1', cat: 'wellbeing', text: 'Pick a feeling word for today. Pass is fine.', hint: 'Look at the feeling faces.' },
    { id: 'p2', cat: 'household', text: 'Name one small way you could help the home today.', hint: 'Tidying, setting a table, a kind word.' },
    { id: 'p3', cat: 'language', text: 'Share a word from a language you choose, or ask someone about one.', hint: 'Listen only is okay.' },
    { id: 'p4', cat: 'stories', text: 'Ask a relative a question about a favourite memory (only if they are comfortable).', hint: 'Memories are ORAL TESTIMONY, not universal fact.' },
    { id: 'p5', cat: 'foodways', text: 'Describe a meal you enjoy. What makes it feel special?', hint: 'No need to share private details.' },
    { id: 'p6', cat: 'arts', text: 'Hum, draw or move for 30 seconds together.', hint: 'Any way counts.' },
    { id: 'p7', cat: 'values', text: 'What does fairness look like at home?', hint: 'Discussion, not a right answer.' },
    { id: 'p8', cat: 'contemporary', text: 'What is something new in your community that you like?', hint: 'Skip if unsure.' }
  ];

  function validateItem(it) {
    const errors = [], warnings = [];
    if (!it.title || !it.title.trim()) errors.push('Title is required.');
    if (!EVIDENCE.includes(it.evidence)) errors.push('Evidence label is required.');
    if (!SCOPES.includes(it.scope)) errors.push('Access scope is required.');
    if (it.scope !== 'private-to-contributor') {
      if (!it.consent || !it.consent.givenBy || !it.consent.date) errors.push('Consent (who and when) is required before sharing beyond the contributor.');
    }
    if (it.sacred) errors.push('Sacred, restricted or community-governed knowledge is not for this app.');
    if (it.evidence === 'SOURCE-SUPPORTED CLAIM' && !(it.source && (it.source.citation || it.source.url))) errors.push('Source-supported claims need a citation or URL.');
    if (it.evidence === 'UNKNOWN / NOT YET VERIFIED' || (!it.source && it.evidence !== 'ORAL TESTIMONY')) warnings.push('No source recorded; that is okay, it will be shown as unverified.');
    if (/\b(all|every|always|never)\b/i.test(it.body || '') && it.evidence !== 'ORAL TESTIMONY') warnings.push('Broad claim about a whole group? Consider noting variation by family, region and time.');
    return { ok: errors.length === 0, errors, warnings };
  }

  function withdraw(it, now) {
    return Object.assign({}, it, { status: 'withdrawn', scope: 'private-to-contributor', body: '', media: null,
      withdrawnAt: now, history: (it.history || []).concat([{ at: now, action: 'withdrawn (content removed; printed/downloaded copies cannot be recalled)' }]) });
  }
  function visibleItems(items, viewer) { // viewer: 'contributor:<name>' | 'household'
    return items.filter(i => i.status !== 'withdrawn' && (i.scope !== 'private-to-contributor' || viewer === 'contributor:' + i.contributor));
  }

  function nextReviewDate(learnedISO, reviewsDone, cadence) {
    cadence = cadence || DEFAULT_CADENCE;
    if (reviewsDone + 1 >= cadence.length) return null;
    const d = new Date(learnedISO); d.setUTCDate(d.getUTCDate() + cadence[reviewsDone + 1]); return d.toISOString().slice(0, 10);
  }

  const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 100)); // null = no data, never 0 by default
  function kpis(s) {
    const responded = s.activities.filter(a => a.response && a.response !== 'not-recorded');
    const joined = responded.filter(a => a.response === 'joined');
    const learned = s.learned || [];
    const shareable = s.items.filter(i => i.designatedForSharing && i.status !== 'withdrawn');
    return {
      offered: s.activities.length,
      voluntaryParticipationRate: pct(joined.length, responded.length),
      sessionCompletion: pct(s.sessions.filter(x => x.completed).length, s.sessions.length),
      reviewCoverage: pct(learned.filter(l => l.reviews > 0).length, learned.length),
      consentCompleteness: pct(shareable.filter(i => validateItem(i).ok).length, shareable.length)
    };
  }

  const THEMES = ['Languages', 'Oral history', 'History', 'Arts', 'Foodways', 'Traditions', 'Values', 'Contemporary life'];
  // Suggests a balanced rotation only; never infers which cultures to study. Family may override.
  function suggestTheme(monthIndex, skipped) {
    skipped = skipped || [];
    const pool = THEMES.filter(t => !skipped.includes(t));
    return pool.length ? pool[((monthIndex % pool.length) + pool.length) % pool.length] : null;
  }
  function dueReviews(learned, todayISO, cadence) {
    return learned.filter(l => !l.skipReviews).filter(l => { const n = nextReviewDate(l.learnedOn, l.reviews || 0, cadence); return n && n <= todayISO; });
  }
  // Practice days in the last 7 days against the person's OWN goal; null if no goal set.
  function languageConsistency(log, goalDays, todayISO) {
    if (!goalDays) return null;
    const end = new Date(todayISO).getTime(), start = end - 6 * 864e5;
    const days = new Set(log.filter(e => { const t = new Date(e.date).getTime(); return t >= start && t <= end; }).map(e => e.date));
    return { days: days.size, goal: goalDays, met: days.size >= goalDays };
  }
  const KPI_DICTIONARY = [
    { id: 'offered', name: 'Participation opportunities offered', formula: 'count of activities shown', source: 'Play together log', period: 'all time (local)', limits: 'Counts offers, not quality or need.' },
    { id: 'voluntaryParticipationRate', name: 'Voluntary participation rate', formula: 'joined / activities with a recorded response (pass counts as a response; not-recorded excluded)', source: 'Play together log', period: 'all time (local)', limits: 'Passing is healthy; a low rate is not a failure. Not a wellbeing measure.' },
    { id: 'sessionCompletion', name: 'Shared session completion', formula: 'sessions completed / sessions planned', source: 'Learning planner', period: 'all time (local)', limits: 'Plans may change for good reasons.' },
    { id: 'reviewCoverage', name: 'Learning review coverage', formula: 'learned items revisited at least once / learned items', source: 'Learning planner', period: 'all time (local)', limits: 'Revisiting is not mastery.' },
    { id: 'consentCompleteness', name: 'Consent completeness', formula: 'shareable items passing consent validation / items designated for sharing', source: 'Family stories', period: 'all time (local)', limits: 'Records that consent was logged, not that it was truly informed.' }
  ];
  const api = { THEMES, suggestTheme, dueReviews, languageConsistency, KPI_DICTIONARY, EVIDENCE, SCOPES, DEFAULT_CADENCE, PROMPTS, validateItem, withdraw, visibleItems, nextReviewDate, kpis };
  if (typeof module !== 'undefined') module.exports = api; else root.WOLO = api;
})(this);
