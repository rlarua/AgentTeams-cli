import axios from 'axios';
import { toNonEmptyString } from './parsers.js';

export function isCreatedByRequiredValidationError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const data = error.response?.data as
    | { message?: unknown; details?: unknown; error?: unknown }
    | string
    | undefined;

  const message = typeof data === 'string'
    ? data
    : [data?.message, data?.details, data?.error]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');

  return /required property ['"]createdBy['"]|body\.createdBy/i.test(message);
}

export function resolveLegacyCreatedBy(options: any): string | undefined {
  return toNonEmptyString(options.createdBy)
    ?? toNonEmptyString(options.defaultCreatedBy)
    ?? undefined;
}
