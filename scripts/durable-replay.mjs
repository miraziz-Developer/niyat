const base = process.env.API_URL ?? 'http://127.0.0.1:3000/v1'
const verificationId = process.env.VERIFICATION_ID
if (!verificationId) throw new Error('VERIFICATION_ID is required')
const session = await fetch(`${base}/dev/session`, { method: 'POST', headers: { 'X-Dev-User-Id': '00000000-0000-4000-8000-000000000002' }, signal: AbortSignal.timeout(5000) })
const value = await session.json()
const response = await fetch(`${base}/outcome-verifications/${verificationId}`, {
  method: 'PATCH', signal: AbortSignal.timeout(5000), body: JSON.stringify({ decision: 'confirmed' }),
  headers: { cookie: session.headers.get('set-cookie').split(';')[0], 'content-type': 'application/json', 'X-CSRF-Token': value.csrfToken, 'Idempotency-Key': 'counterparty-confirm-01' },
})
const replay = await response.json()
if (response.status !== 200 || replay.verification?.status !== 'confirmed' || !replay.trustSignal) throw new Error(JSON.stringify(replay))
console.log(JSON.stringify({ serverRestarted: true, durableReplayStatus: response.status, verification: replay.verification.status }))