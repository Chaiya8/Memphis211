// Simple state
const state = {
  zoom: 100,
  lang: 'en',
  readAloud: false,
  categories: [],
  resources: [],
  intents: []  // NEW: for intent matching
};

// Intent matching helpers
function norm(s){ return (s||'').toLowerCase(); }

// Returns first intent whose any keyword is included in msg
function matchIntent(msg){
  const q = norm(msg);
  for(const intent of (state.intents || [])){
    if((intent.keywords || []).some(k => q.includes(norm(k)))){
      return intent;
    }
  }
  return null;
}

function failSafe(){
  // Universal catch-all route
  return `
I didn't quite get that yet. You can browse every category here:<br/>
• <a href="https://team211.communityos.org/guided-search-linc211" target="_blank" rel="noopener">
LINC / 2-1-1 Guided Search</a><br/>
<em>Tip: Try one or two words like "food", "shelter", "rent", "clinic", or "jobs".</em>
`;
}

// Prevent HTML injection in user messages
function escapeHTML(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
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

function renderDiscover(){
  const topList = document.getElementById('topSearches');
  const recList = document.getElementById('recentSearches');
  if(topList){
    topList.innerHTML = MEMPHIS_TOP_SEARCHES
      .map(t=>`<li><a href="#" data-q="${t}">${t}</a></li>`).join('');
  }
  if(recList){
    recList.innerHTML = MEMPHIS_RECENT_SEARCHES
      .map(t=>`<li><a href="#" data-q="${t}">${t}</a></li>`).join('');
  }
  document.querySelectorAll('.discover-flyout a[data-q]').forEach(a=>{
    a.onclick = (e)=>{ e.preventDefault(); searchResources(a.dataset.q); };
  });

  // ARIA expanded toggle (helps screen readers)
  const tab = document.querySelector('.discover__tab');
  const panel = document.getElementById('discoverPanel');
  if(tab && panel){
    // expand on focus/hover
    tab.addEventListener('focus', ()=> tab.setAttribute('aria-expanded','true'));
    tab.addEventListener('blur',  ()=> tab.setAttribute('aria-expanded','false'));
    panel.addEventListener('focusin', ()=> tab.setAttribute('aria-expanded','true'));
    panel.addEventListener('focusout', ()=> tab.setAttribute('aria-expanded','false'));
  }
}

// Load data
(async function init(){
  // show Accessibility panel on first visit
  const seen = localStorage.getItem('seenAccess');
  if(!seen) document.getElementById('accessPanel').classList.add('show');

  // fetch categories, resources, and intents
  const [cats, res, intents] = await Promise.all([
    fetch('./data/categories.simple.json').then(r=>r.json()),
    fetch('./data/resources.sample.json').then(r=>r.json()),
    fetch('./data/intents.json').then(r=>r.json())        // NEW: load intents
  ]);
  state.categories = cats;
  state.resources = res;
  state.intents = intents;                                // NEW: store intents

  renderCategories(cats);
  renderBottomCategories(cats);
  renderDiscover();        // generic lists

  // wire events
  document.getElementById('accessClose').addEventListener('click', ()=> {
    document.getElementById('accessPanel').classList.remove('show');
    localStorage.setItem('seenAccess','1');
  });
  document.getElementById('openAccessibility').addEventListener('click', ()=>{
    document.getElementById('accessPanel').classList.add('show');
  });

  // Zoom
  const zoomRange = document.getElementById('zoomRange');
  const zoomValue = document.getElementById('zoomValue');
  zoomRange.addEventListener('input', (e)=>{
    state.zoom = Number(e.target.value);
    document.documentElement.style.zoom = (state.zoom/100).toString();
    zoomValue.textContent = `${state.zoom}%`;
  });

  // Language
  document.querySelectorAll('input[name="lang"]').forEach(r=>{
    r.addEventListener('change', (e)=>{ state.lang = e.target.value; translateUI(); });
  });

  // Read aloud (Web Speech API)
  const readToggle = document.getElementById('readToggle');
  readToggle.addEventListener('change', (e)=>{
    state.readAloud = e.target.checked;
    if(state.readAloud) speak(document.body.innerText.slice(0, 600));
    else window.speechSynthesis.cancel();
  });

  // Quick search
  document.getElementById('quickSearchBtn').addEventListener('click', quickSearch);
  document.getElementById('quickSearch').addEventListener('keydown', e=>{
    if(e.key==='Enter') quickSearch();
  });

  // Chat
  document.getElementById('chatSend').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });
  document.getElementById('chatMin').addEventListener('click', ()=>{
    document.getElementById('chatbot').classList.toggle('min');
  });
  document.getElementById('chatClose').addEventListener('click', ()=>{
    document.getElementById('chatbot').style.display='none';
  });
  document.getElementById('chatBody').addEventListener('click', e=>{
    if(e.target.classList.contains('chip')){
      handleChip(e.target.dataset.choice);
    }
  });
})();

// Build category tiles with hover hints and simple dropdowns
function renderCategories(cats){
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';
  cats.forEach(cat=>{
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.setAttribute('tabindex','0');

    tile.innerHTML = `
      <div class="tooltip" role="tooltip">${cat.hint}</div>
      <h4>${cat.title}</h4>
      <div class="hint">${cat.subtitle||''}</div>
      <div class="dropdown">
        ${cat.exampleQueries.map(q=>`<a href="#" data-q="${q}">${capWords(q)}</a>`).join('')}
      </div>
    `;

    tile.addEventListener('mouseenter',()=> tile.classList.add('open'));
    tile.addEventListener('mouseleave',()=> tile.classList.remove('open'));
    tile.addEventListener('focus',()=> tile.classList.add('open'));
    tile.addEventListener('blur',()=> tile.classList.remove('open'));

    tile.querySelectorAll('.dropdown a').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        searchResources(a.dataset.q);
      });
    });

    grid.appendChild(tile);
  });
}

