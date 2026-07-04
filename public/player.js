document.addEventListener('click', async (event) => {
  const photoButton = event.target.closest('.photo-open[data-photo-src]');
  if (photoButton) {
    openPhotoLightbox(photoButton.dataset.photoSrc);
    return;
  }

  const photoClose = event.target.closest('[data-photo-lightbox-close]');
  if (photoClose || event.target.classList?.contains('photo-lightbox')) {
    closePhotoLightbox();
    return;
  }

  const fileAction = event.target.closest('[data-file-action]');
  if (fileAction) {
    markFileDownloaded(fileAction);
    return;
  }

  const videoPlay = event.target.closest('.video-play');
  if (videoPlay) {
    await toggleVideo(videoPlay);
    return;
  }

  const videoTimeline = event.target.closest('.video-timeline');
  if (videoTimeline) {
    seekVideo(videoTimeline, event);
    return;
  }

  const voiceTrack = event.target.closest('.voice-track');
  if (voiceTrack) {
    seekVoice(voiceTrack, event);
    return;
  }

  const videoFullscreen = event.target.closest('.video-fullscreen');
  if (videoFullscreen) {
    await openVideoFullscreen(videoFullscreen);
    return;
  }

  const videoMenuButton = event.target.closest('.video-menu-button');
  if (videoMenuButton) {
    toggleVideoMenu(videoMenuButton);
    return;
  }

  const videoSpeedButton = event.target.closest('.video-menu [data-video-speed]');
  if (videoSpeedButton) {
    setVideoSpeed(videoSpeedButton);
    return;
  }

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
    closeVideoMenus();
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
  if (event.target instanceof HTMLAudioElement) {
    updateVoiceState(event.target);
    return;
  }

  if (event.target instanceof HTMLVideoElement) {
    updateVideoState(event.target);
  }
}, true);

document.addEventListener('DOMContentLoaded', () => {
  setupVoicePlayers();
  setupVideoPlayers();
  setupSeekBars();
  setupFileCards();
  updateUnreadTabs();
  updateNewBadges();
  document.querySelectorAll('.content-tabs a').forEach((link) => {
    link.addEventListener('click', markVisiblePostsRead);
  });
});

document.addEventListener('fullscreenchange', updateFullscreenButtons);
document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePhotoLightbox();
  }
});

window.addEventListener('beforeunload', markVisiblePostsRead);

