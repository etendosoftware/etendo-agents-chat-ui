
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chat_history';

if (!uri) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let cachedClientPromise: Promise<MongoClient> | null = null;

async function createAndConnectClient() {
  const client = new MongoClient(uri!, {
    maxPoolSize: 10,
    minPoolSize: 1,
  });

  await client.connect();
  return client;
}

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    if (!cachedClientPromise) {
      cachedClientPromise = createAndConnectClient();
    }

    const client = await cachedClientPromise;
    const db = client.db(dbName);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch {
    cachedClientPromise = null;
    cachedClient = null;
    cachedDb = null;

    // Retry once for transient TLS/network handshakes.
    const retryClient = await createAndConnectClient();
    const retryDb = retryClient.db(dbName);

    cachedClientPromise = Promise.resolve(retryClient);
    cachedClient = retryClient;
    cachedDb = retryDb;

    return { client: retryClient, db: retryDb };
  }
}
