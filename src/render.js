import { getTopicById, normalizeTopics } from './topics.js';

const courseTimeZone = getCourseTimeZone();

export function renderFeedPage({ title, posts, access, token = '', view = 'all', topics = [] }) {
  const topicItems = normalizeTopics(topics);
  const activeView = normalizeView(view, topicItems);
  const visiblePosts = filterPostsByView(posts, activeView, topicItems);
  const items = renderPosts(visiblePosts, topicItems);
  const nav = renderContentNav({ posts, activeView, token, topics: topicItems });
  const heading = getView(activeView, topicItems).heading;
  const empty = getView(activeView, topicItems).empty;

  return page(title, `
    <main class="feed-shell">
      <header class="feed-header">
        <div>
          <p class="eyebrow">Закрытое онлайн-пространство</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="access-stack">
          ${renderAccessBadge(access)}
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

export function renderManagePage({ title, posts, adminKey, notice = '', topics = [] }) {
  const sortedPosts = [...(posts || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const topicItems = normalizeTopics(topics);

  return page(`Управление - ${title}`, `
    <main class="feed-shell manage-shell">
      <header class="feed-header">
        <div>
          <p class="eyebrow">Управление сайтом</p>
          <h1>Материалы курса</h1>
        </div>
        <span class="access-badge">Режим удаления</span>
      </header>
      ${notice ? `<div class="manage-notice">${escapeHtml(notice)}</div>` : ''}
      ${sortedPosts.length ? `
        <form class="manage-form" method="post" action="/?manage=${encodeURIComponent(adminKey)}">
          <input type="hidden" name="action" value="delete-posts">
          <div class="manage-toolbar">
            <label class="manage-select-all">
              <input type="checkbox" data-select-all>
              <span>Выделить все</span>
            </label>
            <button class="danger-button" type="submit">Удалить выбранное</button>
          </div>
          <div class="feed">
            ${sortedPosts.map((post) => renderManagePost(post, topicItems)).join('')}
          </div>
        </form>
      ` : renderEmptyState('Материалов пока нет.', 'all')}
    </main>
  `);
}

export function renderPublicFeedPage({ title, posts, view = 'all', topics = [] }) {
  const topicItems = normalizeTopics(topics);
  const activeView = normalizeView(view, topicItems);
  const visiblePosts = filterPostsByView(posts, activeView, topicItems);
  const items = renderPosts(visiblePosts, topicItems);
  const nav = renderContentNav({ posts, activeView, topics: topicItems });
  const heading = getView(activeView, topicItems).heading;
  const empty = getView(activeView, topicItems).empty;

  return page(title, `
    <main class="feed-shell">
      <header class="feed-header">
        <div>
          <p class="eyebrow">Онлайн-пространство</p>
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
        <p class="eyebrow">Онлайн-пространство</p>
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

function renderPosts(posts, topics = []) {
  let lastDay = '';

  return posts.map((post) => {
    const day = formatDay(post.createdAt);
    const divider = day !== lastDay ? renderDateDivider(day) : '';
    lastDay = day;
    return `${divider}${renderPost(post, topics)}`;
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

function renderAccessBadge(access) {
  const label = access?.expiresAt
    ? `Доступ до ${formatFullDate(access.expiresAt)}`
    : 'Доступ открыт';

  return `<span class="access-badge">${escapeHtml(label)}</span>`;
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

function renderContentNav({ posts, activeView, token = '', topics = [] }) {
  const topicItems = normalizeTopics(topics);
  const counts = getViewCounts(posts, topicItems);
  const activeTopic = topicItems.find((topic) => topic.id === activeView);
  const activeParentId = activeTopic?.parentId || activeView;
  const childItems = topicItems.filter((topic) => topic.parentId === activeParentId);
  const unreadData = posts.map((post) => ({
    id: post.id,
    views: getPostViews(post, topicItems)
  }));
  const items = [
    { view: 'all', label: 'Все', count: posts.length, parentId: '' },
    ...topicItems.filter((topic) => !topic.parentId).map((topic) => ({
      view: topic.id,
      label: topic.label,
      shortLabel: topic.shortLabel || topic.label,
      count: counts[topic.id] || 0,
      parentId: ''
    }))
  ];

  return `
    <div class="content-nav" data-unread-posts="${escapeHtml(JSON.stringify(unreadData))}">
      <nav class="content-tabs" aria-label="Разделы курса">
        ${items.map((item) => renderNavItem({
          item,
          token,
          current: item.view === activeView,
          parentActive: item.view === activeParentId && item.view !== activeView
        })).join('')}
      </nav>
      ${childItems.length ? `
        <nav class="subtopic-tabs" aria-label="Подразделы">
          ${childItems.map((topic) => renderNavItem({
            item: {
              view: topic.id,
              label: topic.label,
              shortLabel: topic.shortLabel || topic.label,
              count: counts[topic.id] || 0,
              parentId: topic.parentId
            },
            token,
            current: topic.id === activeView
          })).join('')}
        </nav>
      ` : ''}
    </div>
  `;
}

function renderNavItem({ item, token, current, parentActive = false }) {
  return `
    <a class="${[item.parentId ? 'is-subtopic' : '', parentActive ? 'is-parent-active' : ''].filter(Boolean).join(' ')}" href="${escapeHtml(buildViewHref({ view: item.view, token }))}" data-view="${escapeHtml(item.view)}" ${current ? 'aria-current="page"' : ''}>
      ${renderTabIcon(item.view)}
      <span title="${escapeHtml(item.label)}">${escapeHtml(item.shortLabel || item.label)}</span>
      <b>${item.count}</b>
    </a>
  `;
}

function getViewCounts(posts, topics = []) {
  const topicItems = normalizeTopics(topics);
  const parentByChild = Object.fromEntries(
    topicItems
      .filter((topic) => topic.parentId)
      .map((topic) => [topic.id, topic.parentId])
  );

  return posts.reduce((counts, post) => {
    const topicId = getPostTopicId(post, topicItems);
    counts[topicId] = (counts[topicId] || 0) + 1;
    if (parentByChild[topicId]) {
      counts[parentByChild[topicId]] = (counts[parentByChild[topicId]] || 0) + 1;
    }
    return counts;
  }, Object.fromEntries(topicItems.map((topic) => [topic.id, 0])));
}

function renderTabIcon(view) {
  const icons = {
    all: '<path d="M4 5.5h16M4 12h16M4 18.5h10"></path>',
    photo: '<rect x="3.5" y="5" width="17" height="14" rx="3"></rect><path d="m7 15 3.2-3.2a1.4 1.4 0 0 1 2 0L16 15.5"></path><path d="m14.5 13.5 1.3-1.3a1.4 1.4 0 0 1 2 0L20.5 15"></path><circle cx="8.5" cy="9.2" r="1.2"></circle>',
    audio: '<path d="M12 4v16"></path><path d="M8 8v8"></path><path d="M16 8v8"></path><path d="M4 11v2"></path><path d="M20 11v2"></path>',
    video: '<rect x="3.5" y="6" width="12.5" height="12" rx="3"></rect><path d="m16 10 4.5-2.5v9L16 14"></path>',
    file: '<path d="M7 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z"></path><path d="M13 3.5V8h4"></path><path d="M9 13h6"></path><path d="M9 17h4"></path>',
    meditations: '<path d="M12 4.5c3 2.2 4.5 4.6 4.5 7.2A4.5 4.5 0 0 1 12 16.2a4.5 4.5 0 0 1-4.5-4.5C7.5 9.1 9 6.7 12 4.5Z"></path><path d="M6 20h12"></path>',
    'body-practices': '<path d="M12 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"></path><path d="M5 13h14"></path><path d="M8 20l4-7 4 7"></path>',
    'audio-podcasts': '<path d="M8 11a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0Z"></path><path d="M12 18v3"></path><path d="M9 21h6"></path>',
    psychosomatics: '<path d="M12 20c4-3.2 7-6 7-9.5A3.5 3.5 0 0 0 12.5 8L12 8.6 11.5 8A3.5 3.5 0 0 0 5 10.5C5 14 8 16.8 12 20Z"></path><path d="M9 12h2l1 2 1.5-4 1 2H16"></path>',
    'alexandra-lives': '<rect x="4" y="6" width="16" height="12" rx="3"></rect><path d="m10 10 5 2-5 2Z"></path>',
    'guest-lives': '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path><path d="M3.5 20a4.5 4.5 0 0 1 9 0"></path><path d="M11.5 20a4.5 4.5 0 0 1 9 0"></path>',
    'text-files': '<path d="M7 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z"></path><path d="M13 3.5V8h4"></path><path d="M9 13h6"></path><path d="M9 17h4"></path>',
    'future-moms': '<path d="M12 21c4-4 7-7.2 7-11a4 4 0 0 0-7-2.6A4 4 0 0 0 5 10c0 3.8 3 7 7 11Z"></path><circle cx="12" cy="13" r="2.2"></circle>',
    other: '<path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h8"></path>'
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

function filterPostsByView(posts, view, topics = []) {
  if (view === 'all') return posts;
  const topicItems = normalizeTopics(topics);
  const childIds = topicItems
    .filter((topic) => topic.parentId === view)
    .map((topic) => topic.id);

  return posts.filter((post) => {
    const topicId = getPostTopicId(post, topicItems);
    return topicId === view || childIds.includes(topicId);
  });
}

function getMediaView(item) {
  if (item.kind === 'photo') return 'photo';
  if (item.kind === 'audio') return 'audio';
  if (item.kind === 'video') return 'video';
  return 'file';
}

function normalizeView(value, topics = []) {
  const view = String(value || 'all').trim();
  return view === 'all' || normalizeTopics(topics).some((item) => item.id === view) ? view : 'all';
}

function getView(id, topics = []) {
  if (id === 'all') {
    return {
      id: 'all',
      heading: 'Онлайн-пространство',
      empty: 'Здесь пока нет публикаций.'
    };
  }

  const topic = getTopicById(topics, id);
  return {
    id: topic.id,
    heading: topic.label,
    empty: `${topic.label}: материалов пока нет.`
  };
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
  return /^[A-Za-z0-9_.-]{6,64}$/.test(String(token || ''));
}

function renderPost(post, topics = []) {
  const text = post.text ? `<div class="post-text">${linkify(escapeHtml(post.text))}</div>` : '';
  const media = post.media?.length ? `<div class="media-grid">${post.media.map(renderMedia).join('')}</div>` : '';

  return `
    <article class="post" data-post-id="${escapeHtml(post.id)}" data-post-views="${escapeHtml(getPostViews(post, topics).join(','))}">
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

function renderManagePost(post) {
  const preview = getPostPreview(post);

  return `
    <article class="post manage-post">
      <label class="manage-check">
        <input type="checkbox" name="postId" value="${escapeHtml(post.id)}">
        <span>Выбрать</span>
      </label>
      <div class="post-body">
        <div class="manage-post-head">
          <strong>${escapeHtml(preview)}</strong>
          <time datetime="${escapeHtml(post.createdAt)}">${escapeHtml(formatDay(post.createdAt))} ${escapeHtml(formatDateTime(post.createdAt))}</time>
        </div>
        ${post.text ? `<div class="post-text">${linkify(escapeHtml(post.text))}</div>` : ''}
        ${post.media?.length ? `<div class="media-grid">${post.media.map(renderMedia).join('')}</div>` : ''}
      </div>
    </article>
  `;
}

function getPostPreview(post) {
  const text = String(post.text || '').trim().replace(/\s+/g, ' ');
  if (text) return text.length > 46 ? `${text.slice(0, 46)}...` : text;

  const media = Array.isArray(post.media) ? post.media : [];
  if (!media.length) return 'Публикация';

  const labels = {
    photo: 'Фото',
    audio: 'Голосовое сообщение',
    video: 'Видео',
    file: 'Файл'
  };
  const first = labels[media[0]?.kind] || 'Файл';
  return media.length > 1 ? `${first} +${media.length - 1}` : first;
}

function getPostViews(post, topics = []) {
  const topicItems = normalizeTopics(topics);
  const topicId = getPostTopicId(post, topicItems);
  const parentId = topicItems.find((topic) => topic.id === topicId)?.parentId;
  return parentId ? ['all', parentId, topicId] : ['all', topicId];
}

function getPostTopicId(post, topics = []) {
  const topicId = String(post.topicId || '').trim();
  if (topicId && normalizeTopics(topics).some((topic) => topic.id === topicId)) return topicId;
  return 'other';
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
          <div class="voice-track" role="slider" aria-label="Прогресс голосового сообщения" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
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

function formatFullDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: courseTimeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
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
