import { ProblemDetailError } from '@/src/lib/api-client';

export function getErrorMessage(error: Error, fallback: string): string {
  return error instanceof ProblemDetailError ? error.problem.detail : error.message || fallback;
}
