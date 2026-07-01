const views = [
  { id: 'all', heading: 'Лента', empty: 'Здесь пока нет публикаций.' },
  { id: 'photo', heading: 'Фото', empty: 'Фото пока нет.' },
  { id: 'audio', heading: 'Голосовые', empty: 'Голосовых пока нет.' },
  { id: 'video', heading: 'Видео', empty: 'Видео пока нет.' },
  { id: 'file', heading: 'Файлы', empty: 'Файлов пока нет.' }
];

export function renderFeedPage({ title, posts, access, token = '', view = 'all' }) {
  const activeView = normalizeView(view);
  const visiblePosts = filterPostsByView(posts, activeView);
  const items = renderPosts(visiblePosts);
  const nav = renderContentNav({ posts, activeView, token });
  const heading = getView(activeView).heading;
  const empty = getView(activeView).empty;

  return page(title, `
    <main class="feed-shell">
      <header class="feed-header">
        <div>
          <p class="eyebrow">Закрытая лента</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <span class="access-badge">Доступ открыт</span>
      </header>
      ${renderComfortIntro()}
      ${nav}
      <section class="content-section" id="feed">
        <div class="section-heading">
          <h2>${escapeHtml(heading)}</h2>
        </div>
        <div class="feed">
          ${items || renderEmptyState(empty)}
        </div>
      </section>
    </main>
  `);
}

export function renderPublicFeedPage({ title, posts, view = 'all' }) {
  const activeView = normalizeView(view);
  const visiblePosts = filterPostsByView(posts, activeView);
  const items = renderPosts(visiblePosts);
  const nav = renderContentNav({ posts, activeView });
  const heading = getView(activeView).heading;
  const empty = getView(activeView).empty;

  return page(title, `
    <main class="feed-shell">
      <header class="feed-header">
        <div>
          <p class="eyebrow">Лента курса</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
      </header>
      ${nav}
      <section class="content-section" id="feed">
        <div class="section-heading">
          <h2>${escapeHtml(heading)}</h2>
        </div>
        <div class="feed">
          ${items || renderEmptyState(empty)}
        </div>
      </section>
    </main>
  `);
}

export function renderRegistrationPage({ title, state = 'default' }) {
  const isExpired = state === 'expired';
  const pageTitle = isExpired ? `Доступ закончился - ${title}` : `Регистрация - ${title}`;
  const heading = isExpired ? 'Срок доступа закончился' : 'Регистрация на курс открыта';
  const description = isExpired
    ? 'Чтобы продлить доступ к курсу, напишите администратору в Telegram.'
    : 'Чтобы получить доступ к курсу, напишите администратору в Telegram.';

  return page(pageTitle, `
    <main class="register-shell">
      <section class="register-card">
        <div class="register-copy">
          <p class="eyebrow">${escapeHtml(title)}</p>
          <h1>${escapeHtml(heading)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="register-action">
          <img class="admin-avatar" src="/uploads/borisova.jpg" alt="@BorisovaAleksandraP" loading="lazy">
          <a class="admin-link" href="https://t.me/BorisovaAleksandraP" target="_blank" rel="noreferrer">Написать @BorisovaAleksandraP</a>
          ${renderComfortTiles()}
        </div>
      </section>
    </main>
  `);
}

export function renderRegistrationSuccessPage({ title }) {
  return page(`Заявка отправлена - ${title}`, `
    <main class="state-page">
      <section class="state-card">
        <h1>Заявка отправлена</h1>
        <p>Спасибо! Мы получили вашу регистрацию и скоро свяжемся с вами.</p>
      </section>
    </main>
  `);
}

export function renderExpiredPage({ title }) {
  return page(title, `
    <main class="state-page">
      <section class="state-card">
        <h1>Доступ закончился</h1>
        <p>Срок действия ссылки истек. Напишите администратору, чтобы получить новую ссылку.</p>
      </section>
    </main>
  `);
}

