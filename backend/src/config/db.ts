import prisma from './prisma';

export async function connectDb(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('[db] connected to PostgreSQL');
  } catch (err) {
    throw new Error(`PostgreSQL connection failed: ${(err as Error).message}`);
  }
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
