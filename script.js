<script>
    /* ================================================================
   CONFIGURACIÓN Y DATOS (CINEFLUX OS 3.2)
   ================================================================ */
const TMDB_KEY = 'b6083b855479a79fd9acdb0a2789f126';
let lastScrollTop = 0;
let appStartTime = Date.now();
let currentMovieData = null; 

const CATALOGO = [
    { id: 1522377, link: "https://hgplaycdn.com/e/27tc341hgd98", categoria: "Estreno" },
    { id: 1180831, link: "https://hgplaycdn.com/e/27tc341hgd98", categoria: "Estreno" },
    { id: 1547050, link: "https://yuguaab.com/e/3urdbixpgqjr", categoria: "Estreno" },
    { id: 1242898, link: "https://vimeos.net/embed-gifb0mvp14aw.html", categoria: "Estreno" },
    { id: 533535, link: "https://vimeos.net/embed-gifb0mvp14aw.html", categoria: "Estreno" },
    { id: 1084242, link: "https://vimeos.net/embed-mjskmrhlb91i.html", categoria: "Estreno" },
    { id: 1387382, link: "https://player.cuevana.is/player.php?h=rxPRsRSX4IlkyS1F21W5j1LWaxDrSlOWwDzFztiv8jRa0TKuAj7i3ipYgfIdutaO", categoria: "Acción" },
    { id: 1556834, link: "https://vimeos.net/embed-4pahvxfpu00m.html", categoria: "Acción" },
    { id: 426063, link: "https://vimeos.net/embed-wuozbsxutkuj.html", categoria: "Terror" },
    { id: 1197137, link: "https://vimeos.net/embed-xjc6uuujzzax.html", categoria: "Terror" }
];

const CONTENT_LINKS = Object.fromEntries(CATALOGO.map(m => [m.id, m.link]));
const DATABASE = CATALOGO.reduce((acc, m) => {
    if (!acc[m.categoria]) acc[m.categoria] = [];
    acc[m.categoria].push(m.id);
    return acc;
}, {});

/* ================================================================
   MOTOR DE BASE DE DATOS (INDEXED DB)
   ================================================================ */
const dbEngine = {
    db: null,
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CinefluxOS_DB', 1);
            request.onupgradeneeded = (e) => {
                const idb = e.target.result;
                if (!idb.objectStoreNames.contains('tmdb_cache')) idb.createObjectStore('tmdb_cache');
                if (!idb.objectStoreNames.contains('app_settings')) idb.createObjectStore('app_settings');
                if (!idb.objectStoreNames.contains('user_data')) idb.createObjectStore('user_data');
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onerror = (e) => { console.error("Error IndexedDB", e); reject(); };
        });
    },
    async get(store, key) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    },
    async set(store, key, value) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).put(value, key);
            req.onsuccess = () => resolve(true);
        });
    }
};

/* ================================================================
   OPTIMIZADOR TMDB (SISTEMA DE CACHÉ)
   ================================================================ */
