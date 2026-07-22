export function publicErrorMessage(error, {
  context = "Application operation failed.",
  fallback = "That action could not be completed.",
  messages = {},
} = {}) {
  const code = typeof error?.code === "string" ? error.code : "";
  const knownMessage = messages[code];
  if (knownMessage) return knownMessage;
  console.error(context, error);
  return fallback;
}
