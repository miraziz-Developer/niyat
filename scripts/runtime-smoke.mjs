import assert from 'node:assert/strict'

const base = process.env.API_URL ?? 'http://127.0.0.1:3000/v1'
const users = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
const introId = '00000000-0000-4000-8000-000000000031'

async function call(path, init = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000), ...init })
  const text = await response.text()
  console.log(`${init.method ?? 'GET'} ${path} -> ${response.status}`)
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}: ${text}`)
  return { value: text ? JSON.parse(text) : null, text, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

async function session(userId) {
  const response = await call('/dev/session', { method: 'POST', headers: { 'X-Dev-User-Id': userId } }, 201)
  return { cookie: response.cookie, csrf: response.value.csrfToken }
}

function mutation(auth, key, method = 'POST', body) {
  return { method, headers: { cookie: auth.cookie, 'X-CSRF-Token': auth.csrf, 'Idempotency-Key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }
}

const [creator, counterparty] = await Promise.all(users.map(session))
const created = await call(`/intro-requests/${introId}/collaboration`, mutation(creator, 'create-collaboration-0001', 'POST', { title: 'Runtime verified outcome', milestones: ['Meet', 'Ship'] }), 201)
for (const [index, milestone] of created.value.milestones.entries()) {
  await call(`/collaborations/${created.value.id}/milestones/${milestone.id}/complete`, mutation(creator, `complete-milestone-000${index + 1}`, 'PATCH'))
}
const asked = await call(`/collaborations/${created.value.id}/outcome-verifications`, mutation(creator, 'request-verification-01', 'POST', { evidence: 'Runtime API produced an artifact' }), 201)
await call(`/outcome-verifications/${asked.value.verification.id}`, mutation(creator, 'self-confirmation-0001', 'PATCH', { decision: 'confirmed' }), 403)
const confirmed = await call(`/outcome-verifications/${asked.value.verification.id}`, mutation(counterparty, 'counterparty-confirm-01', 'PATCH', { decision: 'confirmed' }))
const replay = await call(`/outcome-verifications/${asked.value.verification.id}`, mutation(counterparty, 'counterparty-confirm-01', 'PATCH', { decision: 'confirmed' }))
assert.deepStrictEqual(replay.value, confirmed.value, 'Durable idempotency replay did not return the stored response')
const signals = await call('/me/trust-signals', { headers: { cookie: creator.cookie } })
if (confirmed.value.verification.status !== 'confirmed' || !confirmed.value.trustSignal || signals.value.items.length !== 1) throw new Error('Verified outcome invariants failed')
console.log(JSON.stringify({ selfConfirmation: 403, status: 'confirmed', trustSignals: 1, idempotentReplay: true }))