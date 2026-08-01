(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.primary-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (event) => {
      if (event.target.matches('a')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const videoButton = document.querySelector('.video-toggle');
  const progress = document.querySelector('.progress-track span');
  let progressValue = 6;
  let timer = null;

  const startProgress = () => {
    clearInterval(timer);
    timer = setInterval(() => {
      progressValue += 0.12;
      if (progressValue > 100) progressValue = 0;
      progress.style.width = `${progressValue}%`;
    }, 80);
  };

  if (videoButton && progress) {
    startProgress();
    videoButton.addEventListener('click', () => {
      const paused = videoButton.dataset.state === 'paused';
      videoButton.dataset.state = paused ? 'playing' : 'paused';
      videoButton.setAttribute('aria-label', paused ? 'Pause video' : 'Play video');
      if (paused) startProgress();
      else clearInterval(timer);
    });
  }
})();
