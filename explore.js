// explore.js — Firestore-powered gallery with albums + masonry + lightbox
import { db } from './firebase-config.js';
import {
  collection, getDocs, orderBy, query
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── CURSOR + NAV (shared with main site) ────────────────────────────────────
(function initCursorAndNav() {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px'; dot.style.top = my + 'px';
  });
  (function loop() { rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12;
    ring.style.left = rx + 'px'; ring.style.top = ry + 'px'; requestAnimationFrame(loop); })();

  document.querySelectorAll('a,button').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });

  const navbar    = document.getElementById('navbar');
  const navToggle = document.getElementById('nav-toggle');
  const navLinks  = document.getElementById('nav-links');
  window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 60), { passive: true });
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open);
    navToggle.classList.toggle('active', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
})();

// ─── PARTICLE CANVAS (header only, low opacity) ─────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('explore-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function spawn() {
    particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.2 + 0.4, o: Math.random() * 0.4 + 0.15
    }));
  }
  spawn(); window.addEventListener('resize', spawn, { passive: true });

  (function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${p.o})`; ctx.fill();
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 100) { ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(201,168,76,${(1 - d/100) * 0.15})`; ctx.lineWidth = 0.5; ctx.stroke(); }
      }
    }
    requestAnimationFrame(draw);
  })();
})();

// ─── REVEAL ANIMATION for header ──────────────────────────────────────────────
document.querySelectorAll('.reveal-item').forEach((el, i) => {
  setTimeout(() => { el.classList.add('visible'); }, 200 + i * 160);
});

// ─── SCROLL REVEAL (Intersection Observer) ────────────────────────────────────
const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); } });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

// ─── STATE ─────────────────────────────────────────────────────────────────────
let currentAlbum   = null;   // { id, name }
let currentMedia   = [];     // array of media objects in active album
let lightboxIndex  = 0;

// ─── DOM REFS ──────────────────────────────────────────────────────────────────
const albumsView   = document.getElementById('albums-view');
const mediaView    = document.getElementById('media-view');
const albumsGrid   = document.getElementById('albums-grid');
const albumsEmpty  = document.getElementById('albums-empty');
const albumCount   = document.getElementById('album-count');
const masonryGrid  = document.getElementById('masonry-grid');
const mediaEmpty   = document.getElementById('media-empty');
const mediaTitle   = document.getElementById('media-album-title');
const mediaCount   = document.getElementById('media-count');
const backBtn      = document.getElementById('back-btn');

const lightbox     = document.getElementById('lightbox');
const lbContent    = document.getElementById('lightbox-content');
const lbCaption    = document.getElementById('lightbox-caption');
const lbCounter    = document.getElementById('lightbox-counter');
const lbClose      = document.getElementById('lightbox-close');
const lbPrev       = document.getElementById('lightbox-prev');
const lbNext       = document.getElementById('lightbox-next');
const lbBackdrop   = document.getElementById('lightbox-backdrop');

