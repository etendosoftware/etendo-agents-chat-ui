import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock = vi.hoisted(() => vi.fn())
const dbMock = vi.hoisted(() => vi.fn())
const MongoClientMock = vi.hoisted(() => vi.fn())

vi.mock('mongodb', () => ({
  MongoClient: MongoClientMock,
}))

describe('connectToDatabase', () => {
  const fakeDb = { name: 'db-instance' }
  const fakeClient = { connect: connectMock, db: dbMock }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    MongoClientMock.mockImplementation(() => fakeClient)
    connectMock.mockResolvedValue(undefined)
    dbMock.mockReturnValue(fakeDb)
  })

  afterEach(() => {
    delete process.env.MONGODB_DB_NAME
  })

  it('creates a MongoClient with the correct URI and pool options', async () => {
    const { connectToDatabase } = await import('../lib/mongodb')
    await connectToDatabase()

    expect(MongoClientMock).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/test', {
      maxPoolSize: 10,
      minPoolSize: 1,
    })
    expect(connectMock).toHaveBeenCalledTimes(1)
  })

  it('returns cached client and db on subsequent calls without reconnecting', async () => {
    const { connectToDatabase } = await import('../lib/mongodb')

    const first = await connectToDatabase()
    const second = await connectToDatabase()

    expect(MongoClientMock).toHaveBeenCalledTimes(1)
    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(first.client).toBe(second.client)
    expect(first.db).toBe(second.db)
  })

  it('uses MONGODB_DB_NAME env var when set', async () => {
    process.env.MONGODB_DB_NAME = 'custom_db'
    vi.resetModules() // force the module to re-read env vars
    const { connectToDatabase } = await import('../lib/mongodb')

    await connectToDatabase()

    expect(dbMock).toHaveBeenCalledWith('custom_db')
  })

  it('falls back to chat_history as default db name', async () => {
    const { connectToDatabase } = await import('../lib/mongodb')
    await connectToDatabase()

    expect(dbMock).toHaveBeenCalledWith('chat_history')
  })

  it('retries once and succeeds when the initial connection attempt fails', async () => {
    connectMock
      .mockRejectedValueOnce(new Error('TLS handshake timeout'))
      .mockResolvedValueOnce(undefined)

    const { connectToDatabase } = await import('../lib/mongodb')
    const result = await connectToDatabase()

    expect(connectMock).toHaveBeenCalledTimes(2)
    expect(result.client).toBe(fakeClient)
  })

  it('throws when both the initial attempt and retry fail', async () => {
    connectMock.mockRejectedValue(new Error('connection refused'))

    const { connectToDatabase } = await import('../lib/mongodb')

    await expect(connectToDatabase()).rejects.toThrow('connection refused')
    expect(connectMock).toHaveBeenCalledTimes(2)
  })
})
