export type HttpHeaders = Record<string, string>;

export function withoutJsonContentType(headers: HttpHeaders): HttpHeaders {
  const sanitized: HttpHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}
