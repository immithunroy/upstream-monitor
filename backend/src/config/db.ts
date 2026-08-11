import mongoose from 'mongoose';
import { env } from './env';

export async function connectDb(): Promise<void> {
  mongoose.connection.on('connected', () => {
    // eslint-disable-next-line no-console
    console.log(`[db] connected to ${mongoose.connection.name}`);
  });
  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] connection error:', err.message);
  });

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
