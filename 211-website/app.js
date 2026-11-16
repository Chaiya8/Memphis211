// Simple state
const state = {
  zoom: 100,
  lang: 'en',
  taxonomy: {},
  readAloud: false,
  categories: [],
  resources: [],
  intents: []
};

const DMS_CENTERS_API = 'https://www.datamidsouth.org/api/explore/v2.1/catalog/datasets/memphis-community-centers0/records';
const DMS_CACHE_KEY = 'dms_centers_cache_v1';

// Intent matching helpers
function norm(s) { return (s || '').toLowerCase(); }

// Returns first intent whose any keyword is included in msg
function matchIntent(msg) {
  const q = norm(msg);
  for (const intent of (state.intents || [])) {
    if ((intent.keywords || []).some(k => q.includes(norm(k)))) {
      return intent;
    }
  }
  return null;
}

function failSafe(query) {
  const deepLink = buildLinc211CategoryUrl(query);
  return `
I didn't find an exact match in our quick list, but you can browse verified Memphis &amp; Shelby County programs here:<br/>
&bull; <a href="${deepLink}" target="_blank" rel="noopener">Open Matching LINC / 2-1-1 Memphis Category</a><br/>
&bull; Or call <a href="tel:211">2-1-1</a> / <a href="tel:9014152790">(901) 415-2790</a><br/>
<em>Tip: Try one or two words like "food", "shelter", "rent", "clinic", or "jobs".</em>
`;
}

// Prevent HTML injection in user messages
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// Generic lists
const MEMPHIS_TOP_SEARCHES = [
  "Food Pantry", "Emergency Shelter", "Rent Help",
  "Utility Bill Help", "Job Training", "Clinics Near Me"
];

const MEMPHIS_RECENT_SEARCHES = [
  "Mobile Pantry Saturday", "Childcare Assistance",
  "Dental Clinic 38118", "Senior Home Care",
  "Bus Passes", "Domestic Violence Hotline"
];

function renderDiscover() {
  const topList = document.getElementById('topSearches');
  const recList = document.getElementById('recentSearches');
  if (topList) {
    topList.innerHTML = MEMPHIS_TOP_SEARCHES
      .map(t => `<li><a href="#" data-q="${t}">${t}</a></li>`).join('');
  }
  if (recList) {
    recList.innerHTML = MEMPHIS_RECENT_SEARCHES
      .map(t => `<li><a href="#" data-q="${t}">${t}</a></li>`).join('');
  }
  document.querySelectorAll('.discover-flyout a[data-q]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); searchResources(a.dataset.q, true); };
  });

  // ARIA expanded toggle (helps screen readers)
  const tab = document.querySelector('.discover__tab');
  const panel = document.getElementById('discoverPanel');
  if (tab && panel) {
    tab.addEventListener('focus', () => tab.setAttribute('aria-expanded', 'true'));
    tab.addEventListener('blur', () => tab.setAttribute('aria-expanded', 'false'));
    panel.addEventListener('focusin', () => tab.setAttribute('aria-expanded', 'true'));
    panel.addEventListener('focusout', () => tab.setAttribute('aria-expanded', 'false'));
  }
}

