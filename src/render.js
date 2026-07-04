const views = [
  { id: 'all', heading: 'Лента', empty: 'Здесь пока нет публикаций.' },
  { id: 'photo', heading: 'Фото', empty: 'Фото пока нет.' },
  { id: 'audio', heading: 'Голосовые', empty: 'Голосовых пока нет.' },
  { id: 'video', heading: 'Видео', empty: 'Видео пока нет.' },
  { id: 'file', heading: 'Файлы', empty: 'Файлов пока нет.' }
];
const courseTimeZone = getCourseTimeZone();

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
      ${renderAuthorCard()}
      ${renderCourseStats(posts)}
      ${nav}
      <section class="content-section" id="feed">
        <div class="section-heading">
          <h2>${escapeHtml(heading)}</h2>
        </div>
        <div class="feed">
          ${items || renderEmptyState(empty, activeView)}
        </div>
      </section>
      ${renderContactFooter()}
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
      ${renderAuthorCard()}
      ${renderCourseStats(posts)}
      ${nav}
      <section class="content-section" id="feed">
        <div class="section-heading">
          <h2>${escapeHtml(heading)}</h2>
        </div>
        <div class="feed">
          ${items || renderEmptyState(empty, activeView)}
        </div>
      </section>
      ${renderContactFooter()}
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
      <section class="register-card ${isExpired ? 'register-card-expired' : ''}">
        <div class="register-copy">
          <p class="eyebrow">${escapeHtml(title)}</p>
          <h1>${escapeHtml(heading)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="register-action">
          ${isExpired ? renderExpiredIcon() : '<img class="admin-avatar" src="/uploads/borisova.jpg" alt="@BorisovaAleksandraP" loading="lazy">'}
          <a class="admin-link" href="https://t.me/BorisovaAleksandraP" target="_blank" rel="noreferrer">${isExpired ? 'Продлить доступ' : 'Написать @BorisovaAleksandraP'}</a>
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
    <main class="state-page expired-shell">
      <section class="state-card expired-card">
        ${renderExpiredIcon()}
        <p class="eyebrow">Лента курса</p>
        <h1>Доступ завершился</h1>
        <p>Срок действия ссылки истек. Напишите Александре в Telegram, чтобы продлить доступ и получить новую ссылку.</p>
        <a class="admin-link state-link" href="https://t.me/BorisovaAleksandraP" target="_blank" rel="noreferrer">Продлить доступ</a>
      </section>
    </main>
  `);
}

function renderExpiredIcon() {
  return `
    <div class="expired-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 6v6l3.5 2"></path>
        <path d="M20 12a8 8 0 1 1-2.35-5.65"></path>
        <path d="M20 4v5h-5"></path>
      </svg>
    </div>
  `;
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

function renderAuthorCard() {
  return `
    <section class="author-card" aria-label="Автор курса">
      <img class="author-avatar" src="/uploads/borisova.jpg" alt="Александра Борисова" loading="lazy">
      <div>
        <p class="eyebrow">Курс ведет</p>
        <h2>Александра Борисова</h2>
        <p>Все материалы курса собраны здесь.</p>
      </div>
    </section>
  `;
}

function renderContactFooter() {
  return `
    <section class="contact-footer" aria-label="Связь с автором">
      <img class="contact-avatar" src="/uploads/borisova.jpg" alt="Александра Борисова" loading="lazy">
      <div class="contact-copy">
        <p class="eyebrow">Связь с автором</p>
        <h2>Нужна помощь?</h2>
        <p>По вопросам курса можно написать Александре.</p>
      </div>
      <a class="admin-link footer-link" href="https://t.me/BorisovaAleksandraP" target="_blank" rel="noreferrer">Написать Александре</a>
    </section>
  `;
}

function renderCourseStats(posts) {
  const mediaCount = posts.reduce((total, post) => total + (post.media?.length || 0), 0);
  const latestDate = getLatestPostDate(posts);
  const updated = latestDate ? `${formatDay(latestDate)} ${formatDateTime(latestDate)}` : 'нет';

  return `
    <section class="course-stats" aria-label="Сводка курса">
      <div>
        <span>Публикаций</span>
        <strong>${posts.length}</strong>
      </div>
      <div>
        <span>Медиа</span>
        <strong>${mediaCount}</strong>
      </div>
      <div>
        <span>Обновлено</span>
        <strong>${escapeHtml(updated)}</strong>
      </div>
    </section>
  `;
}

function getLatestPostDate(posts) {
  return posts
    .map((post) => new Date(post.createdAt))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b - a)[0] || null;
}

function renderEmptyState(message, view = 'all') {
  return `
    <article class="empty comfort-empty">
      ${renderEmptyIcon(view)}
      <h3>${escapeHtml(message)}</h3>
      <p>Материалы появятся здесь после публикации.</p>
    </article>
  `;
}

function renderEmptyIcon(view) {
  const icons = {
    all: '<path d="M7 7.5h10"></path><path d="M7 12h10"></path><path d="M7 16.5h6"></path>',
    photo: '<rect x="5" y="7" width="14" height="11" rx="2.4"></rect><path d="m7.5 15 3-3a1.2 1.2 0 0 1 1.7 0l3.8 4"></path><path d="m14.5 14 1.1-1.1a1.2 1.2 0 0 1 1.7 0l1.8 2"></path><circle cx="9.5" cy="10.3" r="1"></circle>',
    audio: '<path d="M12 5v14"></path><path d="M8.5 8.5v7"></path><path d="M15.5 8.5v7"></path><path d="M5.5 11v2"></path><path d="M18.5 11v2"></path>',
    video: '<rect x="5" y="7" width="10.5" height="10" rx="2.4"></rect><path d="m15.5 10.5 3.5-2v7l-3.5-2"></path>',
    file: '<path d="M8 4.5h5.2L17 8.3V19a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V6A1.5 1.5 0 0 1 8.5 4.5Z"></path><path d="M13 4.8V9h4"></path><path d="M9.5 13.5h5"></path><path d="M9.5 17h3.2"></path>'
  };

  return `
    <div class="empty-art" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        ${icons[view] || icons.all}
      </svg>
    </div>
  `;
}

function renderContentNav({ posts, activeView, token = '' }) {
  const counts = getViewCounts(posts);
  const unreadData = posts.map((post) => ({
    id: post.id,
    views: getPostViews(post)
  }));
  const items = [
    { view: 'all', label: 'Лента', count: posts.length },
    { view: 'photo', label: 'Фото', count: counts.photo },
    { view: 'audio', label: 'Голосовые', count: counts.audio },
    { view: 'video', label: 'Видео', count: counts.video },
    { view: 'file', label: 'Файлы', count: counts.file }
  ];

  return `
    <nav class="content-tabs" aria-label="Разделы курса" data-unread-posts="${escapeHtml(JSON.stringify(unreadData))}">
      ${items.map((item) => `
        <a href="${escapeHtml(buildViewHref({ view: item.view, token }))}" data-view="${escapeHtml(item.view)}" ${item.view === activeView ? 'aria-current="page"' : ''}>
          ${renderTabIcon(item.view)}
          <span>${item.label}</span>
          <b>${item.count}</b>
        </a>
      `).join('')}
    </nav>
  `;
}

function getViewCounts(posts) {
  return posts.reduce((counts, post) => {
    getPostViews(post).forEach((view) => {
      if (view !== 'all') counts[view] += 1;
    });
    return counts;
  }, { photo: 0, audio: 0, video: 0, file: 0 });
}

function renderTabIcon(view) {
  const icons = {
    all: '<path d="M4 5.5h16M4 12h16M4 18.5h10"></path>',
    photo: '<rect x="3.5" y="5" width="17" height="14" rx="3"></rect><path d="m7 15 3.2-3.2a1.4 1.4 0 0 1 2 0L16 15.5"></path><path d="m14.5 13.5 1.3-1.3a1.4 1.4 0 0 1 2 0L20.5 15"></path><circle cx="8.5" cy="9.2" r="1.2"></circle>',
    audio: '<path d="M12 4v16"></path><path d="M8 8v8"></path><path d="M16 8v8"></path><path d="M4 11v2"></path><path d="M20 11v2"></path>',
    video: '<rect x="3.5" y="6" width="12.5" height="12" rx="3"></rect><path d="m16 10 4.5-2.5v9L16 14"></path>',
    file: '<path d="M7 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z"></path><path d="M13 3.5V8h4"></path><path d="M9 13h6"></path><path d="M9 17h4"></path>'
  };

  return `
    <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      ${icons[view] || icons.all}
    </svg>
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
  if (view !== 'all') params.set('view', view);
  const query = params.toString();

  if (token && isShortAccessToken(token)) {
    return query ? `/a/${encodeURIComponent(token)}?${query}` : `/a/${encodeURIComponent(token)}`;
  }

  if (token) params.set('k', token);
  const fallbackQuery = params.toString();
  return fallbackQuery ? `/?${fallbackQuery}` : '/';
}

