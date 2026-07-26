/* =============================================
   app.js — Pauline Secret Recipe App
   ============================================= */

'use strict';

// ── Auto-categorize by title keywords ────────
const KEYWORD_CATS = [
  { cat: 'Морозиво',        keys: ['мороженое', 'эскимо', 'сорбет', 'морозиво'] },
  { cat: 'Торти',            keys: ['торт', 'сметанник', 'чизкейк', 'сан себастьян', 'торти'] },
  { cat: 'Печиво',          keys: ['печенье', 'мадлен', 'орешки', 'ёлочка', 'печиво'] },
  { cat: 'Декор',            keys: ['декор', 'бант', 'swan', 'цветами', 'цыпленком', 'корейский'] },
  { cat: 'Десерти',          keys: ['меренговый', 'рулет', 'павлова', 'кейк-попс', 'кейк–попс', 'десерти'] },
  { cat: 'Випічка',          keys: ['пирог', 'блины', 'блин', 'випічка'] },
];

function guessCat(title) {
  const t = title.toLowerCase();
  for (const { cat, keys } of KEYWORD_CATS) {
    if (keys.some(k => t.includes(k))) return cat;
  }
  return 'Інше';
}

function getCategories(r) {
  const cats = r.info?.categories || r.categories || [];
  if (cats.length) return cats;
  // fallback: guess from title
  const title = r.info?.title || '';
  return [{ category_id: guessCat(title), name: guessCat(title) }];
}

// ── State ────────────────────────────────────
let allRecipes   = [];
let filtered     = [];
let activeCategory = 'all';
let searchQuery  = '';
let sortMode     = 'default';
let favorites    = JSON.parse(localStorage.getItem('ps_favorites') || '[]');
let currentRecipe = null;
let currentGalleryIdx = 0;

// ── DOM refs ─────────────────────────────────
const grid        = document.getElementById('recipesGrid');
const emptyState  = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const categoryTabs= document.getElementById('categoryTabs');
const sortSelect  = document.getElementById('sortSelect');
const resultsInfo = document.getElementById('resultsInfo');
const statTotal   = document.getElementById('statTotal');
const statCats    = document.getElementById('statCats');
const overlay     = document.getElementById('modalOverlay');
const modalTitle  = document.getElementById('modalTitle');
const modalBadge  = document.getElementById('modalBadge');
const modalMeta   = document.getElementById('modalMeta');
const modalBody   = document.getElementById('modalBody');
const modalFavBtn = document.getElementById('modalFavBtn');
const modalPdfBtn = document.getElementById('modalPdfBtn');
const modalClose  = document.getElementById('modalClose');
const modalCalcBtn = document.getElementById('modalCalcBtn');
const calcPanel    = document.getElementById('calculatorPanel');
const closeCalcBtn = document.getElementById('closeCalcBtn');
const themeBtn    = document.getElementById('themeBtn');
const backTop     = document.getElementById('backTop');
const toastEl     = document.getElementById('toast');
const progBanner  = document.getElementById('progressBanner');
const progText    = document.getElementById('progressText');

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadRecipes();
  bindEvents();
  startProgressTracker();
});

async function loadRecipes() {
  try {
    let data;
    if (window.RECIPES) {
      data = window.RECIPES;
    } else {
      const res = await fetch('pauline_recipes.json');
      if (!res.ok) throw new Error('not found');
      data = await res.json();
    }
    
    // 5=Збірники, 21=Вебінари, 22=Курси, 23=Марафони, 24=Гайди, 25=База знань
    const IGNORE_CATS = [5, 21, 22, 23, 24, 25];
    allRecipes = data.filter(r => {
      const cats = r.info?.categories || r.categories || [];
      // Якщо ВСІ категорії цього рецепту є "сміттєвими", або хоча б одна з них є "Ефіри" чи "Блог"
      return !cats.some(c => IGNORE_CATS.includes(c.category_id));
    });
    
    buildCategories();
    renderGrid();
    updateStats();
  } catch (e) {
    grid.innerHTML = `
      <div class="loading-state" style="color:var(--text3)">
        <div style="font-size:48px">📂</div>
        <p><b>Файл pauline_recipes.json не знайдено</b></p>
        <p style="font-size:0.85rem;margin-top:8px">Поклади файл у папку з index.html</p>
      </div>`;
  }
}

