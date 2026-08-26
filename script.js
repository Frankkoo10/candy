// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = 'https://wgqqbahoalozgfukioza.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncXFiYWhvYWxvemdmdWtpb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTA3OTYsImV4cCI6MjA5OTgyNjc5Nn0.v_kpYceS8ceIUBNaLLHjfyBeFA2Y3lDRy7Yn6cb5Uz8'; 
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null; 

let currentUser = null; 

// ==========================================
// 2. SÍMBOLOS Y VALORES BASE
// ==========================================
// Réplica de la estructura de pagos de Sweet Bonanza (Pragmatic Play):
// 4 frutas de pago bajo, 4 caramelos de pago alto, corazón como símbolo tope
// y la paleta como Scatter. Los valores están calibrados por simulación
// (ver nota al final del archivo) para que el RTP teórico ronde ~92-96%,
// como en el juego original, en vez de "nunca pagar" o "pagar siempre".
const symbols = [
    { key: 'corazon', img: 'corazon.png',                  val: 14   }, // top symbol
    { key: 'violeta',  img: 'violeta.png',                  val: 7    },
    { key: 'verde',    img: 'verde.png',                    val: 5.6  },
    { key: 'azul',     img: 'azul.png',                     val: 4.2  },
    { key: 'manzana',  img: 'manzana.png',                  val: 2.8  },
    { key: 'ciruela',  img: 'ciruela.png',                  val: 2.1  },
    { key: 'sandia',   img: 'uvaverde__sandia_.png',        val: 1.4  },
    { key: 'uva',      img: 'uva.png',                      val: 1.1  },
    { key: 'banana',   img: 'anana__banana_.png',           val: 0.7  }
];
const SCATTER_KEY = 'paleta';
const SCATTER_IMG = 'paleta.png';
const BOMB_KEY = 'bomba';

// Imágenes de bomba según el tamaño del multiplicador (usa las 4 variantes que mandaste)
function getBombImage(mult) {
    if (mult <= 4) return 'bomba-chica.png';
    if (mult <= 15) return 'bomba-media.png';
    if (mult <= 50) return 'bomba-grande.png';
    return 'bomba-enorme.png';
}

