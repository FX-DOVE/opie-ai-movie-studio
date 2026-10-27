/** Token for server-to-itself calls (boot recovery): random per process, kept on globalThis, never sent to browsers. */
const g = globalThis as unknown as { __rfInternal?: string };
export const internalToken = () => (g.__rfInternal ||= globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID());