// ── Progress Tracker ──────────────────────────
let lastTranslatedCount = -1;

async function reloadDataSilent() {
  try {
    const res = await fetch('pauline_recipes.json?' + new Date().getTime());
    if (res.ok) {
      const data = await res.json();
      const IGNORE_CATS = [5, 21, 22, 23, 24, 25];
      allRecipes = data.filter(r => {
        const cats = r.info?.categories || r.categories || [];
        return !cats.some(c => IGNORE_CATS.includes(c.category_id));
      });
      
      // rebuild categories quietly
      const catMap = {};
      allRecipes.forEach(r => getCategories(r).forEach(c => { catMap[c.category_id] = c.name; }));
      statCats.textContent = Object.keys(catMap).length || '—';
      statTotal.textContent = allRecipes.length;
      
      // don't overwrite active tabs completely, just re-render grid
      renderGrid();
    }
  } catch (e) {}
}

async function checkProgress() {
  try {
    const res = await fetch('progress.json?' + new Date().getTime());
    if (!res.ok) return;
    const data = await res.json();
    
    if (data.status === 'running') {
      progBanner.style.display = 'block';
      progBanner.style.background = 'var(--accent)';
      const spinner = progBanner.querySelector('.spinner');
      if(spinner) spinner.style.display = 'inline-block';
      progText.textContent = `Переклад рецептів: [${data.current}/${data.total}] поточний: ${data.recipe}`;
      
      // Auto-reload if we translated a new recipe and modal is closed
      if (lastTranslatedCount !== -1 && data.current > lastTranslatedCount) {
        if (!overlay.classList.contains('open')) {
          await reloadDataSilent();
        }
      }
      lastTranslatedCount = data.current;
      
    } else if (data.status === 'done') {
      progBanner.style.display = 'block';
      progBanner.style.background = '#4CAF50';
      const spinner = progBanner.querySelector('.spinner');
      if(spinner) spinner.style.display = 'none';
      progText.textContent = 'Переклад завершено! Усі рецепти українською.';
      
      if (lastTranslatedCount !== -1 && data.current > lastTranslatedCount) {
        if (!overlay.classList.contains('open')) {
          await reloadDataSilent();
        }
      }
      lastTranslatedCount = data.current;
      
    } else {
      progBanner.style.display = 'none';
    }
  } catch (e) {
    progBanner.style.display = 'none';
  }
}

function startProgressTracker() {
  checkProgress();
  setInterval(checkProgress, 3000); // Check every 3 seconds for smoother updates
}

// ── Categories ────────────────────────────────
function buildCategories() {
  const catMap = {};
  allRecipes.forEach(r => {
    getCategories(r).forEach(c => {
      catMap[c.category_id] = c.name;
    });
  });

  const cats = Object.entries(catMap);
  statCats.textContent = cats.length || '—';

  categoryTabs.innerHTML = `
    <button class="cat-tab active" data-cat="all">Всі рецепти</button>
    <button class="cat-tab" data-cat="favorites">❤️ Обране</button>
  `;
  cats.forEach(([id, name]) => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab';
    btn.dataset.cat = id;
    btn.textContent = name;
    categoryTabs.appendChild(btn);
  });

  categoryTabs.addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    
    // Smooth scroll the clicked tab into view
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    
    renderGrid();
  });
  
  // Enable horizontal scrolling with mouse wheel
  categoryTabs.addEventListener('wheel', e => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      categoryTabs.scrollLeft += e.deltaY * 1.5; // multiplier for slightly faster scroll
    }
  }, { passive: false });
}

