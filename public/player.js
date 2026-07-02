document.addEventListener('play', (event) => {
  if (!(event.target instanceof HTMLAudioElement)) return;

  document.querySelectorAll('.voice-message audio').forEach((audio) => {
    if (audio !== event.target) audio.pause();
  });
}, true);

document.addEventListener('DOMContentLoaded', () => {
  updateUnreadTabs();
  updateNewBadges();
  document.querySelectorAll('.content-tabs a').forEach((link) => {
    link.addEventListener('click', markVisiblePostsRead);
  });
});

window.addEventListener('beforeunload', markVisiblePostsRead);

function updateUnreadTabs() {
  const nav = document.querySelector('.content-tabs[data-unread-posts]');
  if (!nav) return;

  const posts = readUnreadPosts(nav);
  const readIds = getReadIds();
  const counts = { all: 0, photo: 0, audio: 0, video: 0, file: 0 };

  posts.forEach((post) => {
    if (readIds.has(post.id)) return;

    (post.views || ['all']).forEach((view) => {
      counts[view] = (counts[view] || 0) + 1;
    });
  });

  nav.querySelectorAll('a[data-view]').forEach((link) => {
    const view = link.dataset.view || 'all';
    const badge = link.querySelector('b');
    const count = counts[view] || 0;

    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle('has-unread', count > 0);
    }
  });
}

function markVisiblePostsRead() {
  const posts = [...document.querySelectorAll('.post[data-post-id]')];
  if (!posts.length) return;

  const readIds = getReadIds();
  posts.forEach((post) => readIds.add(post.dataset.postId));
  saveReadIds(readIds);
  updateUnreadTabs();
}

function updateNewBadges() {
  const readIds = getReadIds();

  document.querySelectorAll('.post[data-post-id]').forEach((post) => {
    const badge = post.querySelector('.new-badge');
    if (!badge) return;

    badge.hidden = readIds.has(post.dataset.postId);
  });
}

function readUnreadPosts(nav) {
  try {
    const posts = JSON.parse(nav.dataset.unreadPosts || '[]');
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

function getReadIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('courseFeedReadPosts') || '[]'));
  } catch {
    return new Set();
  }
}

function saveReadIds(readIds) {
  localStorage.setItem('courseFeedReadPosts', JSON.stringify([...readIds].slice(-600)));
}
