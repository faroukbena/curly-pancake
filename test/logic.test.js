const assert = require('assert');
const W = require('../app/logic.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
const base = { title: 'T', evidence: 'ORAL TESTIMONY', scope: 'private-to-contributor', contributor: 'A', body: 'x' };
t('private item valid without consent', () => assert(W.validateItem(base).ok));
t('household share needs consent', () => assert(!W.validateItem({ ...base, scope: 'household' }).ok));
t('household share ok with consent', () => assert(W.validateItem({ ...base, scope: 'household', consent: { givenBy: 'A', date: '2026-01-01' } }).ok));
t('sacred rejected', () => assert(!W.validateItem({ ...base, sacred: true }).ok));
t('sourced claim needs source', () => assert(!W.validateItem({ ...base, evidence: 'SOURCE-SUPPORTED CLAIM' }).ok));
t('broad claim warns', () => assert(W.validateItem({ ...base, evidence: 'UNKNOWN / NOT YET VERIFIED', body: 'They all do this' }).warnings.length > 0));
t('withdraw clears body and hides', () => { const w = W.withdraw({ ...base, scope: 'household' }, 'now'); assert.strictEqual(w.body, ''); assert.strictEqual(W.visibleItems([w], 'household').length, 0); });
t('private hidden from household', () => { assert.strictEqual(W.visibleItems([base], 'household').length, 0); assert.strictEqual(W.visibleItems([base], 'contributor:A').length, 1); });
t('review schedule', () => { assert.strictEqual(W.nextReviewDate('2026-01-01', 1), '2026-01-08'); assert.strictEqual(W.nextReviewDate('2026-01-01', 4), null); });
t('kpis handle empty and pass', () => {
  const k = W.kpis({ activities: [{ response: 'joined' }, { response: 'pass' }, { response: 'not-recorded' }], sessions: [], learned: [], items: [] });
  assert.strictEqual(k.offered, 3); assert.strictEqual(k.voluntaryParticipationRate, 50); assert.strictEqual(k.sessionCompletion, null);
});
console.log(n + ' tests passed');
