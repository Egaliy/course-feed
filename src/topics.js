export const defaultTopics = [
  { id: 'meditations', label: 'Медитации' },
  { id: 'body-practices', label: 'Телесные практики' },
  { id: 'audio-podcasts', label: 'Аудио подкасты' },
  { id: 'psychosomatics', label: 'Психосоматика', parentId: 'audio-podcasts' },
  { id: 'alexandra-lives', label: 'Эфиры с Александрой Борисовой' },
  { id: 'guest-lives', label: 'Эфиры с приглашенными спикерами' },
  { id: 'text-files', label: 'Текстовые файлы' },
  { id: 'future-moms', label: 'Для будущих мам' },
  { id: 'other', label: 'Прочее' }
];

export function normalizeTopics(topics = []) {
  const result = [];
  const seen = new Set();

  for (const topic of [...defaultTopics, ...topics]) {
    const id = normalizeTopicId(topic?.id || slugifyTopic(topic?.label));
    const label = String(topic?.label || '').trim();
    if (!id || !label || seen.has(id)) continue;

    result.push({
      id,
      label,
      parentId: topic?.parentId ? normalizeTopicId(topic.parentId) : ''
    });
    seen.add(id);
  }

  return result;
}

export function getTopicById(topics, id) {
  const normalizedId = normalizeTopicId(id);
  return normalizeTopics(topics).find((topic) => topic.id === normalizedId)
    || defaultTopics.find((topic) => topic.id === 'other');
}

export function normalizeTopicId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function slugifyTopic(value) {
  const text = String(value || '').trim().toLowerCase();
  const known = {
    'медитации': 'meditations',
    'телесные практики': 'body-practices',
    'аудио подкасты': 'audio-podcasts',
    'психосоматика': 'psychosomatics',
    'эфиры с александрой борисовой': 'alexandra-lives',
    'эфиры с приглашенными спикерами': 'guest-lives',
    'текстовые файлы': 'text-files',
    'для будущих мам': 'future-moms',
    'прочее': 'other'
  };

  if (known[text]) return known[text];

  return normalizeTopicId(text) || `topic-${Date.now().toString(36)}`;
}
