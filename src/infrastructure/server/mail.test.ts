import { describe, expect, it, vi } from 'vitest'
import { ConsoleMailer, ResendMailer } from './mail'

const message = { to: 'aziza@example.uz', subject: 'Kirish', text: 'link', html: '<p>link</p>' }

describe('mailers', () => {
  it('posts to Resend with a bearer key and surfaces rejections', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 })).mockResolvedValueOnce(new Response('{}', { status: 422 }))
    const mailer = new ResendMailer('re_key', 'NIYAT <kirish@niyat.uz>', fetcher as unknown as typeof fetch)
    await mailer.send(message)
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer re_key')
    expect(JSON.parse(String(init.body))).toMatchObject({ from: 'NIYAT <kirish@niyat.uz>', to: ['aziza@example.uz'] })
    await expect(mailer.send(message)).rejects.toThrow('422')
  })

  it('prints the message in development', async () => {
    const log = vi.fn()
    await new ConsoleMailer(log).send(message)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('to=aziza@example.uz'))
  })
})
