export function renderFeedPage({ title, posts, access }) {
  const items = renderPosts(posts);

  return page(title, `
    <main class="feed-shell">
      <section class="feed">
        ${items || '<article class="empty">Здесь пока нет публикаций.</article>'}
      </section>
    </main>
  `);
}

export function renderPublicFeedPage({ title, posts }) {
  const items = renderPosts(posts);

  return page(title, `
    <main class="feed-shell">
      <section class="feed">
        ${items || '<article class="empty">Здесь пока нет публикаций.</article>'}
      </section>
    </main>
  `);
}

export function renderExpiredPage({ title }) {
  return page(title, `
    <main class="state-page">
      <section class="state-card">
        <h1>Доступ закончился</h1>
        <p>К сожалению, срок действия вашей ссылки истек. Напишите преподавателю, если хотите продлить доступ.</p>
      </section>
    </main>
  `);
}

export function renderMissingPage({ title }) {
  return page(title, `
    <main class="state-page">
      <section class="state-card">
        <h1>Ссылка не найдена</h1>
        <p>Проверьте адрес страницы или запросите новую ссылку у преподавателя.</p>
      </section>
    </main>
  `);
}

function renderPosts(posts) {
  let lastDay = '';

  return posts.map((post) => {
    const day = formatDay(post.createdAt);
    const divider = day !== lastDay ? renderDateDivider(day) : '';
    lastDay = day;
    return `${divider}${renderPost(post)}`;
  }).join('');
}

function renderDateDivider(label) {
  return `<div class="date-divider"><span>${escapeHtml(label)}</span></div>`;
}

function renderPost(post) {
  const text = post.text ? `<div class="post-text">${linkify(escapeHtml(post.text))}</div>` : '';
  const media = post.media?.length ? `<div class="media-grid">${post.media.map(renderMedia).join('')}</div>` : '';

  return `
    <article class="post">
      <div class="post-body">
        ${text}
        ${media}
        <div class="post-meta">
          <time datetime="${escapeHtml(post.createdAt)}">${escapeHtml(formatDateTime(post.createdAt))}</time>
        </div>
      </div>
    </article>
  `;
}

function renderMedia(item) {
  if (item.kind === 'photo') {
    return `<img src="${escapeHtml(item.url)}" alt="" loading="lazy">`;
  }

  if (item.kind === 'video') {
    return `<video src="${escapeHtml(item.url)}" controls preload="metadata"></video>`;
  }

  if (item.kind === 'audio') {
    return `
      <div class="voice-message">
        <button class="voice-play" type="button" aria-label="Воспроизвести голосовое">▶</button>
        <div class="voice-content">
          <div class="voice-title">Голосовое сообщение</div>
          <audio src="${escapeHtml(item.url)}" controls preload="metadata"></audio>
        </div>
      </div>
    `;
  }

  return `<a class="file-link" href="${escapeHtml(item.url)}" download>${escapeHtml(item.name || 'Скачать файл')}</a>`;
}

function page(title, body) {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles.css">
    <script src="/player.js" defer></script>
  </head>
  <body>${body}</body>
</html>`;
}

function linkify(value) {
  return value.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDay(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return 'Сегодня';
  if (isSameDay(date, yesterday)) return 'Вчера';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(date);
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