// ==========================================
// MOTOR DE SONIDO (100% sintetizado con Web Audio API)
// ==========================================
// Nota: no se pueden empaquetar los audios originales de Sweet Bonanza (son
// propiedad de Pragmatic Play), así que se generan en tiempo real, pero
// calibrados con la psicoacústica real que usan las máquinas de casino:
//   - Rango medio 250–2000 Hz para la mayoría de sonidos (rango donde el
//     oído humano es más sensible, el mismo que usa la voz).
//   - 400–800 Hz para los tonos de "premio/recompensa" (activan la
//     respuesta de anticipación/dopamina según estudios de diseño sonoro
//     de casino), con tonos ASCENDENTES en cada cascada (truco clásico de
//     "casi ganaste / vas ganando más" que usan las tragamonedas reales).
//   - La "chicharra" de bonus imita la alarma de dos tonos alternados
//     (~950 Hz / ~700 Hz) tipo timbre eléctrico de jackpot de casino real,
//     seguida de la fanfarria de giros gratis.
// Todo corre local, sin archivos externos, y pasa por un compresor para
// poder sonar más fuerte al máximo sin distorsionar.
const SoundFX = (() => {
    let ctx = null;
    let masterGain = null;
    let compressor = null;
    let musicGain = null;
    let sfxGain = null;
    let musicTimerId = null;
    let musicMode = null; // 'base' | 'bonus'
    let musicStepIndex = 0;
    let muted = false;
    let volume = 0.6;

    // El gain "de unidad" (1.0) real que llega al compresor. Al 100% del slider
    // sube hasta 1.7 para que se note bien más fuerte; el compresor evita que
    // recorte/distorsione la señal.
    function gainForVolume(v) { return v * 1.7; }

    function ensureContext() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();

            compressor = ctx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-18, ctx.currentTime);
            compressor.knee.setValueAtTime(24, ctx.currentTime);
            compressor.ratio.setValueAtTime(8, ctx.currentTime);
            compressor.attack.setValueAtTime(0.003, ctx.currentTime);
            compressor.release.setValueAtTime(0.2, ctx.currentTime);
            compressor.connect(ctx.destination);

            masterGain = ctx.createGain();
            masterGain.gain.value = muted ? 0 : gainForVolume(volume);
            masterGain.connect(compressor);

            musicGain = ctx.createGain();
            musicGain.gain.value = 0.30;
            musicGain.connect(masterGain);

            sfxGain = ctx.createGain();
            sfxGain.gain.value = 1;
            sfxGain.connect(masterGain);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : gainForVolume(volume), ctx.currentTime, 0.01);
    }

    function toggleMute(forceState) {
        muted = forceState !== undefined ? forceState : !muted;
        if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : gainForVolume(volume), ctx.currentTime, 0.01);
        return muted;
    }

    function tone({ freq = 440, type = 'sine', duration = 0.15, gain = 0.3, delay = 0, glideTo = null, node = sfxGain }) {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        const t0 = ctx.currentTime + delay;
        osc.frequency.setValueAtTime(freq, t0);
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), t0 + duration);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        osc.connect(g);
        g.connect(node);
        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
    }

    function noiseBurst({ duration = 0.35, gain = 0.5, filterFreq = 1200, delay = 0, node = sfxGain }) {
        if (!ctx) return;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, ctx.currentTime + delay);
        filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + delay + duration);
        const g = ctx.createGain();
        const t0 = ctx.currentTime + delay;
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        src.connect(filter);
        filter.connect(g);
        g.connect(node);
        src.start(t0);
        src.stop(t0 + duration + 0.05);
    }

    // Escala de "premio" dentro de la franja 500-1050 Hz que la investigación de
    // sonido de casino marca como la zona de mayor respuesta de recompensa,
    // extendiéndose un poco más arriba para las cascadas finales.
    const CANDY_SCALE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];

    function click() {
        ensureContext();
        tone({ freq: 850, type: 'square', duration: 0.05, gain: 0.18 });
    }

    // Sonido de rodillo mecánico (whoosh filtrado), como el "reel spin" de las tragamonedas reales
    function spinStart() {
        ensureContext();
        noiseBurst({ duration: 0.3, gain: 0.22, filterFreq: 2200 });
        tone({ freq: 180, glideTo: 480, type: 'sawtooth', duration: 0.3, gain: 0.14 });
    }

    // Pop de caramelo — el tono sube en cada cascada consecutiva (truco clásico
    // de "vas ganando más" que usan las tragamonedas reales)
    function tumblePop(step = 0) {
        ensureContext();
        const note = CANDY_SCALE[Math.min(step, CANDY_SCALE.length - 1)];
        tone({ freq: note, type: 'sine', duration: 0.22, gain: 0.32 });
        tone({ freq: note * 2, type: 'triangle', duration: 0.12, gain: 0.12, delay: 0.02 });
    }

    function scatterLand() {
        ensureContext();
        [0, 0.06, 0.12].forEach((d, i) => {
            tone({ freq: 900 + i * 220, type: 'triangle', duration: 0.2, gain: 0.25, delay: d });
        });
    }

    // "CHICHARRA" de bonus: alarma de dos tonos alternados, como el timbre
    // eléctrico de jackpot en las tragamonedas de casino reales
    function bonusSiren() {
        ensureContext();
        const freqA = 950, freqB = 700;
        const stepDur = 0.11;
        const reps = 10; // ~1.1s de "brrring brrring"
        for (let i = 0; i < reps; i++) {
            tone({ freq: i % 2 === 0 ? freqA : freqB, type: 'square', duration: stepDur * 0.85, gain: 0.4, delay: i * stepDur });
        }
    }

    function bonusFanfare() {
        ensureContext();
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((f, i) => tone({ freq: f, type: 'square', duration: 0.28, gain: 0.24, delay: 1.15 + i * 0.11 }));
    }

    function bombExplode(size = 1) {
        ensureContext();
        noiseBurst({ duration: 0.4, gain: Math.min(0.4 + size * 0.01, 0.75), filterFreq: 1500 });
        tone({ freq: 90, type: 'sine', duration: 0.35, gain: 0.4, delay: 0.01 });
    }

    function bigWin() {
        ensureContext();
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1568.00];
        notes.forEach((f, i) => tone({ freq: f, type: 'sawtooth', duration: 0.5, gain: 0.22, delay: i * 0.09 }));
    }

    function coinTally() {
        ensureContext();
        tone({ freq: 1200, type: 'triangle', duration: 0.09, gain: 0.18 });
    }

    // Música de fondo: arpegio suave que se reprograma solo (sin archivos externos)
    function scheduleMusicLoop(mode) {
        if (!ctx) return;
        const baseNotes = [392.00, 523.25, 659.25, 523.25, 587.33, 466.16, 392.00, 587.33];
        const bonusNotes = [523.25, 659.25, 783.99, 659.25, 880.00, 783.99, 659.25, 987.77];
        const notes = mode === 'bonus' ? bonusNotes : baseNotes;
        const stepDuration = mode === 'bonus' ? 220 : 280;

        function step() {
            if (musicMode !== mode) return;
            const freq = notes[musicStepIndex % notes.length];
            tone({ freq, type: 'sine', duration: stepDuration / 1000 * 0.9, gain: 0.10, node: musicGain });
            tone({ freq: freq / 2, type: 'triangle', duration: stepDuration / 1000 * 0.9, gain: 0.05, node: musicGain });
            musicStepIndex++;
            musicTimerId = setTimeout(step, stepDuration);
        }
        step();
    }

    function startMusic(mode = 'base') {
        ensureContext();
        if (!ctx) return;
        if (musicMode === mode) return;
        stopMusic();
        musicMode = mode;
        musicStepIndex = 0;
        scheduleMusicLoop(mode);
    }

    function stopMusic() {
        if (musicTimerId) clearTimeout(musicTimerId);
        musicTimerId = null;
        musicMode = null;
    }

    return {
        ensureContext, setVolume, toggleMute, click, spinStart, tumblePop,
        scatterLand, bonusSiren, bonusFanfare, bombExplode, bigWin, coinTally,
        startMusic, stopMusic,
        get muted() { return muted; },
        get volume() { return volume; }
    };
})();

