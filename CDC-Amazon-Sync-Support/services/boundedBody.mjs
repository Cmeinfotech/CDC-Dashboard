export async function boundedBytes(message, limit) {
  const advertised = Number(message.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > limit) throw Error('Payload exceeds the configured size limit.');
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw Error('Payload exceeds the configured size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}
export async function boundedFormData(request) {
  const bytes = await boundedBytes(request, 26 * 1024 * 1024);
  return new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
}
