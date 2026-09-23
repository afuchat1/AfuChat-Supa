// Keep handwritten API calls on the same target as the generated API client.
// Vite's dev server proxies /api to the local API server; production points at
// the configured remote API.
export const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || 'https://api.afuchat.com');