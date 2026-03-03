import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'chat_history';
const COLLECTION = 'conversations';

async function createIndexes() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();

    const db = client.db(MONGODB_DB_NAME);
    const collection = db.collection(COLLECTION);

    // Index for getConversationHistory: filter by agentId + email, sort by updatedAt
    await collection.createIndex(
      { agentId: 1, email: 1, updatedAt: -1 },
      { name: 'idx_agent_email_updated', background: true },
    );

    // Index for getConversationHistory with search: filter by agentId + email + title, sort by updatedAt
    await collection.createIndex(
      { agentId: 1, email: 1, conversationTitle: 1, updatedAt: -1 },
      { name: 'idx_agent_email_title_updated', background: true },
    );
  } catch (error) {
    console.error('Failed to create indexes:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

createIndexes();