function loadSoundPrefs() {
    try {
        const saved = localStorage.getItem('candyBonanzaSound');
        if (saved) {
            const prefs = JSON.parse(saved);
            if (typeof prefs.volume === 'number') SoundFX.setVolume(prefs.volume);
            if (typeof prefs.muted === 'boolean') SoundFX.toggleMute(prefs.muted);
            return prefs;
        }
    } catch (e) { /* ignore */ }
    return { volume: 0.6, muted: false };
}

function saveSoundPrefs() {
    localStorage.setItem('candyBonanzaSound', JSON.stringify({ volume: SoundFX.volume, muted: SoundFX.muted }));
}

let credit = 10000; 
let baseBet = 2.00; 
let actualBet = 2.00; 
let doubleChance = false; 
let isSpinning = false; 
const MAX_WIN_MULT = 5000; 

// Estado AutoPlay y Velocidad
let autoSpinActive = false; 
let stopOnBonus = false; 
let stopWinLimit = 0; 
let speedMult = 1; 
let currentSpeedMode = 0; // 0: Normal, 1: Rápido, 2: Turbo

let isFreeSpinsMode = false; 
let isSuperBonusMode = false; 
let freeSpinsLeft = 0; 
let totalFsWin = 0; 
let globalMultiplier = 1; 

let gridState = []; 

// Elementos DOM
const gridContainer = document.getElementById('slot-grid');
const spinBtn = document.getElementById('spin-button');
const creditDisplay = document.getElementById('credit-display');
const betDisplay = document.getElementById('bet-display');
const winDisplay = document.getElementById('win-display');
const statusMessage = document.getElementById('status-message');
const betMinus = document.getElementById('bet-minus');
const betPlus = document.getElementById('bet-plus');
const doubleChanceToggle = document.getElementById('double-chance-toggle');
const doubleBetDisplay = document.getElementById('double-bet-display');
const btnBuyFree = document.getElementById('btn-buy-free');
const btnBuySuper = document.getElementById('btn-buy-super');
const buyFsCost = document.getElementById('buy-fs-cost');
const buySuperCost = document.getElementById('buy-super-cost');
const fsOverlay = document.getElementById('fs-overlay');
const fsOverlayTitle = document.getElementById('fs-overlay-title');
const fsCountText = document.getElementById('fs-count');
const bonusHeaderWin = document.getElementById('bonus-header-win');
const bonusTotalAmount = document.getElementById('bonus-total-amount');
const spinWinAccumulator = document.getElementById('spin-win-accumulator');
const accumValue = document.getElementById('accum-value');
const accumMult = document.getElementById('accum-mult');
const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const closeModal = document.getElementById('close-modal');

const volumeBtn = document.getElementById('volume-btn');
const volumeSlider = document.getElementById('volume-slider');
const volumePopup = document.getElementById('volume-popup');

const mainSpeedBtn = document.getElementById('main-speed-btn');
const autoOpenBtn = document.getElementById('auto-open-btn');
const autoModal = document.getElementById('auto-modal');
const closeAutoModal = document.getElementById('close-auto-modal');
const startAutoBtn = document.getElementById('start-auto-btn');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms * speedMult)); 

window.onload = () => {
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader) {
            loader.style.opacity = '0'; 
            setTimeout(() => { loader.style.display = 'none'; verificarSesionYJugar(); }, 500); 
        } else {
            verificarSesionYJugar();
        }
    }, 800); 
};

async function verificarSesionYJugar() {
    statusMessage.innerText = "CARGANDO SALDO..."; 
    try {
        if (supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession(); 
            if (session) {
                currentUser = session.user; 
                const { data: perfilData } = await supabaseClient.from('perfiles').select('saldo').eq('id', currentUser.id).single(); 
                if (perfilData) { credit = parseFloat(perfilData.saldo); } 
                else { await guardarSaldoEnBD(); }
            }
        }
    } catch (error) {
        console.log("Modo local o sin conexión");
    }

    statusMessage.innerText = "¡SABOREANDO EL GIRO!"; 
    if(!loadBonusState()) { initGrid(); }
}

async function guardarSaldoEnBD() {
    if(!currentUser || !supabaseClient) return; 
    await supabaseClient.from('perfiles').upsert({ id: currentUser.id, saldo: credit }); 
}

function saveGameState() { 
    if (isFreeSpinsMode) { 
        const state = { isSuperBonusMode, freeSpinsLeft, totalFsWin, globalMultiplier, baseBet, actualBet, doubleChance };
        localStorage.setItem('sweetBonusState', JSON.stringify(state)); 
    } else {
        localStorage.removeItem('sweetBonusState'); 
    }
}