// ── Render Grid ───────────────────────────────
function renderGrid() {
  // Filter
  filtered = allRecipes.filter(r => {
    const title = (r.info?.title || '').toLowerCase();
    const matchSearch = !searchQuery || title.includes(searchQuery.toLowerCase());
    const cats = getCategories(r);
    const isFav = favorites.includes(r.info?.card_id);
    let matchCat = false;
    if (activeCategory === 'all') {
      matchCat = true;
    } else if (activeCategory === 'favorites') {
      matchCat = isFav;
    } else {
      matchCat = cats.some(c => String(c.category_id) === activeCategory || c.name === activeCategory);
    }
    return matchSearch && matchCat;
  });

  // Sort
  if (sortMode === 'az') filtered.sort((a,b) => (a.info?.title||'').localeCompare(b.info?.title||'', 'ru'));
  if (sortMode === 'za') filtered.sort((a,b) => (b.info?.title||'').localeCompare(a.info?.title||'', 'ru'));
  if (sortMode === 'time') filtered.sort((a,b) => {
    let cA = a.card || {}; if (cA.card) cA = cA.card;
    let cB = b.card || {}; if (cB.card) cB = cB.card;
    const ta = parseInt(cA.cooking_time) || 999;
    const tb = parseInt(cB.cooking_time) || 999;
    return ta - tb;
  });

  // Update info
  resultsInfo.textContent = filtered.length
    ? `Показано ${filtered.length} із ${allRecipes.length} рецептів`
    : '';

  if (!filtered.length) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  grid.innerHTML = filtered.map((r, i) => buildCard(r, i)).join('');

  // Bind card clicks
  grid.querySelectorAll('.recipe-card').forEach((el, i) => {
    el.addEventListener('click', e => {
      if (e.target.closest('.card-fav')) return;
      openModal(filtered[i]);
    });
    el.querySelector('.card-fav')?.addEventListener('click', () => toggleFav(filtered[i].info.card_id, el.querySelector('.card-fav')));
  });
}

function buildCard(r, idx) {
  const info  = r.info || {};
  let card = r.card || {};
  if (card.card) card = card.card;
  const cats  = getCategories(r);
  const isFav = favorites.includes(info.card_id);
  const delay = Math.min(idx * 0.05, 0.5);

  return `
    <article class="recipe-card" style="animation-delay:${delay}s" tabindex="0" role="button" aria-label="${info.title}">
      <div class="card-img-wrap">
        <img class="card-img" src="${info.icon_url || ''}" alt="${info.title}" loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect fill=%22%23f0e8e0%22 width=%22400%22 height=%22300%22/><text x=%22200%22 y=%22160%22 font-size=%2260%22 text-anchor=%22middle%22>🎂</text></svg>'" />
        <button class="card-fav ${isFav ? 'active' : ''}" aria-label="В обране">${isFav ? '❤️' : '🤍'}</button>
        ${card.cooking_time ? `<span class="card-time">⏱ ${card.cooking_time}</span>` : ''}
      </div>
      <div class="card-body">
        ${cats.length ? `<div class="card-cats">${cats.map(c => `<span class="card-cat">${c.name}</span>`).join('')}</div>` : ''}
        <h3 class="card-title">${info.title || 'Рецепт'}</h3>
        <div class="card-footer">
          <span class="card-read">Відкрити рецепт</span>
          <span class="card-arrow">→</span>
        </div>
      </div>
    </article>`;
}

// ── Stats ─────────────────────────────────────
function updateStats() {
  statTotal.textContent = allRecipes.length;
}

// ── Modal ─────────────────────────────────────
function openModal(r) {
  currentRecipe = r;
  currentGalleryIdx = 0;
  const info = r.info || {};
  let card = r.card || {};
  if (card.card) card = card.card;
  

  
  const cats = info.categories || r.categories || [];
  const isFav = favorites.includes(info.card_id);

  modalBadge.textContent = cats.map(c => c.name).join(' · ') || 'Рецепт';
  modalTitle.textContent = info.title || '';
  modalMeta.innerHTML = [
    card.cooking_time ? `<span>⏱ ${card.cooking_time}</span>` : '',
    `<span>🃏 #${info.card_id}</span>`,
  ].filter(Boolean).join('');

  modalFavBtn.textContent = isFav ? '❤️' : '♡';
  modalFavBtn.classList.toggle('active', isFav);
  modalFavBtn.onclick = () => toggleFavModal(info.card_id);
  modalPdfBtn.onclick = () => printRecipe();

  const content = card.content || [];
  let hasIngredients = false;
  const checkRegex = /(\d+(?:[.,]\d+)?)(?:\s*[-—–]\s*(\d+(?:[.,]\d+)?))?\s*(г|кг|мл|л|шт|ст\.?\s*л\.?|с\.?\s*л\.?|ч\.?\s*л\.?|с\.?\s*т\.?)(?![а-яА-Яa-zA-ZіІїЇєЄґҐ])/i;
  
  for (const b of content) {
    if (b.type === 'paragraph') {
      if (checkRegex.test(b.data.text || '')) {
        hasIngredients = true;
        break;
      }
    }
  }
  
  const modalCalcBtn = document.getElementById('modalCalcBtn');
  if (hasIngredients) {
    modalCalcBtn.style.display = 'flex';
  } else {
    modalCalcBtn.style.display = 'none';
  }

  // Parse blocks
  modalBody.innerHTML = buildModalContent(r);
  
  // Setup calculator
  setupCalculator(r);

  bindGallery();
  bindSections();

  overlay.classList.add('open');
  
  // Prevent layout shift from scrollbar disappearing
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
  document.body.classList.add('modal-open');
  
  modalBody.scrollTop = 0;
}