// ─── LOAD ALBUMS ───────────────────────────────────────────────────────────────
async function loadAlbums() {
  try {
    const snap = await getDocs(query(collection(db, 'albums'), orderBy('createdAt', 'desc')));
    // Remove skeletons
    albumsGrid.innerHTML = '';

    if (snap.empty) {
      albumsEmpty.hidden = false;
      albumCount.textContent = '0 albums';
      return;
    }

    albumCount.textContent = `${snap.size} album${snap.size !== 1 ? 's' : ''}`;

    snap.forEach(doc => {
      const data  = doc.data();
      const count = data.itemCount || 0;
      const card  = document.createElement('li');
      card.className = 'album-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Open album: ${data.name}`);

      card.innerHTML = `
        ${data.coverImage
          ? `<img class="album-cover" src="${data.coverImage}" alt="${data.name} album cover" loading="lazy" />`
          : `<div class="album-cover-placeholder" aria-hidden="true">🖼️</div>`}
        <div class="album-overlay">
          <p class="album-name">${escHtml(data.name)}</p>
          <p class="album-meta">${count} item${count !== 1 ? 's' : ''}</p>
        </div>`;

      const open = () => openAlbum(doc.id, data.name);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      albumsGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load albums:', err);
    albumCount.textContent = 'Could not load albums.';
    albumsGrid.innerHTML = `<p style="color:var(--muted);font-family:var(--font-body);font-size:.85rem;">
      Firebase not configured yet. See firebase-config.js.</p>`;
  }
}

// ─── OPEN ALBUM ────────────────────────────────────────────────────────────────
async function openAlbum(albumId, albumName) {
  currentAlbum = { id: albumId, name: albumName };
  mediaTitle.textContent = albumName;
  masonryGrid.innerHTML = '';
  mediaEmpty.hidden = true;
  mediaCount.textContent = 'Loading…';

  albumsView.hidden = true;
  mediaView.hidden  = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const snap = await getDocs(
      query(collection(db, 'albums', albumId, 'media'), orderBy('uploadedAt', 'desc'))
    );

    currentMedia = [];
    if (snap.empty) { mediaEmpty.hidden = false; mediaCount.textContent = '0 items'; return; }

    mediaCount.textContent = `${snap.size} item${snap.size !== 1 ? 's' : ''}`;

    snap.forEach((doc, idx) => {
      const m = { id: doc.id, ...doc.data() };
      currentMedia.push(m);
      const li = buildMasonryItem(m, currentMedia.length - 1);
      masonryGrid.appendChild(li);
      revealObs.observe(li);
    });
  } catch (err) {
    console.error('Failed to load media:', err);
    mediaCount.textContent = 'Error loading media.';
  }
}

// ─── BUILD MASONRY ITEM ────────────────────────────────────────────────────────
function buildMasonryItem(m, index) {
  const li = document.createElement('li');
  li.className = 'masonry-item';
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', m.caption || `Media item ${index + 1}`);

  const isVideo = m.type === 'video';

  if (isVideo) {
    li.innerHTML = `
      <video src="${m.url}" preload="metadata" muted playsinline aria-label="${escHtml(m.caption || 'Video')}"></video>
      <div class="play-overlay" aria-hidden="true">
        <div class="play-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
      </div>
      ${m.caption ? `<p class="masonry-caption">${escHtml(m.caption)}</p>` : ''}`;
  } else {
    li.innerHTML = `
      <img src="${m.url}" alt="${escHtml(m.caption || `Photo ${index + 1}`)}" loading="lazy" />
      ${m.caption ? `<p class="masonry-caption">${escHtml(m.caption)}</p>` : ''}`;
  }

  const open = () => openLightbox(index);
  li.addEventListener('click', open);
  li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return li;
}

// ─── BACK TO ALBUMS ────────────────────────────────────────────────────────────
backBtn.addEventListener('click', () => {
  mediaView.hidden  = true;
  albumsView.hidden = false;
  currentAlbum = null;
  currentMedia = [];
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─── LIGHTBOX ──────────────────────────────────────────────────────────────────
function openLightbox(index) {
  lightboxIndex = index;
  renderLightbox();
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
  lbClose.focus();
}

function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
  // Stop any playing video
  const v = lbContent.querySelector('video');
  if (v) v.pause();
}

function renderLightbox() {
  const m = currentMedia[lightboxIndex];
  if (!m) return;

  // Stop any previous video
  const oldVideo = lbContent.querySelector('video');
  if (oldVideo) oldVideo.pause();

  lbContent.innerHTML = m.type === 'video'
    ? `<video src="${m.url}" controls autoplay playsinline aria-label="${escHtml(m.caption || 'Video')}"></video>`
    : `<img src="${m.url}" alt="${escHtml(m.caption || `Photo ${lightboxIndex + 1}`)}" />`;

  lbCaption.textContent  = m.caption || '';
  lbCounter.textContent  = `${lightboxIndex + 1} / ${currentMedia.length}`;
  lbPrev.disabled = lightboxIndex === 0;
  lbNext.disabled = lightboxIndex === currentMedia.length - 1;
}

lbClose.addEventListener('click', closeLightbox);
lbBackdrop.addEventListener('click', closeLightbox);

lbPrev.addEventListener('click', () => {
  if (lightboxIndex > 0) { lightboxIndex--; renderLightbox(); }
});
lbNext.addEventListener('click', () => {
  if (lightboxIndex < currentMedia.length - 1) { lightboxIndex++; renderLightbox(); }
});

document.addEventListener('keydown', e => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft'  && lightboxIndex > 0)                       { lightboxIndex--; renderLightbox(); }
  if (e.key === 'ArrowRight' && lightboxIndex < currentMedia.length - 1) { lightboxIndex++; renderLightbox(); }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
loadAlbums();
