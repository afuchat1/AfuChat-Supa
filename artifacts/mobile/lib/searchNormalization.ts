export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function displaySearchTerm(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
