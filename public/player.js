document.addEventListener('click', async (event) => {
  const button = event.target.closest('.voice-play');
  if (!button) return;

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

  document.querySelectorAll('.voice-message').forEach((message) => {
    const audio = message.querySelector('audio');
    const button = message.querySelector('.voice-play');
    if (!audio || !button) return;
    button.textContent = audio === event.target ? '❚❚' : '▶';
    button.setAttribute('aria-label', audio === event.target ? 'Поставить на паузу' : 'Воспроизвести голосовое');
  });
}, true);

document.addEventListener('pause', (event) => {
  if (!(event.target instanceof HTMLAudioElement)) return;

  const message = event.target.closest('.voice-message');
  const button = message?.querySelector('.voice-play');
  if (!button) return;

  button.textContent = '▶';
  button.setAttribute('aria-label', 'Воспроизвести голосовое');
}, true);

document.addEventListener('ended', (event) => {
  if (!(event.target instanceof HTMLAudioElement)) return;

  const message = event.target.closest('.voice-message');
  const button = message?.querySelector('.voice-play');
  if (!button) return;

  button.textContent = '▶';
  button.setAttribute('aria-label', 'Воспроизвести голосовое');
}, true);