// Load data
(async function init() {
  // show Accessibility panel on first visit
  const seen = localStorage.getItem('seenAccess');
  if (!seen) document.getElementById('accessPanel').classList.add('show');

  // fetch categories, resources, taxonomy, and intents
  const [cats, res, tax, intents] = await Promise.all([
    fetch('./data/categories.simple.json').then(r => r.json()),
    fetch('./data/resources.sample.json').then(r => r.json()),
    fetch('./data/taxonomy.json').then(r => r.json()),
    fetch('./data/intents.json').then(r => r.json())
  ]);
  state.categories = cats;
  state.resources = res;
  state.taxonomy = tax;
  state.intents = intents;

  renderCategories(cats);
  renderBottomCategories(cats);
  renderDiscover();

  // wire events
  document.getElementById('accessClose').addEventListener('click', () => {
    document.getElementById('accessPanel').classList.remove('show');
    localStorage.setItem('seenAccess', '1');
  });
  document.getElementById('openAccessibility').addEventListener('click', () => {
    document.getElementById('accessPanel').classList.add('show');
  });

  // Quick Exit (if button exists in index.html)
  const exitBtn = document.getElementById('quickExitBtn');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      sessionStorage.clear();
      window.location.replace('https://www.google.com');
    });
  }

  // Zoom
  const zoomRange = document.getElementById('zoomRange');
  const zoomValue = document.getElementById('zoomValue');
  zoomRange.addEventListener('input', (e) => {
    state.zoom = Number(e.target.value);
    document.documentElement.style.zoom = (state.zoom / 100).toString();
    zoomValue.textContent = `${state.zoom}%`;
  });

  // Language
  document.querySelectorAll('input[name="lang"]').forEach(r => {
    r.addEventListener('change', (e) => { state.lang = e.target.value; translateUI(); });
  });

  // Read aloud (Web Speech API)
  const readToggle = document.getElementById('readToggle');
  readToggle.addEventListener('change', (e) => {
    state.readAloud = e.target.checked;
    if (state.readAloud) speak(document.body.innerText.slice(0, 600));
    else window.speechSynthesis.cancel();
  });

  // Quick search
  document.getElementById('quickSearchBtn').addEventListener('click', quickSearch);
  document.getElementById('quickSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') quickSearch();
  });

  // Chat
  document.getElementById('chatSend').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  document.getElementById('chatMin').addEventListener('click', () => {
    document.getElementById('chatbot').classList.toggle('min');
  });
  document.getElementById('chatClose').addEventListener('click', () => {
    document.getElementById('chatbot').style.display = 'none';
  });
  document.getElementById('chatBody').addEventListener('click', e => {
    if (e.target.classList.contains('chip')) {
      handleChip(e.target.dataset.choice);
    }
  });
})();

// Build category tiles with hover hints and simple dropdowns
function renderCategories(cats) {
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';
  cats.forEach(cat => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.setAttribute('tabindex', '0');

    tile.innerHTML = `
      <div class="tooltip" role="tooltip">${cat.hint}</div>
      <h4>${cat.title}</h4>
      <div class="hint">${cat.subtitle || ''}</div>
      <div class="dropdown">
        ${cat.exampleQueries.map(q => `<a href="#" data-q="${q}">${capWords(q)}</a>`).join('')}
      </div>
    `;

    tile.addEventListener('mouseenter', () => tile.classList.add('open'));
    tile.addEventListener('mouseleave', () => tile.classList.remove('open'));
    tile.addEventListener('focusin', () => tile.classList.add('open'));
    tile.addEventListener('focusout', (e) => {
      if (!tile.contains(e.relatedTarget)) {
        tile.classList.remove('open');
      }
    });

    tile.querySelectorAll('.dropdown a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        searchResources(a.dataset.q, true);
      });
    });

    grid.appendChild(tile);
  });
}

function renderBottomCategories(cats) {
  const wrap = document.getElementById('bottomCategoryGrid');
  if (!wrap) return;
  wrap.innerHTML = '';
  cats.forEach(cat => {
    const bullets = (cat.exampleQueries || []).slice(0, 5)
      .map(x => `<li>${capWords(x)}</li>`).join('');

    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `
      <h5>${cat.title}</h5>
      <ul class="bullets">${bullets}</ul>
      <div class="dropdown open" style="margin-top:8px">
        ${cat.exampleQueries.map(q => `<a href="#" data-q="${q}">${q}</a>`).join('')}
      </div>
    `;
    el.querySelectorAll('.dropdown a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        searchResources(a.dataset.q, true);
      });
    });
    wrap.appendChild(el);
  });
}