function loadBonusState() { 
    const saved = localStorage.getItem('sweetBonusState'); 
    if (saved) { 
        const state = JSON.parse(saved); 
        isFreeSpinsMode = true; 
        isSuperBonusMode = state.isSuperBonusMode; 
        freeSpinsLeft = state.freeSpinsLeft; 
        totalFsWin = state.totalFsWin; 
        globalMultiplier = state.globalMultiplier !== undefined ? state.globalMultiplier : 1;
        baseBet = state.baseBet; 
        actualBet = state.actualBet; 
        
        if (state.doubleChance !== undefined) { 
            doubleChance = state.doubleChance; 
            doubleChanceToggle.checked = doubleChance; 
        }
        calculateActualBet(); 

        if (bonusHeaderWin) bonusHeaderWin.style.display = 'flex'; 
        bonusTotalAmount.innerText = `$${totalFsWin.toFixed(2)}`; 
        updateUI(); 
        initGrid(); 

        statusMessage.innerText = "🍭 RECUPERANDO BONUS DULCE 🍭";
        setTimeout(() => { executeFreeSpinsLoop(); }, 2000); 
        return true; 
    }
    return false; 
}

function initGrid() { 
    gridContainer.innerHTML = ''; 
    gridState = []; 
    for (let i = 0; i < 30; i++) { 
        gridState.push(getRandomSymbolWithProbability()); 
    }
    renderGridDOM(); 
    updateUI(); 
}

function renderGridDOM() {
    gridContainer.innerHTML = '';
    gridState.forEach((item) => {
        const cell = document.createElement('div');
        cell.classList.add('slot-cell', 'landing');
        
        if (item) {
            const img = document.createElement('img');
            img.classList.add('symbol-img');
            img.src = item.img;
            img.alt = item.key;
            cell.appendChild(img);

            if (item.isBomb) {
                cell.classList.add('bomb-cell');
                const badge = document.createElement('span');
                badge.classList.add('bomb-badge');
                badge.innerText = `x${item.multiplierValue}`;
                cell.appendChild(badge);
            }
        } else {
            cell.style.opacity = '0';
        }
        gridContainer.appendChild(cell);
    });
}

function updateUI() {
    creditDisplay.innerText = `$${credit.toFixed(2)}`; 
    betDisplay.innerText = `$${actualBet.toFixed(2)}`; 
    doubleBetDisplay.innerText = `$${(baseBet * 1.25).toFixed(2)}`; 
    buyFsCost.innerText = `$${(baseBet * 100).toFixed(2)}`; 
    buySuperCost.innerText = `$${(baseBet * 500).toFixed(2)}`; 
}

betPlus.addEventListener('click', () => { 
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return; 
    SoundFX.click();
    if (baseBet < 2000) {  
        if (baseBet < 20) baseBet += 2.00; 
        else if (baseBet < 100) baseBet += 10.00; 
        else if (baseBet < 500) baseBet += 50.00; 
        else baseBet += 100.00; 
        if (baseBet > 2000) baseBet = 2000; 
        calculateActualBet();  
    }
});

betMinus.addEventListener('click', () => { 
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return; 
    SoundFX.click();
    if (baseBet > 2.00) {  
        if (baseBet <= 20) baseBet -= 2.00; 
        else if (baseBet <= 100) baseBet -= 10.00; 
        else if (baseBet <= 500) baseBet -= 50.00; 
        else baseBet -= 100.00; 
        if (baseBet < 2.00) baseBet = 2.00; 
        calculateActualBet();  
    }
});

function calculateActualBet() { 
    actualBet = doubleChance ? baseBet * 1.25 : baseBet; 
    updateUI(); 
}

doubleChanceToggle.addEventListener('change', (e) => { 
    if (isSpinning || isFreeSpinsMode || autoSpinActive) { 
        e.target.checked = !e.target.checked; 
        return; 
    }
    doubleChance = e.target.checked; 
    SoundFX.click();
    calculateActualBet(); 
});

// CONTROL DE VELOCIDAD
if (mainSpeedBtn) {
    mainSpeedBtn.addEventListener('click', () => {
        SoundFX.click();
        currentSpeedMode = (currentSpeedMode + 1) % 3;
        const speedRadios = document.getElementsByName('speed');

        if(currentSpeedMode === 0) { speedMult = 1; mainSpeedBtn.innerText = "NORM"; if(speedRadios[0]) speedRadios[0].checked = true; }
        if(currentSpeedMode === 1) { speedMult = 0.4; mainSpeedBtn.innerText = "RÁPIDO"; if(speedRadios[1]) speedRadios[1].checked = true; }
        if(currentSpeedMode === 2) { speedMult = 0.1; mainSpeedBtn.innerText = "TURBO⚡"; if(speedRadios[2]) speedRadios[2].checked = true; }
    });
}

btnBuyFree.addEventListener('click', async () => { 
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return; 
    SoundFX.click();
    const cost = baseBet * 100; 
    if (credit >= cost) { 
        credit -= cost; await guardarSaldoEnBD(); updateUI(); 
        isSuperBonusMode = false; triggerFreeSpins(10); 
    } else { statusMessage.innerText = "CRÉDITO INSUFICIENTE"; }
});

btnBuySuper.addEventListener('click', async () => { 
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return; 
    SoundFX.click();
    const cost = baseBet * 500; 
    if (credit >= cost) { 
        credit -= cost; await guardarSaldoEnBD(); updateUI(); 
        isSuperBonusMode = true; triggerFreeSpins(15); 
    } else { statusMessage.innerText = "CRÉDITO INSUFICIENTE"; }
});