function closeModal() {
  overlay.classList.remove('open');
  document.body.classList.remove('modal-open');
  document.documentElement.style.removeProperty('--scrollbar-width');
  overlay.querySelector('.modal').classList.remove('calc-open');
  currentRecipe = null;
}

function buildModalContent(r) {
  let card = r.card || {};
  if (card.card) card = card.card;
  const info = r.info || {};
  const content = card.content || [];
  const images  = card.slider_images || (info.icon_url ? [info.icon_url] : []);

  let html = '';

  // Gallery
  if (images.length) {
    html += buildGallery(images);
  }

  // Parse blocks
  html += parseBlocks(content, info.title || '');

  // PDF Link
  if (card.file_url) {
    html += `
      <a class="pdf-banner" href="${card.file_url}" target="_blank" rel="noopener">
        <span class="pdf-banner-icon">📄</span>
        <div class="pdf-banner-text">
          <div class="pdf-banner-title">Завантажити PDF рецепта</div>
          <div class="pdf-banner-sub">Оригінальний файл від Pauline Secret</div>
        </div>
        <span class="pdf-banner-arrow">↗</span>
      </a>`;
  }

  return html;
}

function buildGallery(images) {
  if (images.length === 1) {
    return `<div class="recipe-gallery"><div class="gallery-main"><img src="${images[0]}" alt="Фото рецепта" /></div></div>`;
  }
  const dots = images.map((_,i) => `<div class="gallery-dot ${i===0?'active':''}" data-idx="${i}"></div>`).join('');
  const thumbs = images.map((url,i) => `
    <div class="gallery-thumb ${i===0?'active':''}" data-idx="${i}">
      <img src="${url}" alt="" loading="lazy" />
    </div>`).join('');
  return `
    <div class="recipe-gallery" id="recipeGallery" data-images='${JSON.stringify(images)}'>
      <div class="gallery-main" id="galleryMain">
        <img src="${images[0]}" alt="Фото рецепта" id="galleryImg" />
        <div class="gallery-dots" id="galleryDots">${dots}</div>
      </div>
      <div class="gallery-thumbs" id="galleryThumbs">${thumbs}</div>
    </div>`;
}

function bindGallery() {
  const gallery = document.getElementById('recipeGallery');
  if (!gallery) return;
  const images = JSON.parse(gallery.dataset.images || '[]');
  const img    = document.getElementById('galleryImg');

  const setIdx = idx => {
    currentGalleryIdx = idx;
    img.src = images[idx];
    document.querySelectorAll('.gallery-dot').forEach((d,i) => d.classList.toggle('active', i===idx));
    document.querySelectorAll('.gallery-thumb').forEach((t,i) => t.classList.toggle('active', i===idx));
  };

  document.querySelectorAll('.gallery-dot').forEach(d => d.addEventListener('click', () => setIdx(+d.dataset.idx)));
  document.querySelectorAll('.gallery-thumb').forEach(t => t.addEventListener('click', () => setIdx(+t.dataset.idx)));
}

