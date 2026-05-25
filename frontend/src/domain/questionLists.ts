export function uniqueByQuestionId<TItem extends { id: string }>(items: TItem[]): TItem[] {
  const seen = new Set<string>();
  const uniqueItems: TItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    uniqueItems.push(item);
  }

  return uniqueItems;
}