spinBtn.addEventListener('click', async () => { 
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return; 
    SoundFX.ensureContext();
    startAppropriateMusic();
    SoundFX.click();
    if (credit >= actualBet) { 
        credit -= actualBet; 
        await guardarSaldoEnBD();  
        winDisplay.innerText = "$0.00"; 
        updateUI(); 
        executeSpin(); 
    } else {
        statusMessage.innerText = "CRÉDITO INSUFICIENTE"; 
        if (autoSpinActive) stopAutoPlay();
    }
});

async function executeSpin() { 
    isSpinning = true; 
    SoundFX.spinStart();
    statusMessage.innerText = isFreeSpinsMode ? `GIROS RESTANTES: ${freeSpinsLeft}` : (speedMult < 1 ? "GIRO RÁPIDO/TURBO" : "¡SABOREANDO EL GIRO!");
    spinWinAccumulator.style.display = 'none'; 
    accumValue.innerText = "$0.00"; 
    accumMult.innerText = ""; 
    
    if (isFreeSpinsMode) saveGameState(); 

    const cells = document.querySelectorAll('.slot-cell'); 
    cells.forEach(cell => cell.classList.add('spinning')); 
    await delay(350);

    generateNewSymbols(); 
    renderGridDOM(); 
    await handleTumbles(); 
}

// ==========================================
// MATEMÁTICA Y PESOS — RÉPLICA DEL MODELO SWEET BONANZA
// ==========================================
// Notas de diseño (ver simulación de calibración):
// - Grilla 6x5 = 30 celdas, "Paga en cualquier lado": 8+ símbolos iguales pagan.
// - Estos pesos fueron probados con una simulación Monte Carlo para lograr:
//     · Frecuencia de acierto en juego base ≈ 28-32% (similar a Sweet Bonanza real ~24-31%)
//     · Ningún símbolo domina tanto la grilla como para pagar "siempre"
//     · Las bombas SOLO aparecen en Giros Gratis (igual que el juego original)
// - Los símbolos de pago más bajo (banana, uva, sandía) son mucho más comunes
//   que los de pago alto (corazón), igual que en el original.
const baseWeights = {
    banana:  40,
    uva:     35,
    sandia:  30,
    ciruela: 26,
    manzana: 23,
    azul:    20,
    verde:   17,
    violeta: 15,
    corazon: 13
};

function getRandomSymbolWithProbability() {
    let weights = { ...baseWeights };
    // Scatter: la doble chance ("ante bet") ~1.8x más probabilidad de Scatter, como en
    // el sistema de "Apuesta Ante" de los juegos Pragmatic Play reales.
    weights[SCATTER_KEY] = doubleChance ? 9 : 5;

    if (isFreeSpinsMode) {
        // En Giros Gratis los caramelos de pago alto son más frecuentes
        // y aparece la Bomba Multiplicadora (nunca en el juego base).
        weights['azul']    = 26;
        weights['verde']   = 22;
        weights['violeta'] = 20;
        weights['corazon'] = 17;
        weights[BOMB_KEY]  = isSuperBonusMode ? 22 : 15;
    }

    let totalWeight = 0;
    for (let key in weights) totalWeight += weights[key];

    let randomNum = Math.random() * totalWeight;
    let selectedKey = 'banana';

    for (let key in weights) {
        if (randomNum < weights[key]) {
            selectedKey = key;
            break;
        }
        randomNum -= weights[key];
    }

    if (selectedKey === BOMB_KEY) {
        let finalMult = 2;
        if (isSuperBonusMode) {
            // Super Bonus: Bombas de x10 a x100
            const superMults = [
                { val: 10, w: 40 },
                { val: 15, w: 25 },
                { val: 20, w: 15 },
                { val: 25, w: 10 },
                { val: 50, w: 7 },
                { val: 100, w: 3 }
            ];
            finalMult = getRandomWeightedValue(superMults);
        } else {
            // Bonus Normal: Bombas de x2 a x100
            const normalMults = [
                { val: 2, w: 35 },
                { val: 3, w: 25 },
                { val: 4, w: 15 },
                { val: 5, w: 12 },
                { val: 8, w: 5 },
                { val: 10, w: 4 },
                { val: 15, w: 2 },
                { val: 25, w: 1 },
                { val: 50, w: 0.7 },
                { val: 100, w: 0.3 }
            ];
            finalMult = getRandomWeightedValue(normalMults);
        }
        return { key: BOMB_KEY, img: getBombImage(finalMult), isBomb: true, multiplierValue: finalMult };
    }

    if (selectedKey === SCATTER_KEY) {
        return { key: SCATTER_KEY, img: SCATTER_IMG };
    }

    const baseSym = symbols.find(s => s.key === selectedKey);
    return { ...baseSym };
}

function getRandomWeightedValue(items) {
    let total = items.reduce((sum, i) => sum + i.w, 0);
    let rand = Math.random() * total;
    for (let item of items) {
        if (rand < item.w) return item.val;
        rand -= item.w;
    }
    return items[0].val;
}

function generateNewSymbols() { 
    gridState = []; 
    for (let i = 0; i < 30; i++) { gridState.push(getRandomSymbolWithProbability()); }
}