// ── Block Parser ──────────────────────────────
function parseBlocks(content, recipeTitle = '') {
  let html = '';
  let i = 0;
  let stepCounter = 0;
  let inSection = false;
  let inIngredients = false;
  let sectionBg = 'gray';
  let isFirstContainer = true;

  const closeSection = () => {
    if (inSection) { html += '</div></div>'; inSection = false; stepCounter = 0; inIngredients = false; }
  };

  while (i < content.length) {
    const block = content[i];
    const type  = block.type;
    const data  = block.data || {};

    if (type === 'container') {
      // Перевіряємо, чи є всередині контент (до наступного контейнера)
      let hasContent = false;
      for (let j = i + 1; j < content.length; j++) {
        if (content[j].type === 'container') break;
        if (content[j].type === 'paragraph' && (content[j].data.text || '').trim()) { hasContent = true; break; }
        if (content[j].type === 'embed' || content[j].type === 'slidertool') { hasContent = true; break; }
      }
      // Якщо контейнер порожній (немає тексту/відео) - пропускаємо його
      if (!hasContent) {
        i++;
        continue;
      }

      if (isFirstContainer) {
        isFirstContainer = false;
        const blockTxt = (data.text || '').toLowerCase();
        const titleWords = recipeTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const matchesTitle = titleWords.length > 0 && titleWords.some(w => blockTxt.includes(w));
        const isStandard = blockTxt.includes('инвентарь') || blockTxt.includes('ингредиент') || blockTxt.includes('приготовление') || blockTxt.includes('сборка');
        
        if (matchesTitle || !isStandard) {
          i++;
          continue;
        }
      }

      closeSection();
      const bg = data.background || 'gray';
      const collapsible = data.collapsible !== false;
      sectionBg = bg;
      stepCounter = 0;
      
      const txt = data.text || '';
      inIngredients = txt.toLowerCase().includes('ингр') || txt.toLowerCase().includes('інгр');
      
      const toggleIcon = collapsible ? '<span class="section-toggle">▼</span>' : '';
      const sectionId = `sec_${i}`;
      html += `
        <div class="content-section">
          <div class="section-header ${bg} ${collapsible?'collapsible':''}" data-target="${sectionId}">
            ${sanitize(data.text || '')}
            ${toggleIcon}
          </div>
          <div class="section-content" id="${sectionId}">`;
      inSection = true;

    } else if (type === 'slidertool') {
      const slides = data.slides || [];
      if (slides.length && !html.includes('recipe-gallery')) {
        // already rendered in gallery; skip duplicates
      }
      // skip — already shown in gallery at top

    } else if (type === 'paragraph') {
      let text = data.text || '';
      if (!text.trim()) { i++; continue; }

      // Detect numbered step (starts with digit + dot/period)
      const stepMatch = text.match(/^(\d+)\.\s+(.*)/s);
      
      let contentHtml = '';
      if (stepMatch && !inIngredients) {
        stepCounter++;
        contentHtml = sanitize(stepMatch[2]);
      } else {
        contentHtml = sanitize(text);
      }
      
      // Застосовуємо парсер грамівок ДО ВСІХ блоків тексту
      contentHtml = wrapIngredients(contentHtml);
      
      if (stepMatch && !inIngredients) {
        html += `<div class="recipe-step"><span class="step-num">${stepMatch[1]}</span><div class="step-text">${contentHtml}</div></div>`;
      } else {
        html += `<p class="recipe-para">${contentHtml}</p>`;
      }

    } else if (type === 'embed') {
      const embedUrl = data.embed || '';
      if (embedUrl) {
        // Отримуємо ID відео з посилання kinescope.io/embed/VIDEO_ID або kinescope.io/VIDEO_ID
        const match = embedUrl.match(/kinescope\.io\/(?:embed\/)?([a-zA-Z0-9]+)/);
        if (match && match[1]) {
          const videoId = match[1];
          
          if (typeof youtubeLinks !== 'undefined' && youtubeLinks[videoId]) {
            const ytId = youtubeLinks[videoId];
            html += `<div class="recipe-embed" style="position: relative; margin: 24px auto; width: 100%; max-width: 800px; border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-md); aspect-ratio: 16/9;">
                       <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" src="https://www.youtube.com/embed/${ytId}?rel=0" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>
                     </div>`;
          } else {
            // Перевіряємо, чи сайт відкритий локально (з диска E: або через localhost)
            const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocal) {
              // Підтримка відтворення через сервер /videos/ або безпосередньо з диска E:
              const localServerPath = `/videos/${videoId}.mp4`;
              const localDiskPath = `file:///E:/cakesVideos/originals/${videoId}.mp4`;
              
              html += `
                <div class="recipe-embed local-video-container" style="margin: 16px auto; max-width: 800px; border-radius: 12px; overflow: hidden; background: #000; text-align: center; box-shadow: var(--shadow-md);">
                  <video controls preload="metadata" style="max-width: 100%; max-height: 50vh; border-radius: 12px; outline: none; width: auto; display: inline-block;">
                    <source src="${localServerPath}" type="video/mp4">
                    <source src="${localDiskPath}" type="video/mp4">
                    <iframe src="${embedUrl}" allowfullscreen allow="autoplay; fullscreen" style="width: 100%; height: 50vh; max-height: 400px; border: 0;"></iframe>
                  </video>
                </div>`;
            } else {
              // Красива заглушка для Інтернету (наприклад, GitHub Pages)
              html += `
                <div class="recipe-embed placeholder-container" style="margin: 16px auto; width: 100%; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #fce4ec, #f8bbd0); text-align: center; padding: 20px; box-sizing: border-box;">
                  <div>
                    <div style="font-size: 48px; margin-bottom: 12px; animation: bounce 2s infinite;">🎬</div>
                    <h3 style="color: #c2185b; margin: 0 0 10px 0; font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 700;">Відео ще обробляється</h3>
                    <p style="color: #555; margin: 0; font-size: 15px; max-width: 300px;">Це відео скоро з'явиться тут! Автор вже працює над цим.</p>
                  </div>
                </div>`;
            }
          }
        } else {
          html += `<div class="recipe-embed" style="margin: 16px auto; max-width: 800px; border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-md);"><iframe style="width: 100%; height: 50vh; max-height: 400px; border: 0;" src="${embedUrl}" allowfullscreen allow="autoplay; fullscreen"></iframe></div>`;
        }
      }
    }

    i++;
  }
  closeSection();
  return html;
}