function isShortAccessToken(token) {
  return /^[A-Za-z0-9_-]{6,32}$/.test(String(token || ''));
}

function renderPost(post) {
  const text = post.text ? `<div class="post-text">${linkify(escapeHtml(post.text))}</div>` : '';
  const media = post.media?.length ? `<div class="media-grid">${post.media.map(renderMedia).join('')}</div>` : '';

  return `
    <article class="post" data-post-id="${escapeHtml(post.id)}" data-post-views="${escapeHtml(getPostViews(post).join(','))}">
      <div class="post-body">
        <span class="new-badge" hidden>Новое</span>
        ${text}
        ${media}
        <div class="post-meta">
          <time datetime="${escapeHtml(post.createdAt)}">${escapeHtml(formatDateTime(post.createdAt))}</time>
        </div>
      </div>
    </article>
  `;
}

function getPostViews(post) {
  const views = new Set(['all']);
  (post.media || []).forEach((item) => views.add(getMediaView(item)));
  return [...views];
}

function renderMedia(item) {
  if (item.kind === 'photo') {
    return `
      <button class="photo-open" type="button" data-photo-src="${escapeHtml(item.url)}" aria-label="Открыть фото на весь экран">
        <img src="${escapeHtml(item.url)}" alt="" loading="lazy">
      </button>
    `;
  }

  if (item.kind === 'video') {
    return `
      <div class="video-player">
        <video src="${escapeHtml(item.url)}" preload="metadata" playsinline></video>
        <div class="video-controls">
          <button class="video-play" type="button" aria-label="Воспроизвести видео">
            <span class="video-play-icon" aria-hidden="true"></span>
          </button>
          <div class="video-timeline" role="slider" aria-label="Прогресс видео" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="video-progress"></span>
          </div>
          <span class="video-time">0:00</span>
          <div class="video-actions">
            <div class="video-volume">
              <button class="video-volume-button" type="button" aria-label="Громкость">
                <span class="video-volume-waves" aria-hidden="true">
                  <i></i><i></i><i></i><i></i><i></i>
                </span>
              </button>
              <input class="video-volume-slider" type="range" min="0" max="1" step="0.05" value="1" aria-label="Громкость видео">
            </div>
            <div class="video-menu-wrap">
              <button class="video-menu-button" type="button" aria-label="Действия с видео" aria-expanded="false">•••</button>
              <div class="video-menu" hidden>
                <a href="${escapeHtml(item.url)}" download>Скачать</a>
                <button class="is-active" type="button" data-video-speed="1">Скорость 1x</button>
                <button type="button" data-video-speed="1.25">Скорость 1.25x</button>
                <button type="button" data-video-speed="1.5">Скорость 1.5x</button>
                <button type="button" data-video-speed="2">Скорость 2x</button>
              </div>
            </div>
            <button class="video-fullscreen" type="button" aria-label="Открыть на весь экран">
              <span class="video-fullscreen-icon" aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (item.kind === 'audio') {
    return `
      <div class="voice-message">
        <button class="voice-play" type="button" aria-label="Воспроизвести голосовое">
          <span class="voice-play-icon" aria-hidden="true"></span>
        </button>
        <div class="voice-content">
          <div class="voice-title">Голосовое сообщение</div>
          <div class="voice-track" aria-hidden="true">
            <span class="voice-progress"></span>
          </div>
          <audio src="${escapeHtml(item.url)}" preload="metadata"></audio>
        </div>
        <span class="voice-time">0:00</span>
        <div class="voice-menu-wrap">
          <button class="voice-menu-button" type="button" aria-label="Действия с голосовым" aria-expanded="false">•••</button>
          <div class="voice-menu" hidden>
            <a href="${escapeHtml(item.url)}" download>Скачать</a>
            <button class="is-active" type="button" data-speed="1">Скорость 1x</button>
            <button type="button" data-speed="1.5">Скорость 1.5x</button>
            <button type="button" data-speed="2">Скорость 2x</button>
          </div>
        </div>
      </div>
    `;
  }

  const fileName = item.name || 'Скачать файл';

  return `
    <article class="file-card" data-file-url="${escapeHtml(item.url)}">
      <a class="file-action" href="${escapeHtml(item.url)}" download data-file-action aria-label="Скачать файл">
        <span class="file-action-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path class="file-icon-download" d="M12 4v10m0 0 4-4m-4 4-4-4"></path>
            <path class="file-icon-download" d="M5 19h14"></path>
            <path class="file-icon-open" d="M7 17 17 7"></path>
            <path class="file-icon-open" d="M9 7h8v8"></path>
          </svg>
        </span>
        <span class="file-action-text">Скачать</span>
      </a>
      <div class="file-info">
        <strong>${escapeHtml(fileName)}</strong>
        <span data-file-status>Файл можно скачать на устройство</span>
      </div>
    </article>
  `;
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
    timeZone: courseTimeZone,
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
    timeZone: courseTimeZone,
    day: 'numeric',
    month: 'long'
  }).format(date);
}

function isSameDay(left, right) {
  const leftParts = getDateParts(left);
  const rightParts = getDateParts(right);
  return leftParts.year === rightParts.year
    && leftParts.month === rightParts.month
    && leftParts.day === rightParts.day;
}

function getDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: courseTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getCourseTimeZone() {
  const value = String(process.env.COURSE_TIME_ZONE || '').trim();

  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: value || 'Asia/Novosibirsk' });
    return value || 'Asia/Novosibirsk';
  } catch {
    return 'Asia/Novosibirsk';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