export function renderMissingPage({ title }) {
  return page(title, `
    <main class="state-page">
      <section class="state-card">
        <h1>Ссылка не найдена</h1>
        <p>Проверьте адрес страницы или запросите новую ссылку у администратора.</p>
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

function renderComfortIntro() {
  return `
    <section class="comfort-panel" aria-label="Пространство курса">
      <div class="comfort-copy">
        <p class="eyebrow">мягкое пространство</p>
        <h2>Материалы курса собраны спокойно и по полочкам</h2>
        <p>Можно идти в своем темпе: слушать голосовые, возвращаться к фото и сохранять важные файлы без лишнего шума.</p>
      </div>
      <div class="comfort-visual" aria-hidden="true">
        <div class="mood-card mood-card-photo">
          <img src="/uploads/borisova.jpg" alt="" loading="lazy">
        </div>
        <div class="mood-card mood-card-soft">
          <span>фокус</span>
          <strong>маленький шаг</strong>
        </div>
        <div class="mood-card mood-card-line">
          <span>опора</span>
          <strong>я рядом с собой</strong>
        </div>
      </div>
    </section>
  `;
}

function renderComfortTiles() {
  return `
    <div class="comfort-tiles" aria-hidden="true">
      <div class="comfort-tile comfort-tile-sage">спокойствие</div>
      <div class="comfort-tile comfort-tile-sky">ясность</div>
      <div class="comfort-tile comfort-tile-rose">поддержка</div>
    </div>
  `;
}

function renderEmptyState(message) {
  return `
    <article class="empty comfort-empty">
      <div class="empty-art" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <h3>${escapeHtml(message)}</h3>
      <p>Когда здесь появятся материалы, они лягут в этот раздел аккуратно и без хаоса.</p>
    </article>
  `;
}

function renderContentNav({ posts, activeView, token = '' }) {
  const counts = getMediaGroups(posts);
  const items = [
    { view: 'all', label: 'Лента', count: posts.length },
    { view: 'photo', label: 'Фото', count: counts.photo.length },
    { view: 'audio', label: 'Голосовые', count: counts.audio.length },
    { view: 'video', label: 'Видео', count: counts.video.length },
    { view: 'file', label: 'Файлы', count: counts.file.length }
  ];

  return `
    <nav class="content-tabs" aria-label="Разделы курса">
      ${items.map((item) => `
        <a href="${escapeHtml(buildViewHref({ view: item.view, token }))}" ${item.view === activeView ? 'aria-current="page"' : ''}>
          <span>${item.label}</span>
          <b>${item.count}</b>
        </a>
      `).join('')}
    </nav>
  `;
}

function getMediaGroups(posts) {
  const groups = {
    photo: [],
    audio: [],
    video: [],
    file: []
  };

  for (const post of posts) {
    for (const item of post.media || []) {
      const key = item.kind === 'photo' || item.kind === 'audio' || item.kind === 'video' ? item.kind : 'file';
      groups[key].push({ post, item });
    }
  }

  return groups;
}

function filterPostsByView(posts, view) {
  if (view === 'all') return posts;

  return posts
    .map((post) => {
      const media = (post.media || []).filter((item) => getMediaView(item) === view);
      return media.length ? { ...post, media } : null;
    })
    .filter(Boolean);
}

function getMediaView(item) {
  if (item.kind === 'photo') return 'photo';
  if (item.kind === 'audio') return 'audio';
  if (item.kind === 'video') return 'video';
  return 'file';
}

function normalizeView(value) {
  const view = String(value || 'all').trim();
  return views.some((item) => item.id === view) ? view : 'all';
}

function getView(id) {
  return views.find((item) => item.id === id) || views[0];
}

function buildViewHref({ view, token }) {
  const params = new URLSearchParams();
  if (token) params.set('k', token);
  if (view !== 'all') params.set('view', view);
  const query = params.toString();
  return query ? `/?${query}` : '/';
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