function sanitize(str) {
  // Allow safe HTML tags (b, strong, i, em), strip rest
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/<(?!\/?(b|strong|i|em|br|span)\b)[^>]+>/gi, '')
    .trim();
}

function wrapIngredients(text) {
  // Знаходить діапазони "300-350 г" або одиничні числа "300 г"
  // Додано (?![а-яА-Яa-zA-ZіІїЇєЄґҐ]), щоб не обрізати слова типу "15 годин"
  const regex = /(\d+(?:[.,]\d+)?)(?:\s*[-—–]\s*(\d+(?:[.,]\d+)?))?\s*(г|кг|мл|л|шт|ст\.?\s*л\.?|с\.?\s*л\.?|ч\.?\s*л\.?|с\.?\s*т\.?)(?![а-яА-Яa-zA-ZіІїЇєЄґҐ])/gi;
  return text.replace(regex, (match, n1, n2, unit) => {
    const orig1 = parseFloat(n1.replace(',', '.'));
    if (n2) {
      const orig2 = parseFloat(n2.replace(',', '.'));
      return `<span class="calc-val" data-orig="${orig1}" data-orig2="${orig2}">${n1}-${n2}</span> ${unit}`;
    }
    return `<span class="calc-val" data-orig="${orig1}">${n1}</span> ${unit}`;
  });
}