const api = {
    async fetchTMDB(endpoint) {
        const cachedData = await dbEngine.get('tmdb_cache', endpoint);
        if (cachedData) return cachedData;

        try {
            const lang = (await settings.get('language')) || 'es-MX';
            const separator = endpoint.includes('?') ? '&' : '?';
            const url = `https://api.themoviedb.org/3${endpoint}${separator}api_key=${TMDB_KEY}&language=${lang}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            await dbEngine.set('tmdb_cache', endpoint, data);
            return data;
        } catch (error) {
            console.error("Error TMDB:", error);
            throw error;
        }
    }
};

/* ================================================================
   MOTOR DE ENRUTAMIENTO AVANZADO (HASH ROUTER)
   ================================================================ */
const router = {
    currentRoute: '',
    previousRoute: '#/home',
    scrollMemory: {},

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    },

    async handleRoute() {
        const hash = window.location.hash || '#/home';
        
        if (!this.currentRoute.startsWith('#/movie/') && this.currentRoute) {
            this.scrollMemory[this.currentRoute] = window.scrollY;
        }

        const updateDOM = async () => {
            if (hash.startsWith('#/movie/')) {
                const dynamic = document.getElementById('dynamic-content');
                if (!dynamic || dynamic.innerHTML === "") {
                    await app.renderHomeData();
                }
                const id = hash.split('/').pop();
                await app.openModalVisual(id);
            } else {
                app.closeModalVisual();
                
                if (hash === '#/home' || hash === '#/') {
                    app.switchViewDOM('home');
                    await app.renderHome(); 
                    app.showHomeSection('inicio');
                } else if (hash.startsWith('#/category/')) {
                    const cat = decodeURIComponent(hash.split('/').pop());
                    app.switchViewDOM('home'); 
                    app.showHomeSection('category', cat);
                } else {
                    const viewId = hash.replace('#/', '');
                    app.switchViewDOM(viewId);
                }

                setTimeout(() => {
                    const savedScroll = this.scrollMemory[hash] || 0;
                    window.scrollTo({ top: savedScroll, behavior: 'instant' });
                }, 30);

                this.previousRoute = hash;
            }
            this.currentRoute = hash;
        };

        if (document.startViewTransition) {
            document.startViewTransition(() => updateDOM());
        } else {
            await updateDOM();
        }
    }
};

/* ================================================================
   MÓDULO GUARDIAN 3.5 (INTERCEPTOR + UI DEL REPRODUCTOR)
   ================================================================ */
const guardian = {
    init() {
        this.injectStyles();
        this.createToast();
        this.activateInterceptors();
        
        window.addEventListener('blur', () => {
            if(!document.getElementById('m-player-view').classList.contains('hidden')) {
                this.notify("Redirección bloqueada fuera del sistema", "error");
            }
        });
    },

    activateInterceptors() {
        window.addEventListener('beforeunload', (e) => {
            const isPlaying = !document.getElementById('m-player-view').classList.contains('hidden');
            if(isPlaying) {
                e.preventDefault();
                e.returnValue = "Guardian: ¿Deseas salir del reproductor?";
                return e.returnValue;
            }
        });
    },
    
    injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            .guardian-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-200%); background: rgba(10, 15, 25, 0.95); backdrop-filter: blur(12px); border: 1px solid #ef4444; border-left: 5px solid #ef4444; padding: 15px 25px; border-radius: 14px; display: flex; align-items: center; gap: 15px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); z-index: 10000; transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; pointer-events: none; min-width: 320px; }
            .guardian-toast.active { transform: translateX(-50%) translateY(0); opacity: 1; }
            .guardian-toast.success { border-color: #3b82f6; border-left-color: #3b82f6; }
            .g-icon { color: inherit; font-size: 24px; animation: pulseG 1.5s infinite; }
            @keyframes pulseG { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
            
            #guardian-shield { position: absolute; inset: 0; z-index: 99; background: #050811; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .shield-panel { text-align: center; max-width: 420px; background: rgba(255, 255, 255, 0.03); padding: 25px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(10px); box-shadow: 0 30px 60px rgba(0,0,0,0.4); }
            .shield-dns-text { color: #f87171; font-size: 12px; font-weight: 600; line-height: 1.6; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
            .shield-btn { background: #3b82f6; color: white; border: none; padding: 12px 28px; border-radius: 30px; font-size: 13px; font-weight: 800; text-transform: uppercase; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; transition: 0.3s; box-shadow: 0 10px 20px rgba(59,130,246,0.3); }
            .shield-btn:hover { transform: scale(1.05); background: #2563eb; }

            /* ESTILOS DE LA LISTA DE ADICIONALES EN AJUSTES */
            .os-settings-title { font-size: 11px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin: 25px 0 10px 5px; }
            .os-settings-list { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; overflow: hidden; list-style: none; padding: 0; margin: 0; }
            .os-settings-item { border-bottom: 1px solid rgba(255,255,255,0.05); }
            .os-settings-item:last-child { border-bottom: none; }
            .os-settings-link { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; color: #e2e8f0; text-decoration: none; font-size: 13px; font-weight: 700; transition: background 0.2s; }
            .os-settings-link:active { background: rgba(255,255,255,0.05); }
            .os-settings-arrow { color: #475569; font-size: 18px; }
        `;
        document.head.appendChild(style);
    },

    createToast() {
        const toast = document.createElement('div');
        toast.id = 'guardian-toast';
        toast.className = 'guardian-toast success';
        toast.innerHTML = `<span class="material-symbols-rounded g-icon" id="g-icon">security</span><div><div style="color:white; font-size:13px; font-weight:900; margin-bottom:2px">CINEFLUX GUARDIAN</div><div id="g-text" style="color:#cbd5e1; font-size:11px">Escudo Activo</div></div>`;
        document.body.appendChild(toast);
    },
    
    notify(msg, type = 'success') {
        const t = document.getElementById('guardian-toast');
        if(!t) return;
        const icon = document.getElementById('g-icon');
        t.className = `guardian-toast active ${type}`;
        document.getElementById('g-text').innerText = msg;
        icon.innerText = type === 'success' ? 'security' : 'warning';
        if(navigator.vibrate) navigator.vibrate(type === 'error' ? [50, 50, 50] : 50);
        if(this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => t.classList.remove('active'), 4000);
    }
};

/* ================================================================
   GESTOR DE AJUSTES AVANZADOS
   ================================================================ */
const settings = {
    cache: {},
    async init() {
        const defaults = { theme: 'dark', language: 'es-MX', autoplay: false, quality: 'auto' };
        for (const key of Object.keys(defaults)) {
            const val = await dbEngine.get('app_settings', key);
            this.cache[key] = val !== null ? val : defaults[key];
        }
        this.apply();
    },
    async set(key, value) {
        this.cache[key] = value;
        await dbEngine.set('app_settings', key, value);
        this.apply();
    },
    async get(key) { return this.cache[key]; },
    apply() { 
        document.body.className = `${this.cache.theme}-mode`; 
        document.documentElement.className = `${this.cache.theme}-mode`; 
    }
};

/* ================================================================
   CORE APP
   ================================================================ */
const app = {
    async init() {
        await dbEngine.init(); 
        await settings.init(); 

        this.renderTabs();
        router.init(); 
        profile.init();
        favs.init();
        ui.init();
        guardian.init(); 
        
        this.preCacheAllCatalog();

        window.addEventListener('scroll', () => this.handleScroll(), { passive: true });
    },

    async preCacheAllCatalog() {
        const allIds = [].concat(...Object.values(DATABASE));
        for (const id of allIds) {
            try {
                await api.fetchTMDB(`/movie/${id}`);
                await api.fetchTMDB(`/movie/${id}/credits`);
            } catch (e) {}
        }
    },

    handleScroll() {
        const st = window.pageYOffset || document.documentElement.scrollTop;
        if (st > lastScrollTop && st > 50) document.body.classList.add('scroll-down');
        else document.body.classList.remove('scroll-down');
        lastScrollTop = st <= 0 ? 0 : st;
    },

    renderTabs() {
        const menu = document.getElementById('tabs-menu');
        const categories = ["Inicio", ...Object.keys(DATABASE)];
        menu.innerHTML = categories.map((cat) => {
            const routeTarget = cat === "Inicio" ? "#/home" : `#/category/${encodeURIComponent(cat)}`;
            return `<div class="tab-item" data-cat="${cat}" onclick="location.hash='${routeTarget}'">${cat}</div>`;
        }).join('');
    },

    switchViewDOM(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        
        const activeView = document.getElementById(`v-${viewId}`);
        if(activeView) activeView.classList.add('active');
        
        const activeNavBtn = document.querySelector(`.nav-item[onclick*="'${viewId}'"]`);
        if(activeNavBtn) activeNavBtn.classList.add('active');

        document.getElementById('tabs-menu').style.display = (viewId === 'home') ? 'flex' : 'none';
    },

    showHomeSection(type, catName = '') {
        const dynamic = document.getElementById('dynamic-content');
        const grid = document.getElementById('category-grid');
        const hero = document.getElementById('hero');
        const favRow = document.getElementById('fav-row');

        const visualCatName = type === 'inicio' ? 'Inicio' : catName;
        document.querySelectorAll('.tab-item').forEach(t => {
            if(t.getAttribute('data-cat') === visualCatName) t.classList.add('active');
            else t.classList.remove('active');
        });

        if(type === 'inicio') {
            dynamic.classList.remove('hidden');
            grid.classList.add('hidden');
            hero.classList.remove('hidden');
            if(favs.list.length > 0) favRow?.classList.remove('hidden');
        } else {
            dynamic.classList.add('hidden');
            grid.classList.remove('hidden');
            hero.html = '';
            hero.classList.add('hidden');
            favRow?.classList.add('hidden');
            this.renderCategoryGrid(catName);
        }
    },

    async renderCategoryGrid(cat) {
        const grid = document.getElementById('category-grid');
        grid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500">Cargando...</div>';
        const ids = DATABASE[cat] || [];
        try {
            const movies = await Promise.all(ids.map(id => api.fetchTMDB(`/movie/${id}`)));
            grid.innerHTML = movies.map(m => this.createCard(m)).join('');
        } catch(e) {
            grid.innerHTML = '<div class="text-red-500 text-center">Error al cargar la categoría</div>';
        }
    },

    createCard(m) {
        if(!m || !m.vote_average) return ''; 
        const rate = m.vote_average.toFixed(1);
        const rateColor = rate >= 7 ? 'text-green-400' : (rate >= 5 ? 'text-yellow-400' : 'text-red-400');
        return `<div class="card" onclick="location.hash='#/movie/${m.id}'">
            <img src="https://image.tmdb.org/t/p/w500${m.poster_path}" loading="lazy">
            <div class="rating-badge"><span class="material-symbols-rounded" style="font-size:10px">star</span><span class="${rateColor}">${rate}</span></div>
        </div>`;
    },

    nav(id) { location.hash = `#/${id}`; },

    async renderHomeData() {
        const container = document.getElementById('dynamic-content');
        container.innerHTML = "";
        for (const [title, ids] of Object.entries(DATABASE)) {
            const row = document.createElement('div');
            row.innerHTML = `<h2 class="section-title">${title}</h2><div id="row-${title.replace(/\s/g,'')}" class="h-scroll"></div>`;
            container.appendChild(row);
            const el = document.getElementById(`row-${title.replace(/\s/g,'')}`);
            
            const movies = await Promise.all(ids.map(id => api.fetchTMDB(`/movie/${id}`)));
            el.innerHTML = movies.map(m => this.createCard(m)).join('');
        }
        this.initHero();
    },

    async renderHome() {
        const container = document.getElementById('dynamic-content');
        if (container && container.innerHTML === "") { 
            await this.renderHomeData();
        }
    },

    async initHero() {
        const allIds = [].concat(...Object.values(DATABASE));
        const randomId = allIds[Math.floor(Math.random() * allIds.length)];
        try {
            const d = await api.fetchTMDB(`/movie/${randomId}`);
            document.getElementById('hero').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${d.backdrop_path})`;
            document.getElementById('hero-title').innerText = d.title;
            document.getElementById('hero-year').innerText = d.release_date.split('-')[0];
            document.getElementById('hero-rating').innerHTML = `<span class="material-symbols-rounded text-sm">star</span> ${d.vote_average.toFixed(1)}`;
            document.getElementById('hero-sinopsis').innerText = d.overview;
            document.getElementById('hero-play').onclick = () => location.hash = `#/movie/${randomId}`;
            
            const favBtn = document.getElementById('hero-fav-btn-action');
            if(favBtn) favBtn.onclick = () => favs.toggle(randomId);
            favs.updateIcon(document.getElementById('hero-fav-icon'), randomId);
        } catch(e) {}
    },

    async openModalVisual(id) {
        const mod = document.getElementById('m-movie');
        mod.style.display = 'block';
        document.body.style.overflow = 'hidden';
        try {
            const [d, c] = await Promise.all([
                api.fetchTMDB(`/movie/${id}`),
                api.fetchTMDB(`/movie/${id}/credits`)
            ]);
            
            currentMovieData = { ...d, studio: d.production_companies[0]?.name || 'N/A' };
            document.getElementById('m-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${d.backdrop_path})`;
            document.getElementById('m-title').innerText = d.title;
            document.getElementById('m-rate-badge').innerText = d.vote_average.toFixed(1);
            document.getElementById('m-year').innerText = d.release_date.split('-')[0];
            document.getElementById('m-runtime').innerText = `${d.runtime} MIN`;
            document.getElementById('m-studio').innerText = currentMovieData.studio;
            document.getElementById('m-plot').innerText = d.overview || "---";
            document.getElementById('m-dir').innerText = c.crew.find(p => p.job === 'Director')?.name || '---';
            document.getElementById('m-revenue').innerText = d.revenue > 0 ? `$${(d.revenue/1e6).toFixed(1)}M` : 'N/A';
            document.getElementById('m-cast').innerHTML = c.cast.slice(0,8).map(a => `<div class="flex-shrink-0 text-center w-16"><img src="${a.profile_path?'https://image.tmdb.org/t/p/w200'+a.profile_path:'https://ui-avatars.com/api/?name='+a.name}" class="w-12 h-12 rounded-full mx-auto object-cover mb-2"><p class="text-[9px] font-bold text-gray-400 truncate">${a.name}</p></div>`).join('');
            
            const playBtn = document.getElementById('m-play-btn');
            if(CONTENT_LINKS[id]) {
                playBtn.onclick = () => this.openPlayer(CONTENT_LINKS[id]);
                playBtn.innerHTML = '<span class="material-symbols-rounded fill-1">play_arrow</span> REPRODUCIR';
                playBtn.disabled = false;
                playBtn.style.opacity = "1";
            } else {
                playBtn.innerText = "NO DISPONIBLE";
                playBtn.disabled = true;
                playBtn.style.opacity = "0.5";
            }
            const fBtn = document.getElementById('m-fav-btn');
            if(fBtn) fBtn.onclick = () => { favs.toggle(id); favs.updateIcon(fBtn.querySelector('span'), id); };
            if(fBtn) favs.updateIcon(fBtn.querySelector('span'), id);
        } catch (e) { console.error(e); }
    },

    openPlayer(url) {
        const playerView = document.getElementById('m-player-view');
        playerView.classList.remove('hidden');
        
        if(currentMovieData) {
            document.getElementById('p-overlay-title').innerText = currentMovieData.title;
            document.getElementById('p-overlay-year').innerText = currentMovieData.release_date.split('-')[0];
            document.getElementById('p-overlay-studio').innerText = currentMovieData.studio;
            document.getElementById('p-overlay-rate').innerText = currentMovieData.vote_average.toFixed(1);
        }

        const container = document.querySelector('.viewport-container');
        container.innerHTML = ''; 

        const shield = document.createElement('div');
        shield.id = 'guardian-shield';
        shield.innerHTML = `
            <div class="shield-panel">
                <div class="shield-dns-text">
                    ⚠️ NOTA: Para bloquear el 100% de los anuncios y ventanas emergentes del reproductor, te recomendamos configurar un DNS privado (como AdGuard DNS) en tu dispositivo.
                </div>
                <button class="shield-btn">
                    <span class="material-symbols-rounded">play_circle</span> Click para reproducir
                </button>
            </div>
        `;
        
        const iframe = document.createElement('iframe');
        iframe.id = 'vEngine';
        iframe.className = 'viewport';
        iframe.setAttribute('referrerpolicy', 'no-referrer'); 
        iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
        iframe.setAttribute('frameborder', '0');
        iframe.src = "about:blank"; 

        container.appendChild(shield);
        container.appendChild(iframe);

        shield.onclick = () => {
            if(iframe.src === "about:blank") iframe.src = url;
            guardian.notify("Streaming Iniciado Exitosamente", "success");
            shield.style.transition = "opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
            shield.style.opacity = "0";
            setTimeout(() => shield.remove(), 500);
        };

        if (playerView.requestFullscreen) playerView.requestFullscreen();
    },

    closePlayer() {
        const container = document.querySelector('.viewport-container');
        if(container) container.innerHTML = ''; 
        document.getElementById('m-player-view').classList.add('hidden');
        if (document.exitFullscreen) document.exitFullscreen();
        document.getElementById('report-menu')?.classList.remove('open');
    },

    closeModalVisual() {
        this.closePlayer();
        const mod = document.getElementById('m-movie');
        if(mod) mod.style.display = 'none';
        document.body.style.overflow = 'auto';
    },

    closeModal() { location.hash = router.previousRoute || '#/home'; },
    toggleReport() { document.getElementById('report-menu')?.classList.toggle('open'); },
    
    async shareMovie() {
        if(!currentMovieData) return;
        const url = `${window.location.origin}${window.location.pathname}#/movie/${currentMovieData.id}`;
        if(navigator.share) navigator.share({title: currentMovieData.title, url: url});
        else {
            navigator.clipboard.writeText(url);
            guardian.notify("Enlace de película copiado", "success");
        }
    },

    async search(q) {
        const grid = document.getElementById('search-grid');
        if(!grid || q.length < 3) return;
        try {
            const r = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${q}&language=es-MX`).then(res => res.json());
            grid.innerHTML = r.results.map(m => this.createCard(m)).join('');
        } catch(e) {}
    },

    async reset() { 
        if(confirm("¿Borrar todos los datos y caché local?")) { 
            indexedDB.deleteDatabase('CinefluxOS_DB');
            localStorage.clear(); 
            location.reload(); 
        } 
    }
};

/* ================================================================
   OTROS SISTEMAS (UI INTERFAZ + RECONEXIÓN DE TEMAS)
   ================================================================ */
const favs = {
    list: [],
    async init() { 
        const stored = await dbEngine.get('user_data', 'favs');
        this.list = stored || [];
        this.render(); 
    },
    async toggle(id) {
        if(this.list.includes(id)) this.list = this.list.filter(x => x !== id);
        else this.list.push(id);
        await dbEngine.set('user_data', 'favs', this.list);
        this.render();
        favs.updateIcon(document.getElementById('hero-fav-icon'), id);
    },
    updateIcon(el, id) {
        if(!el) return;
        const isFav = this.list.includes(id);
        el.innerText = isFav ? 'check' : 'add';
        el.style.color = isFav ? '#3b82f6' : '#fff';
    },
    async render() {
        const row = document.getElementById('fav-row');
        const cont = document.getElementById('fav-container');
        if(!cont) return;
        if(this.list.length === 0) { row?.classList.add('hidden'); return; }
        row?.classList.remove('hidden');
        cont.innerHTML = "";
        
        const movies = await Promise.all(this.list.map(id => api.fetchTMDB(`/movie/${id}`)));
        cont.innerHTML = movies.map(m => `<div class="card" onclick="location.hash='#/movie/${m.id}'"><img src="https://image.tmdb.org/t/p/w300${m.poster_path}"></div>`).join('');
    }
};

const ui = {
    async init() {
        this.renderSettingsExtras();
        this.syncThemeSelector(); 

        setInterval(() => {
            const el = document.getElementById('sys-time');
            if(el) el.innerText = new Date().toLocaleTimeString();
            const timerEl = document.getElementById('sys-timer');
            if(timerEl) {
                const diff = Date.now() - appStartTime;
                const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
                const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2,'0');
                const s = Math.floor((diff % 60000) / 1000).toString().padStart(2,'0');
                timerEl.innerText = `${h}:${m}:${s}`;
            }
        }, 1000);
        try {
            const ipData = await fetch('https://ipapi.co/json/').then(r => r.json());
            const countryEl = document.getElementById('sys-country');
            if(countryEl) countryEl.innerText = ipData.country_name || "Globo";
        } catch(e) { 
            const countryEl = document.getElementById('sys-country');
            if(countryEl) countryEl.innerText = "Offline"; 
        }
    },

    async setTheme(themeName) {
        await settings.set('theme', themeName);
    },

    async syncThemeSelector() {
        const selector = document.getElementById('theme-selector');
        if (selector) {
            const activeTheme = await settings.get('theme');
            if (activeTheme) selector.value = activeTheme;
        }
    },

    renderSettingsExtras() {
        const container = document.getElementById('settings-extra-container');
        if (!container) return; 
        container.innerHTML = `
            <div class="os-settings-title">Redes sociales</div>
            <ul class="os-settings-list">
                <li class="os-settings-item">
                    <a href="https://wa.me/tu_numero" target="_blank" class="os-settings-link">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: rgba(34, 197, 94, 0.1); border-radius: 8px;">
                                <svg style="width: 16px; height: 16px; fill: #22c55e;" viewBox="0 0 24 24">
                                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.456L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.328 1.981 13.859.954 11.23.954c-5.438 0-9.863 4.374-9.867 9.803-.001 1.73.457 3.419 1.323 4.921l-.982 3.585 3.676-.965zm11.841-4.892c-.344-.173-2.038-1.005-2.349-1.118-.312-.114-.539-.172-.767.172-.228.344-.88 1.118-1.078 1.346-.199.228-.399.256-.743.083-1.123-.563-1.943-.977-2.71-2.292-.204-.348.204-.323.584-1.082.063-.128.031-.24-.016-.326-.047-.086-.4-.964-.548-1.322-.14-.34-.294-.293-.404-.299-.105-.005-.226-.006-.347-.006-.12 0-.317.045-.483.228-.166.183-.634.621-.634 1.513 0 .892.648 1.754.738 1.876.091.122 1.275 1.947 3.09 2.731.432.186.769.297 1.031.381.434.137.829.117 1.141.07.348-.051 1.038-.424 1.187-.833.15-.408.15-.758.105-.833-.045-.075-.165-.114-.51-.287z"/>
                                </svg>
                            </div>
                            <span>1. WhatsApp</span>
                        </div>
                        <span class="material-symbols-rounded os-settings-arrow">chevron_right</span>
                    </a>
                </li>
                <li class="os-settings-item">
                    <a href="https://tiktok.com/@tu_cuenta" target="_blank" class="os-settings-link">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
                                <svg style="width: 14px; height: 14px; fill: #e2e8f0;" viewBox="0 0 24 24">
                                    <path d="M12.525.02c1.312.0 2.614.173 3.86.516V5.12c-.792-.244-1.616-.367-2.443-.367h-.726v7.382c0 2.877-2.338 5.214-5.215 5.214-2.876 0-5.214-2.337-5.214-5.214 0-2.877 2.338-5.215 5.214-5.215.344 0 .685.033 1.02.1v-4.38c-.337-.023-.677-.035-1.02-.035C3.626 2.545 0 6.171 0 10.652c0 4.481 3.626 8.107 8.107 8.107 4.428 0 8.033-3.55 8.105-7.954V5.163c1.472 1.056 3.242 1.687 5.16 1.713v-4.38c-2.404-.031-4.526-1.332-5.69-3.25L12.525.02z"/>
                                </svg>
                            </div>
                            <span>2. TikTok</span>
                        </div>
                        <span class="material-symbols-rounded os-settings-arrow">chevron_right</span>
                    </a>
                </li>
            </ul>

            <div class="os-settings-title">Otros ajustes</div>
            <ul class="os-settings-list">
                <li class="os-settings-item">
                    <a href="https://tu-enlace-de-chat.com" target="_blank" class="os-settings-link">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                                <span class="material-symbols-rounded" style="color: #3b82f6; font-size: 18px;">chat_bubble</span>
                            </div>
                            <span>1. Chat</span>
                        </div>
                        <span class="material-symbols-rounded os-settings-arrow">chevron_right</span>
                    </a>
                </li>
                <li class="os-settings-item">
                    <a href="https://tu-enlace-de-video.com" target="_blank" class="os-settings-link">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">
                                <span class="material-symbols-rounded" style="color: #ef4444; font-size: 18px;">smart_display</span>
                            </div>
                            <span>2. Video</span>
                        </div>
                        <span class="material-symbols-rounded os-settings-arrow">chevron_right</span>
                    </a>
                </li>
            </ul>
        `;
    }
};

/* ================================================================
   SISTEMA DE PERFIL DE USUARIO
   ================================================================ */
const profile = {
    async init() {
        const pName = await dbEngine.get('user_data', 'p_name') || "";
        const pImg = await dbEngine.get('user_data', 'p_img') || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";
        
        const nameInput = document.getElementById('p-name-input');
        const imgEl = document.getElementById('p-img');
        const navPfp = document.getElementById('nav-pfp');

        if(nameInput) {
            nameInput.value = pName;
            nameInput.addEventListener('input', (e) => dbEngine.set('user_data', 'p_name', e.target.value));
        }
        if(imgEl) imgEl.src = pImg;
        if(navPfp) navPfp.src = pImg;
    },
    changePhoto(e) {
        const reader = new FileReader();
        reader.onload = async () => {
            await dbEngine.set('user_data', 'p_img', reader.result);
            const imgEl = document.getElementById('p-img');
            const navPfp = document.getElementById('nav-pfp');
            if(imgEl) imgEl.src = reader.result;
            if(navPfp) navPfp.src = reader.result;
        };
        if(e.target.files[0]) reader.readAsDataURL(e.target.files[0]);
    }
};

app.init();
</script>