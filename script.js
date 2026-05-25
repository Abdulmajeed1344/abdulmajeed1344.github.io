/* =============================================
   ABDUL MAJEED PORTFOLIO — script.js
============================================= */

(function () {
  'use strict';

  // ─── CUSTOM CURSOR ────────────────────────────────────────────
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');

  let mouseX = 0, mouseY = 0;
  let ringX  = 0, ringY  = 0;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = mouseX + 'px';
    dot.style.top  = mouseY + 'px';
  });

  // Smooth ring follow
  function animateCursor() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    ring.style.left = ringX + 'px';
    ring.style.top  = ringY + 'px';
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // Scale on hover
  const clickables = document.querySelectorAll('a, button, .project-card, .skill-tag, .stat-card');
  clickables.forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });

  // Hide cursor when leaving window
  document.addEventListener('mouseleave', () => {
    dot.style.opacity  = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity  = '1';
    ring.style.opacity = '0.6';
  });

  // ─── NAVBAR SCROLL ───────────────────────────────────────────
  const navbar    = document.getElementById('navbar');
  const navToggle = document.getElementById('nav-toggle');
  const navLinks  = document.getElementById('nav-links');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }, { passive: true });

  // Mobile nav toggle
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen);
    navToggle.classList.toggle('active', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close mobile nav on link click
  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // ─── HERO TEXT STAGGER ANIMATION ─────────────────────────────
  const heroEls = document.querySelectorAll('.reveal-hero');
  heroEls.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('animated');
    }, 200 + i * 180);
  });

  // ─── TYPEWRITER EFFECT ───────────────────────────────────────
  const roles  = ['IT Professional', 'Data Analyst', 'MFS Product Specialist', 'Software Developer'];
  const target = document.getElementById('typed-text');
  let roleIdx = 0, charIdx = 0, deleting = false;

  function typeWriter() {
    const current = roles[roleIdx];
    if (!deleting) {
      target.textContent = current.slice(0, charIdx + 1);
      charIdx++;
      if (charIdx === current.length) {
        deleting = true;
        setTimeout(typeWriter, 1800);
        return;
      }
      setTimeout(typeWriter, 70);
    } else {
      target.textContent = current.slice(0, charIdx - 1);
      charIdx--;
      if (charIdx === 0) {
        deleting = false;
        roleIdx  = (roleIdx + 1) % roles.length;
        setTimeout(typeWriter, 350);
        return;
      }
      setTimeout(typeWriter, 38);
    }
  }

  // Start typewriter after hero animation
  setTimeout(typeWriter, 1400);

  // ─── SCROLL REVEAL (Intersection Observer) ────────────────────
  const revealEls = document.querySelectorAll('.reveal-section');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));

  // ─── PARTICLE CANVAS ─────────────────────────────────────────
  const canvas = document.getElementById('particle-canvas');
  const ctx    = canvas.getContext('2d');

  let W = 0, H = 0;
  let particles = [];
  let mouse = { x: -9999, y: -9999 };

  // Fewer particles on mobile for performance
  const isMobile = () => window.innerWidth < 768;
  const PARTICLE_COUNT = () => isMobile() ? 55 : 110;
  const MAX_DIST = () => isMobile() ? 100 : 150;
  const MOUSE_REPEL = 80;

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function createParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT(); i++) {
      particles.push({
        x:  Math.random() * W,
        y:  Math.random() * H,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        r:  Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.5 + 0.2,
      });
    }
  }
  createParticles();
  window.addEventListener('resize', createParticles, { passive: true });

  // Track mouse over hero
  const heroSection = document.getElementById('hero');
  heroSection.addEventListener('mousemove', e => {
    const rect = heroSection.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  heroSection.addEventListener('mouseleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  function drawParticles() {
    ctx.clearRect(0, 0, W, H);
    const maxD = MAX_DIST();

    particles.forEach(p => {
      // Mouse repel
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_REPEL) {
        const force = (MOUSE_REPEL - dist) / MOUSE_REPEL * 0.8;
        p.vx += (dx / dist) * force * 0.4;
        p.vy += (dy / dist) * force * 0.4;
      }

      // Dampen
      p.vx *= 0.985;
      p.vy *= 0.985;

      // Move
      p.x += p.vx;
      p.y += p.vy;

      // Wrap edges
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${p.opacity})`;
      ctx.fill();
    });

    // Draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a  = particles[i];
        const b  = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < maxD) {
          const alpha = (1 - d / maxD) * 0.22;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(201,168,76,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(drawParticles);
  }
  drawParticles();

  // ─── SMOOTH SCROLL FOR ANCHOR LINKS ──────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ─── ACTIVE NAV LINK HIGHLIGHT ───────────────────────────────
  const sections  = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-link');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navAnchors.forEach(a => {
          a.classList.toggle('active-nav', a.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(s => sectionObserver.observe(s));

  // Add active-nav style dynamically
  const navStyle = document.createElement('style');
  navStyle.textContent = `
    .nav-link.active-nav { color: var(--gold) !important; }
    .nav-link.active-nav::after { width: 100% !important; }
    .nav-toggle.active span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .nav-toggle.active span:nth-child(2) { opacity: 0; }
    .nav-toggle.active span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  `;
  document.head.appendChild(navStyle);

})();