// ── Calculator Logic ──────────────────────────
function setupCalculator(r) {
  const calcMultiInput = document.getElementById('calcMultiplierInput');
  const calcModeRadios = document.getElementsByName('calcMode');
  const calcShapeResult = document.getElementById('calcShapeResult');
  const multiSection = document.getElementById('calcMultiplierSection');
  const shapeSection = document.getElementById('calcShapeSection');
  
  // Shape Inputs
  const origShape = document.getElementById('origShape');
  const origDim1 = document.getElementById('origDim1');
  const origDim2 = document.getElementById('origDim2');
  const newShape = document.getElementById('newShape');
  const newDim1 = document.getElementById('newDim1');
  const newDim2 = document.getElementById('newDim2');
  
  const useHeightCb = document.getElementById('useHeightCb');
  const heightInputs = document.getElementById('heightInputs');
  const origHeight = document.getElementById('origHeight');
  const newHeight = document.getElementById('newHeight');

  // Reset UI
  calcMultiInput.value = '1';
  calcModeRadios[0].checked = true;
  multiSection.style.display = 'flex';
  shapeSection.style.display = 'none';
  useHeightCb.checked = false;
  heightInputs.style.display = 'none';
  
  // Try to find original shape in recipe content (look for "Форма 18 см" or "18 см")
  let foundDim = '';
  let content = [];
  if (r.card && r.card.card) content = r.card.card.content || [];
  for (let b of content) {
    if (b.type === 'paragraph' && b.data && b.data.text) {
      let t = b.data.text.toLowerCase();
      let m = t.match(/форма.*?(\d+)\s*см/i) || t.match(/кольцо.*?(\d+)\s*см/i) || t.match(/кільце.*?(\d+)\s*см/i);
      if (m) { foundDim = m[1]; break; }
    }
  }
  
  origShape.value = 'circle';
  newShape.value = 'circle';
  origDim1.value = foundDim || '';
  origDim2.value = '';
  newDim1.value = '';
  newDim2.value = '';
  origDim2.style.display = 'none';
  newDim2.style.display = 'none';
  
  const getArea = (shape, d1, d2) => {
    let a = parseFloat(d1) || 0;
    let b = parseFloat(d2) || 0;
    if (shape === 'circle') return Math.PI * Math.pow(a/2, 2);
    if (shape === 'square') return a * a;
    if (shape === 'rectangle') return a * b;
    return 0;
  };
  
  const calculateRatio = () => {
    let mode = document.querySelector('input[name="calcMode"]:checked').value;
    let ratio = 1;
    
    if (mode === 'multiplier') {
      ratio = parseFloat(calcMultiInput.value) || 1;
    } else {
      let areaOrig = getArea(origShape.value, origDim1.value, origDim2.value);
      let areaNew = getArea(newShape.value, newDim1.value, newDim2.value);
      
      if (areaOrig > 0 && areaNew > 0) {
        ratio = areaNew / areaOrig;
        if (useHeightCb.checked) {
          let ho = parseFloat(origHeight.value) || 1;
          let hn = parseFloat(newHeight.value) || 1;
          if (ho > 0 && hn > 0) {
            ratio *= (hn / ho);
          }
        }
      } else {
        ratio = 1;
      }
    }
    
    calcShapeResult.textContent = ratio.toFixed(2);
    
    // Update all DOM elements
    document.querySelectorAll('.calc-val').forEach(el => {
      const orig1 = parseFloat(el.dataset.orig);
      const orig2 = el.dataset.orig2 ? parseFloat(el.dataset.orig2) : null;
      
      if (!isNaN(orig1)) {
        const val1 = Math.round(orig1 * ratio * 10) / 10;
        
        if (orig2 !== null && !isNaN(orig2)) {
          const val2 = Math.round(orig2 * ratio * 10) / 10;
          el.textContent = ratio === 1 ? `${orig1}-${orig2}` : `${val1}-${val2}`;
        } else {
          el.textContent = ratio === 1 ? orig1 : val1;
        }
        
        if (ratio !== 1) el.classList.add('changed');
        else el.classList.remove('changed');
      }
    });
  };

  // Bind events for inputs
  if (!window._calcEventsBound) {
    calcMultiInput.addEventListener('input', calculateRatio);
    document.querySelectorAll('.calc-preset-btn').forEach(b => {
      b.onclick = (e) => {
        e.preventDefault();
        calcMultiInput.value = b.dataset.val;
        calculateRatio();
      };
    });
    
    const shapeInputs = [origShape, origDim1, origDim2, newShape, newDim1, newDim2, origHeight, newHeight];
    shapeInputs.forEach(i => i.addEventListener('input', calculateRatio));
    
    origShape.addEventListener('change', () => { origDim2.style.display = origShape.value === 'rectangle' ? 'inline-block' : 'none'; calculateRatio(); });
    newShape.addEventListener('change', () => { newDim2.style.display = newShape.value === 'rectangle' ? 'inline-block' : 'none'; calculateRatio(); });
    
    calcModeRadios.forEach(r => r.addEventListener('change', e => {
      if (e.target.value === 'multiplier') {
        multiSection.style.display = 'flex';
        shapeSection.style.display = 'none';
      } else {
        multiSection.style.display = 'none';
        shapeSection.style.display = 'flex';
      }
      calculateRatio();
    }));
    
    useHeightCb.addEventListener('change', e => {
      heightInputs.style.display = e.target.checked ? 'flex' : 'none';
      calculateRatio();
    });
    
    // Custom Select Logic
    document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
      const select = wrapper.querySelector('.custom-select');
      const trigger = wrapper.querySelector('.custom-select-trigger');
      const options = wrapper.querySelectorAll('.custom-option');
      const hiddenInput = wrapper.querySelector('input[type="hidden"]');
      
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select').forEach(s => {
          if (s !== select) s.classList.remove('open');
        });
        select.classList.toggle('open');
      });
      
      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          trigger.querySelector('span').textContent = opt.textContent;
          hiddenInput.value = opt.dataset.value;
          select.classList.remove('open');
          hiddenInput.dispatchEvent(new Event('change'));
        });
      });
    });
    
    window.addEventListener('click', () => {
      document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
    });
  
    window._calcEventsBound = true;
  }
  calculateRatio(); // Initial
}