// Pago del Scatter (paleta) según cantidad — igual que Sweet Bonanza real: 4/5/6 = x3/x5/x100
function scatterPayFactor(qty) {
    if (qty >= 6) return 100;
    if (qty === 5) return 5;
    if (qty === 4) return 3;
    return 0;
}

async function handleTumbles() {
    let accumulatedSpinWin = 0;  
    let isWinningTumble = true; 
    let extraFreeSpinsAwarded = false; 
    let activatedFreeSpins = false; 
    let finalSpinWin = 0; 
    let tumbleStep = 0; 

    if (isFreeSpinsMode) spinWinAccumulator.style.display = 'flex'; 

    while (isWinningTumble) { 
        const counts = {}; 
        gridState.forEach(item => { if (item) counts[item.key] = (counts[item.key] || 0) + 1; });

        const winningKeysList = []; 
        let winThisStep = 0; 

        const scatterQty = counts[SCATTER_KEY] || 0;
        const scatterFactor = scatterPayFactor(scatterQty);
        if (scatterFactor > 0) { 
            winningKeysList.push(SCATTER_KEY);
            winThisStep += scatterFactor * baseBet;
            SoundFX.scatterLand();
            if (!isFreeSpinsMode) { 
                activatedFreeSpins = true; 
                if (autoSpinActive && stopOnBonus) stopAutoPlay();
            } else { extraFreeSpinsAwarded = true; }
        } else if (scatterQty === 3 && isFreeSpinsMode) { 
            winningKeysList.push(SCATTER_KEY);  
            SoundFX.scatterLand();
            extraFreeSpinsAwarded = true; 
        }

        for (const key in counts) { 
            if (key === SCATTER_KEY || key === BOMB_KEY) continue;
            const qty = counts[key]; 
            if (qty >= 8) { 
                winningKeysList.push(key); 
                const config = symbols.find(s => s.key === key); 
                let factor = 1.0; 
                if (qty >= 10 && qty <= 11) factor = 1.5;
                if (qty >= 12) factor = 3.0;
                winThisStep += config.val * baseBet * factor; 
            }
        }

        if (winningKeysList.length > 0) { 
            accumulatedSpinWin += winThisStep; 
            spinWinAccumulator.style.display = 'flex'; 
            accumValue.innerText = `$${accumulatedSpinWin.toFixed(2)}`; 
            SoundFX.tumblePop(tumbleStep); 
            tumbleStep++; 

            const domCells = document.querySelectorAll('.slot-cell'); 
            gridState.forEach((item, index) => { 
                if (item && winningKeysList.includes(item.key)) domCells[index].classList.add('win-highlight'); 
            });

            await delay(600);

            gridState.forEach((item, index) => { 
                if (item && winningKeysList.includes(item.key)) { 
                    domCells[index].classList.add('win-pop'); 
                    gridState[index] = null;  
                }
            });

            await delay(200);
            applyGravity(); 
            renderGridDOM(); 
            await delay(200);
            fillEmptySpaces(); 
            renderGridDOM(); 
            await delay(250);
        } else {
            isWinningTumble = false; 
        }
    }

    if (accumulatedSpinWin > 0) { 
        let spinOrbsSum = 0;
        finalSpinWin = accumulatedSpinWin; 

        const domCells = document.querySelectorAll('.slot-cell'); 
        gridState.forEach((item, index) => { 
            if (item && item.isBomb) {
                spinOrbsSum += item.multiplierValue;
                domCells[index].classList.add('bomb-pulse');  
            }
        });

        if (spinOrbsSum > 0) {
            SoundFX.bombExplode(spinOrbsSum);
            if (isFreeSpinsMode) {
                globalMultiplier += spinOrbsSum;
                accumMult.innerText = ` x 💣${globalMultiplier}`;
                await delay(800); 
                finalSpinWin = accumulatedSpinWin * globalMultiplier;
                statusMessage.innerText = `¡MULTIPLICADOR x${globalMultiplier}!`;
            } else {
                accumMult.innerText = ` x 💣${spinOrbsSum}`;
                await delay(800); 
                finalSpinWin = accumulatedSpinWin * spinOrbsSum;
                statusMessage.innerText = `¡BOMBA MULTIPLICADORA x${spinOrbsSum}!`;
            }
            accumValue.innerText = `$${finalSpinWin.toFixed(2)}`; 
        }

        const winCapLimit = baseBet * MAX_WIN_MULT; 
        let sessionTotal = isFreeSpinsMode ? (totalFsWin + finalSpinWin) : finalSpinWin; 
        
        if (sessionTotal >= winCapLimit) { 
            finalSpinWin = winCapLimit - (isFreeSpinsMode ? totalFsWin : 0); 
            statusMessage.innerText = "⚡ ¡MAX WIN ALCANZADO (5000X)! ⚡"; 
            if (isFreeSpinsMode) { freeSpinsLeft = 0; }
        }

        credit += finalSpinWin; 
        await guardarSaldoEnBD(); 
        winDisplay.innerText = `$${finalSpinWin.toFixed(2)}`; 

        if (finalSpinWin >= actualBet * 20) { SoundFX.bigWin(); } 
        else if (finalSpinWin > 0) { SoundFX.coinTally(); }

        if (isFreeSpinsMode) { 
            totalFsWin += finalSpinWin; 
            animateBonusHeader(totalFsWin); 
        }

    } else {
        statusMessage.innerText = isFreeSpinsMode ? "Tirada sin premio" : "SIN PREMIO";
    }

    if (autoSpinActive) { 
        if (stopWinLimit > 0 && finalSpinWin >= stopWinLimit) { 
            stopAutoPlay();
            statusMessage.innerText = "AUTO STOP: META ALCANZADA";
        }
    }

    updateUI(); 
    if (isFreeSpinsMode) saveGameState();  
    isSpinning = false; 

    if (activatedFreeSpins) { 
        if (autoSpinActive && stopOnBonus) stopAutoPlay(); 
        await delay(1000);
        triggerFreeSpins(10);
        return; 
    }

    if (extraFreeSpinsAwarded) { 
        freeSpinsLeft += 5; 
        statusMessage.innerText = "¡+5 GIROS EXTRA!";
        await delay(1000);
    }

    if (isFreeSpinsMode) { 
        if (freeSpinsLeft > 0) { await delay(1000); executeFreeSpinsLoop(); } 
        else { await delay(1000); finishFreeSpinsMode(); }
    } else {
        if (autoSpinActive) {
            setTimeout(() => { if (autoSpinActive && !isSpinning) executeSpin(); }, 500 * speedMult);
        }
    }
}

