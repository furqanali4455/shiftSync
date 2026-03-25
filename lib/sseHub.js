const subscribers = new Set();

export function sseSubscribe(sendText) {
  subscribers.add(sendText);
  return () => subscribers.delete(sendText);
}

export function sseBroadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const fn of subscribers) {
    try {
      fn(line);
    } catch {
      subscribers.delete(fn);
    }
  }
}