// Helpers
function capWords(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function quickSearch() {
  const q = document.getElementById('quickSearch').value.trim();
  if (!q) return;
  searchResources(q);
}

function extractZipAndQuery(rawText) {
  const zipMatch = rawText.match(/\b(38\d{3})\b/);
  const zip = zipMatch ? zipMatch[1] : '';
  const keyword = rawText.replace(/\b38\d{3}\b/g, '').trim();
  return { keyword, zip };
}

async function getCachedCenters() {
  try {
    const cached = sessionStorage.getItem(DMS_CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const res = await fetch(`${DMS_CENTERS_API}?limit=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const mapped = (data.results || []).map(rec => {
      const rawAddr = rec.address || rec.street_address || 'Memphis, TN';
      const addrZipMatch = String(rawAddr).match(/\b(38\d{3})\b/);
      const resolvedZip = String(rec.shelby_county_zip_codes || rec.zip || (addrZipMatch ? addrZipMatch[1] : '') || '');
      return {
        name: rec.name || rec.center_name || rec.facility_name || 'Memphis Community Center',
        services: ['Community Center', 'Recreation & Youth Programs', 'Civic Space'],
        description: rec.description || 'City of Memphis public community center offering neighborhood programs and civic resources.',
        hours: rec.hours || 'Mon–Fri (Contact center for schedule)',
        phone: rec.phone || rec.telephone || '(901) 636-4200',
        address: rawAddr.includes('Memphis') ? rawAddr : `${rawAddr}, Memphis, TN ${resolvedZip}`.trim(),
        zip: resolvedZip,
        website: rec.website || ''
      };
    });

    sessionStorage.setItem(DMS_CACHE_KEY, JSON.stringify(mapped));
    return mapped;
  } catch (err) {
    console.warn('Data Midsouth unavailable, falling back to local JSON:', err);
    return [];
  }
}

async function fetchLiveResources(keyword, zip) {
  const liveCenters = await getCachedCenters();
  const combined = [...liveCenters, ...state.resources];

  return combined.filter(r => {
    const blob = `${r.name} ${r.services.join(' ')} ${r.description} ${r.address} ${r.zip}`.toLowerCase();
    const kwOk = !keyword || blob.includes(keyword.toLowerCase());
    const zipOk = !zip || r.zip === zip;
    return kwOk && zipOk;
  });
}

function buildLinc211CategoryUrl(query) {
  const qLower = (query || '').trim().toLowerCase();
  const taxMap = state.taxonomy || {};

  // Handle singular/plural differences (e.g., "food pantry" -> "food pantries")
  const singularToPlural = qLower.endsWith('y') ? qLower.slice(0, -1) + 'ies' : qLower + 's';

  let taxId = taxMap[qLower] || taxMap[singularToPlural];
  if (!taxId) {
    const matchedKey = Object.keys(taxMap).find(
      k => k.includes(qLower) || qLower.includes(k) || k.includes(singularToPlural)
    );
    if (matchedKey) taxId = taxMap[matchedKey];
  }

  if (taxId) {
    const filterObj = {
      "service\\\\service_taxonomy\\\\module_servicepost": {
        "value": [{ "taxonomy_id": Number(taxId) }],
        "operator": ["contains_array"]
      },
      "agency\\\\agency_organization\\\\agency_organization": {
        "value": [6],
        "operator": ["contains_array"]
      },
      "agency\\\\agency_system\\\\id": {
        "value": "VLTEST",
        "operator": ["notequals"]
      }
    };
    return `https://team211.communityos.org/guided-search-linc211/render/ds/${encodeURIComponent(JSON.stringify(filterObj))}`;
  }

  return 'https://team211.communityos.org/linc211memphis';
}

async function searchResources(q, openDirect = false) {
  const results = document.getElementById('results');
  const { keyword, zip } = extractZipAndQuery(q);
  const deepLink = buildLinc211CategoryUrl(keyword || q);

  if (openDirect && deepLink !== 'https://team211.communityos.org/linc211memphis') {
    window.open(deepLink, '_blank', 'noopener');
  }

  results.innerHTML = `<div class="tile">Searching Memphis resources for "${escapeHTML(q)}"...</div>`;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const matches = (await fetchLiveResources(keyword, zip)).slice(0, 8);

  const officialCard = `
    <div class="tile" style="border: 2px solid var(--blue-500);">
      <h4>Official LINC / 2-1-1 Memphis Directory</h4>
      <div style="background:var(--blue-100); border-radius:14px; padding:10px; margin-top:8px">
        <strong>Category:</strong> ${escapeHTML(capWords(q))}
      </div>
      <p>View all verified Shelby County &amp; Memphis providers for <strong>${escapeHTML(q)}</strong> on the official LINC 2-1-1 portal, or dial <strong>2-1-1</strong> (901-415-2790) 24/7.</p>
      <div class="dropdown open">
        <a href="${deepLink}" target="_blank" rel="noopener">Open ${escapeHTML(capWords(q))} in LINC 2-1-1</a>
        <a href="tel:211">Call 2-1-1 Now</a>
      </div>
    </div>`;

  if (!matches.length) {
    results.innerHTML = officialCard;
    return;
  }

  results.innerHTML = matches.map(cardHTML).join('') + officialCard;
}

function formatSafeURL(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed === '#' || trimmed.toLowerCase() === 'none') return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function cardHTML(r) {
  const gradient = 'style="background:var(--blue-100); border-radius:14px; padding:10px; margin-top:8px"';
  const safeUrl = formatSafeURL(r.website);
  const rawPhone = (r.phone || '').trim() || '2-1-1';
  const dialDigits = rawPhone.replace(/[^0-9]/g, '') || '211';

  return `
  <div class="tile">
    <h4>${escapeHTML(r.name)}</h4>
    <div ${gradient}>
      <strong>What they offer:</strong> ${escapeHTML(r.services.join(', '))}
    </div>
    <p>${escapeHTML(r.description)}</p>
    <p><strong>Hours:</strong> ${escapeHTML(r.hours || 'Call to confirm hours')}</p>
    <p><strong>Phone:</strong> <a href="tel:${dialDigits}">${escapeHTML(rawPhone)}</a> &bull;
       <strong>Address:</strong> ${escapeHTML(r.address || 'Memphis, TN')}</p>
    <div class="dropdown open">
      ${safeUrl ? `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener">Visit website</a>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address || r.name + ' Memphis TN')}" target="_blank" rel="noopener">Open in Maps</a>
    </div>
  </div>`;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  addMsg('user', escapeHTML(text));
  input.value = '';

  const { keyword, zip } = extractZipAndQuery(text);
  const searchTerm = keyword || text;

  // 1. Check curated intents
  const intent = matchIntent(searchTerm);
  if (intent) {
    addMsg('bot', intent.reply_html);
  }

  // 2. Query live Data Midsouth + local resources
  const hits = (await fetchLiveResources(searchTerm, zip)).slice(0, 3);
  if (hits.length) {
    const lines = hits
      .map(h => `&bull; <strong>${escapeHTML(h.name)}</strong> (${escapeHTML(h.zip || 'Memphis')}) — <a href="tel:${h.phone.replace(/[^0-9]/g, '')}">${escapeHTML(h.phone)}</a>`)
      .join('<br/>');
    addMsg('bot', `Here are live Memphis options${zip ? ` near ${zip}` : ''}:<br/>${lines}`);
  } else if (!intent) {
    addMsg('bot', failSafe(searchTerm));
  }
}

function handleChip(kind) {
  if (kind === 'profile') {
    addMsg('bot', 'Great — share one need in 1–2 words plus a ZIP (e.g., "Food 38126", "Community Center 38107").');
  } else {
    addMsg('bot', "Tell me what's going on in a few words (e.g., \"Shelter tonight\", \"Community Center\", \"Clinic 38118\").");
  }
}

function addMsg(who, html) {
  const body = document.getElementById('chatBody');
  const wrap = document.createElement('div');
  wrap.className = `msg ${who}`;
  wrap.innerHTML = `<p>${html}</p>`;
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}

// Simple "translate" stub
function translateUI() {
  const p = document.querySelector('.hero__content p');
  if (state.lang === 'es') {
    p.textContent = 'Encuentra comida, vivienda, atención médica, empleo y más. Recursos confiables del área de Memphis.';
  } else {
    p.textContent = 'Find food, housing, health care, jobs, and more. Memphis-area resources you can trust.';
  }
}

// Speak helper
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1;
  utter.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// ADMIN DEMO MODAL
const adminBtn = document.getElementById('adminLoginBtn');
const adminModal = document.getElementById('adminDemoModal');
const adminClose = document.getElementById('adminDemoClose');
const adminCont = document.getElementById('adminDemoContinue');
const adminEnter = document.getElementById('adminDemoEnter');

if (adminBtn && adminModal) {
  const showModal = () => {
    adminModal.classList.add('show');
    adminModal.setAttribute('aria-hidden', 'false');
    adminModal.querySelector('.modal__dialog').focus?.();
  };
  const hideModal = () => {
    adminModal.classList.remove('show');
    adminModal.setAttribute('aria-hidden', 'true');
  };
  adminBtn.addEventListener('click', showModal);
  adminClose.addEventListener('click', hideModal);
  adminModal.addEventListener('click', (e) => { if (e.target === adminModal) hideModal(); });

  function goAdmin() {
    window.location.href = './admin/index.html';
  }
  adminCont.addEventListener('click', goAdmin);
  adminEnter.addEventListener('click', goAdmin);
}