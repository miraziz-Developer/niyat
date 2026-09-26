import assert from 'node:assert/strict'

const base = process.env.API_URL ?? 'http://127.0.0.1:3000/v1'
const [owner, stranger] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
const seededIntentId = '00000000-0000-4000-8000-000000000011'
const run = crypto.randomUUID().slice(0, 8)

async function call(path, init = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000), ...init })
  const text = await response.text()
  console.log(`${init.method ?? 'GET'} ${path} -> ${response.status}`)
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
const [me, other] = await Promise.all([owner, stranger].map(session))

const profile = await call('/me/profile', mutation(me, 'profile', 'PATCH', { displayName: 'Smoke Owner', bio: 'Runtime check', languages: ['uz', 'en'] }))
assert.equal(profile.value.verificationLevel, 1, 'Profile update must not reset verification level')
assert.deepEqual((await call('/me/profile', read(me))).value, profile.value)

const input = { title: `Smoke intent ${run}`, outcome: 'Verify intent CRUD', offers: ['qa'], needs: ['feedback'], topics: ['runtime'], mode: 'online', horizon: 'now', visibility: 'private', status: 'draft' }
const created = await call('/intents', mutation(me, 'create', 'POST', input), 201)
const replayed = await call('/intents', mutation(me, 'create', 'POST', input), 201)
assert.equal(replayed.value.id, created.value.id, 'Create replay must return the stored intent')
const intentPath = `/intents/${created.value.id}`

await call(intentPath, read(other), 404)
await call(intentPath, mutation(other, 'foreign-patch', 'PATCH', { ...input, status: 'active' }), 404)
const activated = await call(intentPath, mutation(me, 'activate', 'PATCH', { ...input, status: 'active' }))
assert.equal(activated.value.status, 'active')
await call(intentPath, mutation(me, 'back-to-draft', 'PATCH', input), 409)

const firstPage = await call('/intents?limit=1', read(me))
assert.equal(firstPage.value.items.length, 1)
assert.ok(firstPage.value.page.nextCursor, 'Owner with two intents must receive a next cursor')
const secondPage = await call(`/intents?limit=1&cursor=${encodeURIComponent(firstPage.value.page.nextCursor)}`, read(me))
assert.notEqual(secondPage.value.items[0].id, firstPage.value.items[0].id, 'Pages must not overlap')
await call('/intents?cursor=bogus', read(me), 400)

await call(`/intents/${seededIntentId}`, mutation(me, 'delete-seeded', 'DELETE'), 409)
await call(intentPath, mutation(me, 'delete', 'DELETE'), 204)
await call(intentPath, mutation(me, 'delete', 'DELETE'), 204)
await call(intentPath, read(me), 404)
console.log(JSON.stringify({ profile: 'upserted', foreignAccess: 404, draftRegression: 409, paging: 'keyset', linkedDelete: 409, delete: 204 }))