function renderBottomCategories(cats){
  const wrap = document.getElementById('bottomCategoryGrid');
  if(!wrap) return;
  wrap.innerHTML = '';
  cats.forEach(cat=>{
    // You can swap exampleQueries for a few subtopics later if you add them to JSON.
    const bullets = (cat.exampleQueries || []).slice(0,5)
      .map(x=>`<li>${capWords(x)}</li>`).join('');

    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `
      <h5>${cat.title}</h5>
      <ul class="bullets">${bullets}</ul>
      <div class="dropdown open" style="margin-top:8px">
        ${cat.exampleQueries.map(q=>`<a href="#" data-q="${q}">${q}</a>`).join('')}
      </div>
    `;
    el.querySelectorAll('.dropdown a').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        searchResources(a.dataset.q);
      });
    });
    wrap.appendChild(el);
  });
}

// Simple search over sample data
function capWords(s){
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function quickSearch(){
  const q = document.getElementById('quickSearch').value.trim();
  if(!q) return;
  searchResources(q);
}

function searchResources(q){
  const res = state.resources.filter(r=>{
    const blob = `${r.name} ${r.services.join(' ')} ${r.description} ${r.zip}`.toLowerCase();
    return blob.includes(q.toLowerCase());
  }).slice(0,6);
  const results = document.getElementById('results');
  if(!res.length){
    results.innerHTML = `<div class="tile">No results for "${q}". Try another word or call <a href="tel:211">2-1-1</a>.</div>`;
    return;
  }
  results.innerHTML = res.map(cardHTML).join('');
}

function cardHTML(r){
  const gradient = 'style="background:var(--blue-100); border-radius:14px; padding:10px; margin-top:8px"';
  return `
  <div class="tile">
    <h4>${r.name}</h4>
    <div ${gradient}>
      <strong>What they offer:</strong> ${r.services.join(', ')}
    </div>
    <p>${r.description}</p>
    <p><strong>Hours:</strong> ${r.hours}</p>
    <p><strong>Phone:</strong> <a href="tel:${r.phone.replace(/[^0-9]/g,'')}">${r.phone}</a> •
       <strong>Address:</strong> ${r.address}</p>
    <div class="dropdown open">
      <a href="${r.website}" target="_blank" rel="noopener">Visit website</a>
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}" target="_blank" rel="noopener">Open in Maps</a>
    </div>
  </div>`;
}

function sendChat(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  addMsg('user', escapeHTML(text));
  input.value = '';

  // 1–2 word matching with intents
  const intent = matchIntent(text);
  if(intent){
    addMsg('bot', intent.reply_html);
    return;
  }

  // If not matched, we can try the local sample search as a secondary help:
  const hits = state.resources.filter(r =>
    `${r.name} ${r.services.join(' ')} ${r.description} ${r.zip}`.toLowerCase().includes(text.toLowerCase())
  ).slice(0,3);

  if(hits.length){
    const lines = hits.map(h=>`• ${escapeHTML(h.name)} — ${escapeHTML(h.phone)} — ${escapeHTML(h.hours)}`).join('<br/>');
    addMsg('bot', `Here are a few nearby options from our sample list:<br/>${lines}<br/><br/>Need more? Try the full directory:<br/>• <a href="https://team211.communityos.org/guided-search-linc211" target="_blank" rel="noopener">LINC / 2-1-1 Guided Search</a>`);
  }else{
    addMsg('bot', failSafe());
  }
}

function handleChip(kind){
  if(kind==='profile'){
    addMsg('bot', 'Great — share one need in 1–2 words plus a ZIP (e.g., "Food 38126", "Rent 38106").');
  } else {
    addMsg('bot', 'Tell me what's going on in a few words (e.g., "Shelter tonight", "Tuition grant", "Clinic 38118").');
  }
}

function addMsg(who, html){
  const body = document.getElementById('chatBody');
  const wrap = document.createElement('div');
  wrap.className = `msg ${who}`;
  wrap.innerHTML = `<p>${html}</p>`;
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}

// Simple "translate" stub (you can wire a real i18n lib later)
function translateUI(){
  // For demo, just flip hero subtitle
  const p = document.querySelector('.hero__content p');
  if(state.lang==='es'){
    p.textContent = 'Encuentra comida, vivienda, atención médica, empleo y más. Recursos confiables del área de Memphis.';
  } else {
    p.textContent = 'Find food, housing, health care, jobs, and more. Memphis-area resources you can trust.';
  }
}

// Speak helper
function speak(text){
  if(!('speechSynthesis' in window)) return;
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

if (adminBtn && adminModal){
  const showModal = () => {
    adminModal.classList.add('show');
    adminModal.setAttribute('aria-hidden','false');
    // focus into panel for accessibility
    adminModal.querySelector('.modal__dialog').focus?.();
  };
  const hideModal = () => {
    adminModal.classList.remove('show');
    adminModal.setAttribute('aria-hidden','true');
  };
  adminBtn.addEventListener('click', showModal);
  adminClose.addEventListener('click', hideModal);
  adminModal.addEventListener('click', (e)=>{ if(e.target === adminModal) hideModal(); });

  // Demo routes to admin tool
  function goAdmin(){
    // TODO: replace with your admin tool URL (Streamlit, etc.)
    window.location.href = '/admin/index.html';
  }
  adminCont.addEventListener('click', goAdmin);
  adminEnter.addEventListener('click', goAdmin);
}
