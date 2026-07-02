document.addEventListener('click', async (event) => {
  const menuButton = event.target.closest('.voice-menu-button');
  if (menuButton) {
    toggleVoiceMenu(menuButton);
    return;
  }

  const speedButton = event.target.closest('.voice-menu [data-speed]');
  if (speedButton) {
    setVoiceSpeed(speedButton);
    return;
  }

  const button = event.target.closest('.voice-play');
  if (!button) {
    closeVoiceMenus();
    return;
  }

  const message = button.closest('.voice-message');
  const audio = message?.querySelector('audio');
  if (!audio) return;

  document.querySelectorAll('.voice-message audio').forEach((item) => {
    if (item !== audio) item.pause();
  });

  if (audio.paused) {
    try {
      await audio.play();
    } catch {
      return;
    }
  } else {
    audio.pause();
  }
});

document.addEventListener('play', (event) => {
  if (!(event.target instanceof HTMLAudioElement)) return;
  updateVoiceState(event.target);
}, true);

document.addEventListener('DOMContentLoaded', () => {
  setupVoicePlayers();
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

function setupVoicePlayers() {
  document.querySelectorAll('.voice-message audio').forEach((audio) => {
    audio.addEventListener('loadedmetadata', () => updateVoiceState(audio));
    audio.addEventListener('timeupdate', () => updateVoiceState(audio));
    audio.addEventListener('pause', () => updateVoiceState(audio));
    audio.addEventListener('ended', () => updateVoiceState(audio));
    updateVoiceState(audio);
  });
}

function toggleVoiceMenu(button) {
  const wrap = button.closest('.voice-menu-wrap');
  const menu = wrap?.querySelector('.voice-menu');
  if (!menu) return;

  const willOpen = menu.hidden;
  closeVoiceMenus();
  menu.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function closeVoiceMenus() {
  document.querySelectorAll('.voice-menu').forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll('.voice-menu-button[aria-expanded="true"]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function setVoiceSpeed(button) {
  const message = button.closest('.voice-message');
  const audio = message?.querySelector('audio');
  const speed = Number(button.dataset.speed);
  if (!audio || !Number.isFinite(speed)) return;

  audio.playbackRate = speed;
  message.querySelectorAll('.voice-menu [data-speed]').forEach((item) => {
    item.classList.toggle('is-active', item === button);
  });
  closeVoiceMenus();
}

function updateVoiceState(audio) {
  const message = audio.closest('.voice-message');
  if (!message) return;

  const button = message.querySelector('.voice-play');
  const icon = message.querySelector('.voice-play-icon');
  const time = message.querySelector('.voice-time');
  const progress = message.querySelector('.voice-progress');
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const percent = duration > 0 ? Math.min(100, (audio.currentTime / duration) * 100) : 0;

  if (button) button.classList.toggle('is-playing', !audio.paused);
  if (button) button.setAttribute('aria-label', audio.paused ? 'Воспроизвести голосовое' : 'Поставить на паузу');
  if (time) time.textContent = formatVoiceTime(audio.paused && audio.currentTime === 0 ? duration : audio.currentTime);
  if (progress) progress.style.width = `${percent}%`;
}

function formatVoiceTime(value) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
