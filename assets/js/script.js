'use strict';

const sidebar = document.querySelector('[data-sidebar]');
const sidebarButton = document.querySelector('[data-sidebar-btn]');

sidebarButton?.addEventListener('click', () => {
  sidebar?.classList.toggle('active');
});

const navigationLinks = document.querySelectorAll('[data-nav-link]');
const pages = document.querySelectorAll('[data-page]');

navigationLinks.forEach((link) => {
  link.addEventListener('click', () => {
    const destination = link.textContent.trim().toLowerCase();

    pages.forEach((page) => {
      page.classList.toggle('active', page.dataset.page === destination);
    });

    navigationLinks.forEach((item) => {
      item.classList.toggle('active', item === link);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

const qrModal = document.querySelector('[data-qr-modal]');
const qrOpenButton = document.querySelector('[data-qr-open]');
const qrCloseButtons = document.querySelectorAll('[data-qr-close]');

const setQrModalOpen = (isOpen) => {
  qrModal?.classList.toggle('active', isOpen);
  qrModal?.setAttribute('aria-hidden', String(!isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';
};

qrOpenButton?.addEventListener('click', () => setQrModalOpen(true));
qrCloseButtons.forEach((button) => {
  button.addEventListener('click', () => setQrModalOpen(false));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && qrModal?.classList.contains('active')) {
    setQrModalOpen(false);
    qrOpenButton?.focus();
  }
});
