export function formatOutput(data: any, format: 'json' | 'text'): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  return formatText(data);
}

function formatText(data: any): string {
  if (Array.isArray(data)) {
    return data.map((item) => formatObject(item)).join('\n\n');
  }

  if (data.data) {
    if (Array.isArray(data.data)) {
      return data.data.map((item: any) => formatObject(item)).join('\n\n');
    }
    return formatObject(data.data);
  }

  return formatObject(data);
}

function formatObject(obj: any): string {
  if (typeof obj !== 'object' || obj === null) {
    return String(obj);
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${key}:`);
      const nested = formatObject(value);
      lines.push(
        nested
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
      );
    } else if (Array.isArray(value)) {
      lines.push(`${key}: ${value.join(', ')}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join('\n');
}
