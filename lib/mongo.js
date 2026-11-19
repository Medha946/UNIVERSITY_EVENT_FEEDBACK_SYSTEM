import { MongoClient } from 'mongodb';

export async function feedbackCollection() {
  if (!globalThis._mongoClient) globalThis._mongoClient = new MongoClient(process.env.MONGODB_URI).connect();
  const client = await globalThis._mongoClient;
  return client.db(process.env.MONGODB_DB).collection('feedback');
}
