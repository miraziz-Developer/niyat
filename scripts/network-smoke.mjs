import assert from 'node:assert/strict'

const base = process.env.API_URL ?? 'http://127.0.0.1:3000/v1'
const [ownerId, counterpartyId, testerId] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003']
const seededIntentId = '00000000-0000-4000-8000-000000000011'
const run = crypto.randomUUID().slice(0, 8)

async function call(path, init = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000), ...init })
  const text = await response.text()
  console.log(`${init.method ?? 'GET'} ${path.split('?')[0]} -> ${response.status}`)
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}: ${text}`)
  return { value: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

async function session(userId) {
  const response = await call('/dev/session', { method: 'POST', headers: { 'X-Dev-User-Id': userId } }, 201)
  return { cookie: response.cookie, csrf: response.value.csrfToken }
}

function mutation(auth, key, method, body) {
  return { method, headers: { cookie: auth.cookie, 'X-CSRF-Token': auth.csrf, 'Idempotency-Key': `${run}-${key}`.padEnd(16, '0'), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }
}

const read = auth => ({ headers: { cookie: auth.cookie } })
const [me, partner, tester] = await Promise.all([ownerId, counterpartyId, testerId].map(session))

// Profile
const profile = await call('/me/profile', mutation(me, 'profile', 'PATCH', { displayName: 'Private Alpha User', bio: 'Runtime check', languages: ['uz', 'en'] }))
assert.equal(profile.value.verificationLevel, 1, 'Profile update must not reset verification level')

// Intent CRUD and authorization
const draft = { title: `Smoke draft ${run}`, outcome: 'Verify intent CRUD', offers: ['qa'], needs: ['feedback'], topics: ['runtime'], mode: 'online', horizon: 'now', visibility: 'private', status: 'draft' }
const created = await call('/intents', mutation(me, 'create', 'POST', draft), 201)
assert.equal((await call('/intents', mutation(me, 'create', 'POST', draft), 201)).value.id, created.value.id, 'Create replay must return the stored intent')
const draftPath = `/intents/${created.value.id}`
await call(draftPath, read(partner), 404)
await call(draftPath, mutation(partner, 'foreign-patch', 'PATCH', { ...draft, status: 'active' }), 404)
await call(draftPath, mutation(me, 'activate', 'PATCH', { ...draft, status: 'active' }))
await call(draftPath, mutation(me, 'back-to-draft', 'PATCH', draft), 409)
const firstPage = await call('/intents?limit=1', read(me))
const secondPage = await call(`/intents?limit=1&cursor=${encodeURIComponent(firstPage.value.page.nextCursor)}`, read(me))
assert.notEqual(secondPage.value.items[0].id, firstPage.value.items[0].id, 'Pages must not overlap')
await call('/intents?cursor=bogus', read(me), 400)
await call(`/intents/${seededIntentId}`, mutation(me, 'delete-seeded', 'DELETE'), 409)
await call(draftPath, mutation(me, 'delete', 'DELETE'), 204)
await call(draftPath, read(me), 404)

// Reciprocal matching: identity hidden until consent, private intents never matched
const topic = `topic-${run}`
const mine = await call('/intents', mutation(me, 'mine', 'POST', { title: `Builder ${run}`, outcome: 'Find design', offers: [`engineering-${run}`], needs: [`design-${run}`], topics: [topic], mode: 'online', horizon: 'month', visibility: 'matched', status: 'active' }), 201)
const theirs = await call('/intents', mutation(partner, 'theirs', 'POST', { title: `Designer ${run}`, outcome: 'Find engineering', offers: [`design-${run}`], needs: [`engineering-${run}`], topics: [topic], mode: 'hybrid', horizon: 'month', visibility: 'matched', status: 'active' }), 201)
await call('/intents', mutation(tester, 'hidden', 'POST', { title: `Hidden ${run}`, outcome: 'Private', offers: [`design-${run}`], needs: [`engineering-${run}`], topics: [topic], mode: 'online', horizon: 'now', visibility: 'private', status: 'active' }), 201)
const tester2 = await call('/intents', mutation(tester, 'visible', 'POST', { title: `Tester ${run}`, outcome: 'Visible', offers: [`design-${run}`], needs: [`engineering-${run}`], topics: [topic], mode: 'online', horizon: 'now', visibility: 'public', status: 'active' }), 201)

const myMatches = (await call(`/intents/${mine.value.id}/matches`, read(me))).value.items
assert.deepEqual(myMatches.map(match => match.counterpart.intent.id).sort(), [theirs.value.id, tester2.value.id].sort(), 'Only active, non-private counterparts are matched')
const partnerMatch = myMatches.find(match => match.counterpart.intent.id === theirs.value.id)
assert.equal(partnerMatch.counterpart.displayName, null, 'Identity must stay hidden before consent')
assert.deepEqual(partnerMatch.youReceive, [`design-${run}`])
await call(`/intents/${theirs.value.id}/matches`, read(me), 404)
const theirMatches = (await call(`/intents/${theirs.value.id}/matches`, read(partner))).value.items
assert.deepEqual(theirMatches.find(match => match.id === partnerMatch.id).youReceive, [`engineering-${run}`], 'Evidence is explained from each side')

// Intro consent reveals identity to both sides; the match cannot be re-requested
const intro = await call(`/matches/${partnerMatch.id}/intro-requests`, mutation(me, 'intro', 'POST', { scope: '15 daqiqalik tanishuv', message: 'Salom' }), 201)
await call(`/matches/${partnerMatch.id}/intro-requests`, mutation(me, 'intro-again', 'POST', { scope: 'Again', message: '' }), 403)
await call(`/intro-requests/${intro.value.id}`, mutation(me, 'self-accept', 'PATCH', { status: 'accepted' }), 403)
const accepted = await call(`/intro-requests/${intro.value.id}`, mutation(partner, 'accept', 'PATCH', { status: 'accepted' }))
assert.equal(accepted.value.counterpart.displayName, 'Private Alpha User')
const connected = (await call(`/intents/${mine.value.id}/matches`, read(me))).value.items.find(match => match.id === partnerMatch.id)
assert.equal(connected.counterpart.displayName, 'Alpha Counterparty')
assert.equal(connected.status, 'connected')
const introList = await call('/intro-requests', read(me))
assert.equal(introList.value.page.nextCursor, null)

// Pausing retracts unengaged matches but keeps the connected one
await call(`/intents/${mine.value.id}`, mutation(me, 'pause', 'PATCH', { title: `Builder ${run}`, outcome: 'Find design', offers: [`engineering-${run}`], needs: [`design-${run}`], topics: [topic], mode: 'online', horizon: 'month', visibility: 'matched', status: 'paused' }))
const paused = (await call(`/intents/${mine.value.id}/matches`, read(me))).value.items
assert.deepEqual(paused.map(match => match.id), [partnerMatch.id], 'Only matches with intro history survive a pause')

// Blocking hides the tester everywhere; reports enter review
const testerMatch = myMatches.find(match => match.counterpart.intent.id === tester2.value.id)
await call('/blocks', mutation(me, 'block', 'POST', { blockedUserId: testerMatch.counterpart.userId, reason: 'smoke' }), 204)
await call('/blocks', mutation(me, 'block-self', 'POST', { blockedUserId: ownerId }), 409)
const testerView = (await call(`/intents/${tester2.value.id}/matches`, read(tester))).value.items
assert.equal(testerView.length, 0, 'A block must hide the pair from both sides')
const report = await call('/reports', mutation(me, 'report', 'POST', { subjectType: 'user', subjectId: testerMatch.counterpart.userId, reasonCode: 'spam' }), 202)
assert.equal(report.value.status, 'open')

console.log(JSON.stringify({ profile: 'upserted', foreignAccess: 404, draftRegression: 409, paging: 'keyset', linkedDelete: 409, privateExcluded: true, identityHiddenUntilConsent: true, pauseRetractsMatches: true, blockHidesPair: true, report: 202 }))
