
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'chat_history';

if (!uri) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(uri!, {
    maxPoolSize: 10, // Limit the number of connections in the pool
  });
  await client.connect();
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}