function openPhotoLightbox(src) {
  if (!src) return;

  closePhotoLightbox();

  const lightbox = document.createElement('div');
  lightbox.className = 'photo-lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.innerHTML = `
    <button class="photo-lightbox-close" type="button" data-photo-lightbox-close aria-label="Закрыть фото"></button>
    <img src="${escapeAttribute(src)}" alt="">
  `;

  document.body.append(lightbox);
  document.body.classList.add('is-photo-open');
}

function closePhotoLightbox() {
  const lightbox = document.querySelector('.photo-lightbox');
  if (!lightbox) return;

  lightbox.remove();
  document.body.classList.remove('is-photo-open');
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setupFileCards() {
  document.querySelectorAll('.file-card[data-file-url]').forEach((card) => {
    updateFileCard(card, isFileDownloaded(card.dataset.fileUrl));
  });
}

function markFileDownloaded(action) {
  const card = action.closest('.file-card[data-file-url]');
  if (!card) return;

  const files = getDownloadedFiles();
  const wasDownloaded = files.has(card.dataset.fileUrl);
  files.add(card.dataset.fileUrl);
  saveDownloadedFiles(files);

  if (wasDownloaded) {
    updateFileCard(card, true);
    return;
  }

  setTimeout(() => updateFileCard(card, true), 0);
}

function updateFileCard(card, downloaded) {
  const action = card.querySelector('[data-file-action]');
  const text = card.querySelector('.file-action-text');
  const status = card.querySelector('[data-file-status]');
  if (!action) return;

  card.classList.toggle('is-downloaded', downloaded);
  action.setAttribute('aria-label', downloaded ? 'Открыть файл' : 'Скачать файл');

  if (downloaded) {
    action.removeAttribute('download');
    action.setAttribute('target', '_blank');
    action.setAttribute('rel', 'noreferrer');
  } else {
    action.setAttribute('download', '');
    action.removeAttribute('target');
    action.removeAttribute('rel');
  }

  if (text) text.textContent = downloaded ? 'Открыть' : 'Скачать';
  if (status) status.textContent = downloaded ? 'Файл уже скачан в этом браузере' : 'Файл можно скачать на устройство';
}

function isFileDownloaded(url) {
  return getDownloadedFiles().has(url);
}

function getDownloadedFiles() {
  try {
    return new Set(JSON.parse(localStorage.getItem('courseFeedDownloadedFiles') || '[]'));
  } catch {
    return new Set();
  }
}

function saveDownloadedFiles(files) {
  localStorage.setItem('courseFeedDownloadedFiles', JSON.stringify([...files].slice(-300)));
}

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

function setupVideoPlayers() {
  document.querySelectorAll('.video-player video').forEach((video) => {
    video.addEventListener('loadedmetadata', () => updateVideoState(video));
    video.addEventListener('timeupdate', () => updateVideoState(video));
    video.addEventListener('pause', () => updateVideoState(video));
    video.addEventListener('ended', () => updateVideoState(video));
    video.addEventListener('volumechange', () => updateVideoVolume(video));
    updateVideoState(video);
    updateVideoVolume(video);
  });

  document.querySelectorAll('.video-volume-slider').forEach((slider) => {
    slider.addEventListener('input', () => setVideoVolume(slider));
  });
}

function setupSeekBars() {
  document.querySelectorAll('.video-timeline, .voice-track').forEach((track) => {
    track.addEventListener('pointerdown', (event) => startSeekDrag(track, event));
  });
}

async function toggleVideo(button) {
  const player = button.closest('.video-player');
  const video = player?.querySelector('video');
  if (!video) return;

  document.querySelectorAll('.video-player video').forEach((item) => {
    if (item !== video) item.pause();
  });
  document.querySelectorAll('.voice-message audio').forEach((audio) => audio.pause());

  if (video.paused) {
    try {
      await video.play();
    } catch {
      return;
    }
  } else {
    video.pause();
  }
}

function seekVideo(timeline, event) {
  const player = timeline.closest('.video-player');
  const video = player?.querySelector('video');
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

  video.currentTime = video.duration * getSeekRatio(timeline, event);
  updateVideoState(video);
}

function seekVoice(track, event) {
  const message = track.closest('.voice-message');
  const audio = message?.querySelector('audio');
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

  audio.currentTime = audio.duration * getSeekRatio(track, event);
  updateVoiceState(audio);
}

function startSeekDrag(track, event) {
  if (event.button !== undefined && event.button !== 0) return;

  const media = getSeekMedia(track);
  if (!media || !Number.isFinite(media.duration) || media.duration <= 0) return;

  event.preventDefault();
  track.setPointerCapture?.(event.pointerId);
  updateSeekPosition(track, event);

  const move = (moveEvent) => updateSeekPosition(track, moveEvent);
  const stop = (upEvent) => {
    updateSeekPosition(track, upEvent);
    track.releasePointerCapture?.(upEvent.pointerId);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

function updateSeekPosition(track, event) {
  if (track.classList.contains('video-timeline')) {
    seekVideo(track, event);
    return;
  }

  seekVoice(track, event);
}

function getSeekMedia(track) {
  if (track.classList.contains('video-timeline')) {
    return track.closest('.video-player')?.querySelector('video') || null;
  }

  return track.closest('.voice-message')?.querySelector('audio') || null;
}

function getSeekRatio(track, event) {
  const rect = track.getBoundingClientRect();
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
}

async function openVideoFullscreen(button) {
  const player = button.closest('.video-player');
  const video = player?.querySelector('video');
  if (!player || !video) return;

  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
      return;
    }

    if (player.requestFullscreen) {
      await player.requestFullscreen();
    } else if (player.webkitRequestFullscreen) {
      await player.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  } catch {
    return;
  }
}

function updateFullscreenButtons() {
  const activePlayer = document.fullscreenElement?.closest?.('.video-player')
    || document.webkitFullscreenElement?.closest?.('.video-player')
    || null;

  document.querySelectorAll('.video-fullscreen').forEach((button) => {
    const isActive = button.closest('.video-player') === activePlayer;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-label', isActive ? 'Вернуть видео на страницу' : 'Открыть на весь экран');
  });
}

function toggleVideoMenu(button) {
  const wrap = button.closest('.video-menu-wrap');
  const menu = wrap?.querySelector('.video-menu');
  if (!menu) return;

  const willOpen = menu.hidden;
  closeVideoMenus();
  closeVoiceMenus();
  menu.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function closeVideoMenus() {
  document.querySelectorAll('.video-menu').forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll('.video-menu-button[aria-expanded="true"]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function setVideoSpeed(button) {
  const player = button.closest('.video-player');
  const video = player?.querySelector('video');
  const speed = Number(button.dataset.videoSpeed);
  if (!video || !Number.isFinite(speed)) return;

  video.playbackRate = speed;
  player.querySelectorAll('.video-menu [data-video-speed]').forEach((item) => {
    item.classList.toggle('is-active', item === button);
  });
  closeVideoMenus();
}

function setVideoVolume(slider) {
  const player = slider.closest('.video-player');
  const video = player?.querySelector('video');
  const value = Number(slider.value);
  if (!video || !Number.isFinite(value)) return;

  video.volume = Math.min(1, Math.max(0, value));
  video.muted = video.volume === 0;
  updateVideoVolume(video);
}

function updateVideoVolume(video) {
  const player = video.closest('.video-player');
  if (!player) return;

  const slider = player.querySelector('.video-volume-slider');
  const volume = video.muted ? 0 : video.volume;
  const level = Math.ceil(volume * 5);

  if (slider) {
    slider.value = String(volume);
    slider.style.setProperty('--volume', `${volume * 100}%`);
  }
  player.dataset.volumeLevel = String(level);
}

function updateVideoState(video) {
  const player = video.closest('.video-player');
  if (!player) return;

  const button = player.querySelector('.video-play');
  const time = player.querySelector('.video-time');
  const progress = player.querySelector('.video-progress');
  const timeline = player.querySelector('.video-timeline');
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const percent = duration > 0 ? Math.min(100, (video.currentTime / duration) * 100) : 0;

  if (button) {
    button.classList.toggle('is-playing', !video.paused);
    button.setAttribute('aria-label', video.paused ? 'Воспроизвести видео' : 'Поставить видео на паузу');
  }
  if (time) time.textContent = formatVoiceTime(video.paused && video.currentTime === 0 ? duration : video.currentTime);
  if (progress) progress.style.width = `${percent}%`;
  if (timeline) timeline.setAttribute('aria-valuenow', String(Math.round(percent)));
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
  const track = message.querySelector('.voice-track');
  if (track) track.setAttribute('aria-valuenow', String(Math.round(percent)));
}

function formatVoiceTime(value) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