function bindSections() {
  document.querySelectorAll('.section-header.collapsible').forEach(header => {
    header.addEventListener('click', () => {
      const target = document.getElementById(header.dataset.target);
      if (!target) return;
      header.classList.toggle('collapsed');
      target.classList.toggle('hidden');
    });
  });
}

// ── Favorites ─────────────────────────────────
function toggleFav(id, btn) {
  if (!id) return;
  const idx = favorites.indexOf(id);
  if (idx === -1) {
    favorites.push(id);
    if (btn) { btn.textContent = '❤️'; btn.classList.add('active'); }
    showToast('Додано в обране ❤️');
  } else {
    favorites.splice(idx, 1);
    if (btn) { btn.textContent = '🤍'; btn.classList.remove('active'); }
    showToast('Видалено з обраного');
  }
  localStorage.setItem('ps_favorites', JSON.stringify(favorites));
}

function toggleFavModal(id) {
  const idx = favorites.indexOf(id);
  const isFav = idx === -1;
  if (isFav) { favorites.push(id); } else { favorites.splice(idx, 1); }
  localStorage.setItem('ps_favorites', JSON.stringify(favorites));
  modalFavBtn.textContent = isFav ? '❤️' : '♡';
  modalFavBtn.classList.toggle('active', isFav);
  showToast(isFav ? 'Додано в обране ❤️' : 'Видалено з обраного');

  // Update card in grid
  const cardFav = grid.querySelector(`[data-id="${id}"] .card-fav`);
  if (cardFav) { cardFav.textContent = isFav ? '❤️' : '🤍'; cardFav.classList.toggle('active', isFav); }
}

// ── Print / PDF ───────────────────────────────
function printRecipe() {
  window.print();
}

// ── Toast ─────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ── Theme ─────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('ps_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;
  if (isDark) { document.documentElement.setAttribute('data-theme', 'dark'); themeBtn.textContent = '☀️'; }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('ps_theme', 'light');
    themeBtn.textContent = '🌙';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('ps_theme', 'dark');
    themeBtn.textContent = '☀️';
  }
}

// ── Event bindings ────────────────────────────
function bindEvents() {
  // Search
  searchInput.addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    searchClear.classList.toggle('visible', searchQuery.length > 0);
    renderGrid();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.remove('visible');
    searchInput.focus();
    renderGrid();
  });

  // Sort
  sortSelect.addEventListener('change', e => {
    sortMode = e.target.value;
    renderGrid();
  });

  // Modal
  modalClose.addEventListener('click', closeModal);
  modalCalcBtn.addEventListener('click', () => {
    overlay.querySelector('.modal').classList.toggle('calc-open');
  });
  closeCalcBtn.addEventListener('click', () => {
    overlay.querySelector('.modal').classList.remove('calc-open');
  });
  
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Theme
  themeBtn.addEventListener('click', toggleTheme);

  // Back to top
  window.addEventListener('scroll', () => {
    backTop.classList.toggle('visible', window.scrollY > 400);
  });
  backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