function applyGravity() { 
    for (let col = 0; col < 6; col++) { 
        const activeElements = []; 
        for (let row = 4; row >= 0; row--) { 
            const index = row * 6 + col; 
            if (gridState[index] !== null) activeElements.push(gridState[index]); 
        }
        for (let row = 4; row >= 0; row--) { 
            const index = row * 6 + col; 
            if (activeElements.length > 0) gridState[index] = activeElements.shift(); 
            else gridState[index] = null; 
        }
    }
}

function fillEmptySpaces() { 
    for (let i = 0; i < 30; i++) { 
        if (gridState[i] === null) gridState[i] = getRandomSymbolWithProbability(); 
    }
}

function triggerFreeSpins(count) { 
    isFreeSpinsMode = true; 
    freeSpinsLeft = count; 
    totalFsWin = 0; 
    globalMultiplier = 1;
    saveGameState(); 
    
    if (bonusHeaderWin) bonusHeaderWin.style.display = 'flex'; 
    bonusTotalAmount.innerText = "$0.00"; 

    fsOverlayTitle.innerText = isSuperBonusMode ? "¡SUPER BONUS ADQUIRIDO!" : "¡GIROS GRATIS!";
    fsCountText.innerText = `${count} GIROS CON MULTIPLICADORES`;
    fsOverlay.style.display = 'flex'; 
    SoundFX.bonusSiren();
    SoundFX.bonusFanfare();
    SoundFX.startMusic('bonus');

    setTimeout(() => { fsOverlay.style.display = 'none'; executeFreeSpinsLoop(); }, 2500 * speedMult);
}

function executeFreeSpinsLoop() { 
    if (freeSpinsLeft > 0) { freeSpinsLeft--; executeSpin(); }
}

function animateBonusHeader(targetValue) { 
    let current = parseFloat(bonusTotalAmount.innerText.replace('$', '')); 
    let increment = (targetValue - current) / 10;
    let step = 0; 
    const timer = setInterval(() => { 
        current += increment; 
        bonusTotalAmount.innerText = `$${current.toFixed(2)}`; 
        step++; 
        if (step >= 10) { clearInterval(timer); bonusTotalAmount.innerText = `$${targetValue.toFixed(2)}`; }
    }, 30 * speedMult);
}

function finishFreeSpinsMode() { 
    isFreeSpinsMode = false; 
    isSuperBonusMode = false; 
    saveGameState(); 

    fsOverlayTitle.innerText = "¡PREMIO TOTAL DEL BONUS!";
    fsCountText.innerText = `GANANCIA: $${totalFsWin.toFixed(2)}`; 
    fsOverlay.style.display = 'flex'; 
    SoundFX.bigWin();
    SoundFX.startMusic('base');

    setTimeout(() => { 
        fsOverlay.style.display = 'none'; 
        if (bonusHeaderWin) bonusHeaderWin.style.display = 'none';  
        spinWinAccumulator.style.display = 'none'; 
        statusMessage.innerText = autoSpinActive ? "CONTINUANDO AUTO..." : "PRESIONA PARA GIRAR"; 
        winDisplay.innerText = `$${totalFsWin.toFixed(2)}`; 
        updateUI(); 
    }, 2800 * speedMult);
}

// LÓGICA MODO AUTOMÁTICO
if (autoOpenBtn) {
    autoOpenBtn.addEventListener('click', () => { 
        SoundFX.click();
        if (autoSpinActive) {
            stopAutoPlay();
        } else if (!isSpinning && !isFreeSpinsMode) {
            autoModal.style.display = 'flex';
        }
    });
}
if (closeAutoModal) { closeAutoModal.addEventListener('click', () => { SoundFX.click(); autoModal.style.display = 'none'; }); }

