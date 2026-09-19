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
