import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { schema } from "./schema";

export const SERIALIZABLE_ISOLATION = "serializable" as const;
export const POSTGRES_UNIQUE_VIOLATION = "23505";
export const POSTGRES_SERIALIZATION_FAILURE = "40001";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbExecutor = Database | Transaction;

export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export function requireFirst<T>(rows: T[], message = "Expected one row"): T {
  const row = firstOrNull(rows);
  if (row === null) {
    throw new Error(message);
  }
  return row;
}

export function isPostgresErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

export function isUniqueViolation(error: unknown): boolean {
  return isPostgresErrorCode(error, POSTGRES_UNIQUE_VIOLATION);
}

export function isSerializationFailure(error: unknown): boolean {
  return isPostgresErrorCode(error, POSTGRES_SERIALIZATION_FAILURE);
}

export async function withSerializableRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializationFailure(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}