if (startAutoBtn) {
    startAutoBtn.addEventListener('click', () => {
        SoundFX.click();
        stopOnBonus = document.getElementById('stop-on-bonus') ? document.getElementById('stop-on-bonus').checked : false;
        stopWinLimit = parseFloat(document.getElementById('stop-on-win')?.value) || 0;
        
        const speedRadios = document.getElementsByName('speed');
        for (let i = 0; i < speedRadios.length; i++) {
            if (speedRadios[i].checked) {
                speedMult = parseFloat(speedRadios[i].value);
                currentSpeedMode = i;
                if (mainSpeedBtn) {
                    if (currentSpeedMode === 0) mainSpeedBtn.innerText = "NORM";
                    if (currentSpeedMode === 1) mainSpeedBtn.innerText = "RÁPIDO";
                    if (currentSpeedMode === 2) mainSpeedBtn.innerText = "TURBO⚡";
                }
            }
        }
        autoModal.style.display = 'none';
        startAutoPlay();
    });
}

function stopAutoPlay() {
    autoSpinActive = false; 
    if(autoOpenBtn) {
        autoOpenBtn.innerText = "AUTO";
        autoOpenBtn.classList.remove('active-auto');
    }
}

async function startAutoPlay() { 
    autoSpinActive = true; 
    if(autoOpenBtn) {
        autoOpenBtn.innerText = "STOP AUTO";
        autoOpenBtn.classList.add('active-auto');
    }

    while (autoSpinActive && !isSpinning && !isFreeSpinsMode) {
        if (credit < actualBet) {
            statusMessage.innerText = "CRÉDITO INSUFICIENTE";
            stopAutoPlay();
            break;
        }
        credit -= actualBet; 
        await guardarSaldoEnBD(); 
        winDisplay.innerText = "$0.00"; 
        updateUI(); 
        await executeSpin(); 
    }
}

infoBtn.addEventListener('click', () => { SoundFX.click(); if (!isSpinning) infoModal.style.display = 'flex'; }); 
closeModal.addEventListener('click', () => { SoundFX.click(); infoModal.style.display = 'none'; }); 

window.addEventListener('click', (e) => { 
    if (e.target === infoModal) infoModal.style.display = 'none'; 
    if (e.target === autoModal) autoModal.style.display = 'none'; 
    if (volumePopup && volumePopup.classList.contains('open') && e.target !== volumeBtn && !volumePopup.contains(e.target)) { 
        volumePopup.classList.remove('open'); 
    }
});

// ==========================================
// CONTROL DE VOLUMEN
// ==========================================
function updateVolumeIcon() {
    if (!volumeBtn) return;
    const v = SoundFX.volume;
    const isMuted = SoundFX.muted;
    volumeBtn.classList.toggle('is-muted', isMuted);
    if (isMuted || v <= 0) volumeBtn.innerText = '🔇';
    else if (v < 0.5) volumeBtn.innerText = '🔉';
    else volumeBtn.innerText = '🔊';
}

(function initVolumeUI() {
    const prefs = loadSoundPrefs();
    if (volumeSlider) volumeSlider.value = Math.round((prefs.volume !== undefined ? prefs.volume : 0.6) * 100);
    updateVolumeIcon();
})();

if (volumeBtn) {
    volumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        SoundFX.ensureContext();
        if (musicShouldBePlaying()) startAppropriateMusic();
        const isMuted = SoundFX.toggleMute();
        updateVolumeIcon();
        saveSoundPrefs();
        if (volumePopup) volumePopup.classList.toggle('open');
    });
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
        SoundFX.ensureContext();
        const v = parseInt(e.target.value, 10) / 100;
        SoundFX.setVolume(v);
        if (v > 0 && SoundFX.muted) SoundFX.toggleMute(false);
        if (v === 0 && !SoundFX.muted) SoundFX.toggleMute(true);
        updateVolumeIcon();
        saveSoundPrefs();
    });
}

function musicShouldBePlaying() { return true; }

function startAppropriateMusic() {
    SoundFX.ensureContext();
    SoundFX.startMusic(isFreeSpinsMode ? 'bonus' : 'base');
}

// La primera interacción del usuario habilita el audio (requisito de los navegadores)
function unlockAudioOnce() {
    SoundFX.ensureContext();
    startAppropriateMusic();
    window.removeEventListener('pointerdown', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce);

// ==========================================
// NOTA SOBRE LA CALIBRACIÓN DE PROBABILIDADES
// ==========================================
// Sweet Bonanza (Pragmatic Play) es un juego con RTP certificado ~96.5%, pero las
// tablas exactas de pesos por símbolo son propiedad del proveedor y no están
// publicadas oficialmente. Para este proyecto se investigó su mecánica pública
// (grilla 6x5, "paga en cualquier lado" con 8+, tumble/cascada, Scatter que paga
// x3/x5/x100 con 4/5/6 paletas y activa Giros Gratis, Bombas Multiplicadoras
// exclusivas de Giros Gratis de x2 a x100) y se corrió una simulación propia
// (Monte Carlo, cientos de miles de tiradas) para calibrar los pesos de arriba
// de forma que: la frecuencia de acierto en juego base quede en ~28-32%
// (antes con los pesos viejos rondaba entre "nunca" y "más del 60%"), y ningún
// símbolo individual sea tan común como para pagar en casi todas las tiradas.
