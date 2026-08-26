// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = 'https://wgqqbahoalozgfukioza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncXFiYWhvYWxvemdmdWtpb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTA3OTYsImV4cCI6MjA5OTgyNjc5Nn0.v_kpYceS8ceIUBNaLLHjfyBeFA2Y3lDRy7Yn6cb5Uz8';
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

let currentUser = null;

// ==========================================
// 2. SÍMBOLOS, PAYTABLE Y LÍNEAS DE PAGO
// ==========================================
// Réplica de la estructura de Big Bass Bonanza (Pragmatic Play):
// grilla 5x3, 10 líneas de pago fijas, símbolo Pescador = Wild que además
// "pesca" (cobra) todos los símbolos de dinero visibles en pantalla, Scatter
// que activa Giros Gratis, y símbolos de dinero que solo caen en los rodillos
// 2 a 5. Los valores están calibrados a mano (ver nota al final) para que el
// juego pague con una frecuencia parecida a la del original, sin ser
// "imposible" ni "regalado".
const REELS = 5;
const ROWS = 3;

const WILD_KEY = 'pescador';
const SCATTER_KEY = 'scatter';
const MONEY_KEY = 'money';

const symbols = [
    { key: '10',            img: '10.png' },
    { key: 'J',              img: 'J.png' },
    { key: 'Q',              img: 'Q.png' },
    { key: 'K',              img: 'K.png' },
    { key: 'A',              img: 'A.png' },
    { key: 'pezchuiquito',   img: 'pezchuiquito.png' },
    { key: 'pezmediano',     img: 'pezmediano.png' },
    { key: 'pez1',           img: 'pez1.png' },
    { key: 'pez2',           img: 'pez2.png' },
    { key: 'pez3',           img: 'pez3.png' },
    { key: 'pez_enorme',     img: 'pez_enorme.png' },
    { key: WILD_KEY,         img: 'pescador.png' }
];
const symbolByKey = {};
symbols.forEach(s => symbolByKey[s.key] = s);

// Multiplicador sobre la APUESTA BASE, por cantidad consecutiva desde el rodillo 1
const PAYTABLE = {
    '10':          { 3: 0.10, 4: 0.25, 5: 0.50 },
    'J':           { 3: 0.10, 4: 0.25, 5: 0.50 },
    'Q':           { 3: 0.15, 4: 0.40, 5: 0.75 },
    'K':           { 3: 0.15, 4: 0.40, 5: 0.75 },
    'A':           { 3: 0.20, 4: 0.50, 5: 1.00 },
    'pezchuiquito':{ 3: 0.25, 4: 0.60, 5: 1.25 },
    'pezmediano':  { 3: 0.30, 4: 0.75, 5: 1.50 },
    'pez1':        { 3: 0.40, 4: 1.00, 5: 2.50 },
    'pez2':        { 3: 0.50, 4: 1.50, 5: 3.00 },
    'pez3':        { 3: 0.75, 4: 2.00, 5: 5.00 },
    'pez_enorme':  { 3: 1.00, 4: 3.00, 5: 10.00 },
    [WILD_KEY]:    { 3: 2.00, 4: 5.00, 5: 25.00 },
    [SCATTER_KEY]: { 3: 2.00, 4: 5.00, 5: 25.00 }
};

// 10 líneas de pago fijas (fila por rodillo, 0=arriba, 1=medio, 2=abajo)
const PAYLINES = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 0, 1, 0, 0],
    [2, 2, 1, 2, 2],
    [1, 2, 1, 0, 1]
];

// Pesos base por símbolo (juego base). Los símbolos de pago bajo (cartas)
// son mucho más comunes que los peces grandes, y el Wild/Scatter son escasos.
const baseWeights = {
    '10': 34, 'J': 32, 'Q': 26, 'K': 24, 'A': 18,
    'pezchuiquito': 16, 'pezmediano': 13, 'pez1': 10, 'pez2': 7, 'pez3': 4, 'pez_enorme': 2,
    [WILD_KEY]: 4,
    [SCATTER_KEY]: 3
};

// Probabilidad de que una celda de un rodillo "con plata" (2 a 5) sea un
// símbolo de dinero en vez de un símbolo normal.
const MONEY_CHANCE_BASE = 0.13;
const MONEY_CHANCE_FS = 0.19;
const MONEY_CHANCE_SUPER = 0.24;

// Valores de dinero (multiplicador de la apuesta base) — juego base
const moneyWeightsBase = [
    { val: 0.5, w: 30 }, { val: 1, w: 25 }, { val: 1.5, w: 18 }, { val: 2, w: 15 },
    { val: 3, w: 10 }, { val: 5, w: 8 }, { val: 10, w: 5 }, { val: 15, w: 3 },
    { val: 25, w: 2 }, { val: 50, w: 1 }, { val: 100, w: 0.4 }
];
// Valores de dinero — Giros Gratis / Super Pesca (más generosos)
const moneyWeightsFS = [
    { val: 1, w: 20 }, { val: 2, w: 18 }, { val: 3, w: 15 }, { val: 5, w: 12 },
    { val: 10, w: 10 }, { val: 15, w: 8 }, { val: 25, w: 6 }, { val: 50, w: 4 },
    { val: 100, w: 2 }, { val: 250, w: 0.8 }
];

// En Big Bass Splash el símbolo de dinero no es un ícono aparte: son los
// propios peces los que "traen plata" (toman un valor de apuesta al azar).
// Por eso el ícono de dinero se elige entre los mismos peces de la tabla de
// pagos, reservando la Caja del tesoro para los valores más altos como un
// "premio mayor" visualmente distinto, y la Caña para los valores chicos.
const MONEY_FISH_IMGS = ['pez1.png', 'pez2.png', 'pez3.png', 'pezmediano.png', 'pezchuiquito.png', 'pez_enorme.png'];
function moneyIcon(val) {
    if (val >= 50) return 'CAJA.png';
    if (val <= 1) return 'CAÑA.png';
    return MONEY_FISH_IMGS[Math.floor(Math.random() * MONEY_FISH_IMGS.length)];
}

let credit = 10000;
let baseBet = 2.00;
let actualBet = 2.00;
let doubleChance = false;
let isSpinning = false;
const MAX_WIN_MULT = 5000;

// ==========================================
// MEDIDOR DE PESCADORES (bono cooperativo estilo Big Bass Splash)
// ==========================================
// Durante los Giros Gratis, cada Pescador (Wild) que cae en pantalla se suma
// a un medidor acumulado (0 a 4). Al llegar a 4, sube de nivel: otorga +10
// Giros Gratis extra y un multiplicador permanente que se aplica a toda
// "pesca" de dinero de ahí en adelante, hasta el nivel máximo (4).
const WILD_METER_TARGET = 4;
const MAX_WILD_LEVEL = 4;
const WILD_LEVEL_MULT = { 1: 1, 2: 2, 3: 3, 4: 10 };
let wildMeterCount = 0;
let wildMeterLevel = 1;

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

let gridState = []; // índice = reel * ROWS + row

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
const wildMeterEl = document.getElementById('wild-meter');
const wildMeterDotsEl = document.getElementById('wild-meter-dots');
const wildMeterLevelEl = document.getElementById('wild-meter-level');
const spinWinAccumulator = document.getElementById('spin-win-accumulator');
const accumValue = document.getElementById('accum-value');
const accumMult = document.getElementById('accum-mult');
const infoBtn = document.getElementById('info-btn');
const infoModal = document.getElementById('info-modal');
const closeModal = document.getElementById('close-modal');

const mainSpeedBtn = document.getElementById('main-speed-btn');
const autoOpenBtn = document.getElementById('auto-open-btn');
const autoModal = document.getElementById('auto-modal');
const closeAutoModal = document.getElementById('close-auto-modal');
const startAutoBtn = document.getElementById('start-auto-btn');
const dragonflyLayer = document.getElementById('dragonfly-layer');

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

    statusMessage.innerText = "¡LISTO PARA PESCAR!";
    if (!loadBonusState()) { initGrid(); }
}

async function guardarSaldoEnBD() {
    if (!currentUser || !supabaseClient) return;
    await supabaseClient.from('perfiles').upsert({ id: currentUser.id, saldo: credit });
}

function saveGameState() {
    if (isFreeSpinsMode) {
        const state = { isSuperBonusMode, freeSpinsLeft, totalFsWin, baseBet, actualBet, doubleChance, wildMeterCount, wildMeterLevel };
        localStorage.setItem('victoryBassBonusState', JSON.stringify(state));
    } else {
        localStorage.removeItem('victoryBassBonusState');
    }
}

function loadBonusState() {
    const saved = localStorage.getItem('victoryBassBonusState');
    if (saved) {
        const state = JSON.parse(saved);
        isFreeSpinsMode = true;
        isSuperBonusMode = state.isSuperBonusMode;
        freeSpinsLeft = state.freeSpinsLeft;
        totalFsWin = state.totalFsWin;
        baseBet = state.baseBet;
        actualBet = state.actualBet;
        wildMeterCount = state.wildMeterCount || 0;
        wildMeterLevel = state.wildMeterLevel || 1;

        if (state.doubleChance !== undefined) {
            doubleChance = state.doubleChance;
            doubleChanceToggle.checked = doubleChance;
        }
        calculateActualBet();

        if (bonusHeaderWin) bonusHeaderWin.style.display = 'flex';
        bonusTotalAmount.innerText = `$${totalFsWin.toFixed(2)}`;
        if (wildMeterEl) wildMeterEl.style.display = 'flex';
        updateWildMeterUI();
        updateUI();
        initGrid();

        statusMessage.innerText = "🎣 RECUPERANDO GIROS GRATIS 🎣";
        setTimeout(() => { executeFreeSpinsLoop(); }, 2000);
        return true;
    }
    return false;
}

function getCell(reel, row) { return gridState[reel * ROWS + row]; }
function setCell(reel, row, val) { gridState[reel * ROWS + row] = val; }

function initGrid() {
    gridState = [];
    for (let r = 0; r < REELS; r++) {
        for (let row = 0; row < ROWS; row++) {
            gridState.push(getRandomCell(r));
        }
    }
    renderGridDOM();
    updateUI();
}

// Construye una celda de símbolo. reel/row se usan como dataset para poder
// ubicarla luego con querySelector; "filler" marca las celdas decorativas
// que solo se ven durante el giro (no forman parte del resultado real).
function buildCellEl(reel, row, item, filler) {
    const cell = document.createElement('div');
    cell.classList.add('slot-cell');
    if (!filler) cell.classList.add('landing');
    else cell.classList.add('filler-cell');
    cell.dataset.reel = reel;
    cell.dataset.row = row;

    if (item) {
        const img = document.createElement('img');
        img.classList.add('symbol-img');
        img.src = item.img;
        img.alt = item.key;
        cell.appendChild(img);

        if (item.key === MONEY_KEY) {
            cell.classList.add('money-cell');
            const badge = document.createElement('span');
            badge.classList.add('money-badge');
            badge.innerText = `x${item.value}`;
            cell.appendChild(badge);
        }
        if (item.key === WILD_KEY) cell.classList.add('wild-cell');
        if (item.key === SCATTER_KEY) cell.classList.add('scatter-cell');
    }
    return cell;
}

// Renderiza la grilla en carretes verticales (reel-col > reel-strip > slot-cell).
// El orden de aparición en el DOM queda reel por reel (columna por columna),
// exactamente igual al índice reel*ROWS+row usado por gridState, para que
// los resaltados de ganancia siempre apunten a la celda correcta.
function renderGridDOM() {
    gridContainer.innerHTML = '';
    for (let reel = 0; reel < REELS; reel++) {
        const reelCol = document.createElement('div');
        reelCol.classList.add('reel-col');
        reelCol.dataset.reel = reel;

        const strip = document.createElement('div');
        strip.classList.add('reel-strip');

        for (let row = 0; row < ROWS; row++) {
            strip.appendChild(buildCellEl(reel, row, getCell(reel, row), false));
        }

        reelCol.appendChild(strip);
        gridContainer.appendChild(reelCol);
    }
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
    calculateActualBet();
});

// CONTROL DE VELOCIDAD
if (mainSpeedBtn) {
    mainSpeedBtn.addEventListener('click', () => {
        currentSpeedMode = (currentSpeedMode + 1) % 3;
        const speedRadios = document.getElementsByName('speed');

        if (currentSpeedMode === 0) { speedMult = 1; mainSpeedBtn.innerText = "NORM"; if (speedRadios[0]) speedRadios[0].checked = true; }
        if (currentSpeedMode === 1) { speedMult = 0.4; mainSpeedBtn.innerText = "RÁPIDO"; if (speedRadios[1]) speedRadios[1].checked = true; }
        if (currentSpeedMode === 2) { speedMult = 0.1; mainSpeedBtn.innerText = "TURBO⚡"; if (speedRadios[2]) speedRadios[2].checked = true; }
    });
}

btnBuyFree.addEventListener('click', async () => {
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return;
    const cost = baseBet * 100;
    if (credit >= cost) {
        credit -= cost; await guardarSaldoEnBD(); updateUI();
        isSuperBonusMode = false; triggerFreeSpins(10);
    } else { statusMessage.innerText = "CRÉDITO INSUFICIENTE"; }
});

btnBuySuper.addEventListener('click', async () => {
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return;
    const cost = baseBet * 500;
    if (credit >= cost) {
        credit -= cost; await guardarSaldoEnBD(); updateUI();
        isSuperBonusMode = true; triggerFreeSpins(10);
    } else { statusMessage.innerText = "CRÉDITO INSUFICIENTE"; }
});

spinBtn.addEventListener('click', async () => {
    if (isSpinning || isFreeSpinsMode || autoSpinActive) return;
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

// ==========================================
// GENERACIÓN DE SÍMBOLOS
// ==========================================
function getRandomCell(reelIndex) {
    const moneyChance = isFreeSpinsMode ? (isSuperBonusMode ? MONEY_CHANCE_SUPER : MONEY_CHANCE_FS) : MONEY_CHANCE_BASE;

    // Los símbolos de dinero solo aparecen en los rodillos 2 a 5 (índice 1 a 4)
    if (reelIndex > 0 && Math.random() < moneyChance) {
        const table = isFreeSpinsMode ? moneyWeightsFS : moneyWeightsBase;
        const val = getRandomWeightedValue(table);
        return { key: MONEY_KEY, img: moneyIcon(val), value: val };
    }

    let weights = { ...baseWeights };
    if (isFreeSpinsMode) {
        // En Giros Gratis los peces grandes y el Wild son más frecuentes
        weights['pez1'] = 13; weights['pez2'] = 10; weights['pez3'] = 7; weights['pez_enorme'] = 4;
        weights[WILD_KEY] = isSuperBonusMode ? 8 : 6;
    }

    let totalWeight = 0;
    for (let key in weights) totalWeight += weights[key];

    let randomNum = Math.random() * totalWeight;
    let selectedKey = '10';
    for (let key in weights) {
        if (randomNum < weights[key]) { selectedKey = key; break; }
        randomNum -= weights[key];
    }

    if (selectedKey === SCATTER_KEY) return { key: SCATTER_KEY, img: 'scatter.png' };
    if (selectedKey === WILD_KEY) return { key: WILD_KEY, img: 'pescador.png' };

    return { ...symbolByKey[selectedKey] };
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

function generateNewGrid() {
    gridState = [];
    for (let r = 0; r < REELS; r++) {
        for (let row = 0; row < ROWS; row++) gridState.push(getRandomCell(r));
    }
}

// ==========================================
// FUNCIÓN LIBÉLULA (feature random)
// ==========================================
async function maybeTriggerDragonfly() {
    const chance = isFreeSpinsMode ? 0.25 : 0.14;
    if (Math.random() >= chance) return false;

    // Elige entre 1 y 3 celdas de los rodillos 2-5 que no sean ya dinero/scatter
    const candidates = [];
    for (let r = 1; r < REELS; r++) {
        for (let row = 0; row < ROWS; row++) {
            const idx = r * ROWS + row;
            const item = gridState[idx];
            if (item && item.key !== MONEY_KEY && item.key !== SCATTER_KEY) candidates.push(idx);
        }
    }
    if (candidates.length === 0) return false;

    const count = Math.min(candidates.length, 1 + Math.floor(Math.random() * 3));
    candidates.sort(() => Math.random() - 0.5);
    const chosen = candidates.slice(0, count);

    statusMessage.innerText = "🐉 ¡LA LIBÉLULA SOBREVUELA EL AGUA!";
    if (dragonflyLayer) {
        dragonflyLayer.classList.add('flying');
        await delay(700);
    }

    const table = isFreeSpinsMode ? moneyWeightsFS : moneyWeightsBase;
    chosen.forEach(idx => {
        const val = getRandomWeightedValue(table);
        gridState[idx] = { key: MONEY_KEY, img: moneyIcon(val), value: val };
    });

    renderGridDOM();
    if (dragonflyLayer) dragonflyLayer.classList.remove('flying');
    await delay(400);
    return true;
}

// ==========================================
// GIRO PRINCIPAL
// ==========================================
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

// Determina desde qué rodillo (índice) debe activarse la "anticipación":
// si ya cayeron 2 Scatters en los primeros rodillos, los restantes se
// bloquean visualmente (glow) y tiran con más tensión hasta revelar si
// llega o no el 3er Scatter que activa el bono — igual que en Big Bass Splash.
function computeAnticipationStartReel() {
    if (isFreeSpinsMode) return -1;
    const scatterReels = new Set();
    for (let idx = 0; idx < gridState.length; idx++) {
        if (gridState[idx] && gridState[idx].key === SCATTER_KEY) {
            scatterReels.add(Math.floor(idx / ROWS));
        }
    }
    if (scatterReels.size >= 2) {
        const sorted = [...scatterReels].sort((a, b) => a - b);
        return sorted[1] + 1; // el rodillo siguiente al 2º scatter entra en anticipación
    }
    return -1;
}

// Animación real de carretes: arma una tira con símbolos "de relleno" arriba
// de cada rodillo y la desliza verticalmente hasta encajar en el resultado
// final (gridState), con revelado escalonado rodillo por rodillo y frenada
// más lenta/tensa cuando hay anticipación de bonus.
async function animateReelsSpin() {
    const FILLER = 10;
    const anticipationStart = computeAnticipationStartReel();

    gridContainer.innerHTML = '';
    const reels = [];
    for (let reel = 0; reel < REELS; reel++) {
        const reelCol = document.createElement('div');
        reelCol.classList.add('reel-col');
        reelCol.dataset.reel = reel;

        const strip = document.createElement('div');
        strip.classList.add('reel-strip', 'spinning-strip');

        for (let f = 0; f < FILLER; f++) {
            strip.appendChild(buildCellEl(reel, -1, getRandomCell(reel), true));
        }
        for (let row = 0; row < ROWS; row++) {
            strip.appendChild(buildCellEl(reel, row, getCell(reel, row), false));
        }

        reelCol.appendChild(strip);
        gridContainer.appendChild(reelCol);
        reels.push({ reelCol, strip });
    }

    await nextFrame();
    // Medimos la altura REAL de una celda ya renderizada (en vez de dividir
    // la altura del contenedor por ROWS): así el desplazamiento siempre
    // encaja exacto con los símbolos, sin importar redondeos de CSS, y se
    // evita el "salto"/desajuste que se veía al asentar el carrete.
    const sampleCell = reels[0].strip.querySelector('.slot-cell');
    const cellH = sampleCell.getBoundingClientRect().height;
    const finalTranslate = -(FILLER) * cellH;

    reels.forEach(({ strip }) => {
        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0px)';
    });
    await nextFrame();

    // Todos los timeouts/duraciones se expresan en "ms base" (sin aplicar
    // speedMult manualmente): tanto los setTimeout de abajo como delay()
    // multiplican por speedMult, así que se mantiene todo consistente.
    reels.forEach(({ reelCol, strip }, i) => {
        const inAnticipation = anticipationStart >= 0 && i >= anticipationStart;
        const baseDur = inAnticipation ? 950 : 520;
        const dur = (baseDur + i * 70) * speedMult;
        const startDelay = i * 110 * speedMult;
        strip.style.transition = `transform ${dur}ms cubic-bezier(0.13,0.85,0.3,1)`;
        setTimeout(() => { strip.style.transform = `translateY(${finalTranslate}px)`; }, startDelay);
        if (inAnticipation) {
            setTimeout(() => reelCol.classList.add('anticipation-col'), startDelay);
        }
    });

    if (anticipationStart >= 0) {
        statusMessage.innerText = "🐟 ¡ANTICIPACIÓN DE SCATTER!";
    }

    const lastReelIsAnticipating = anticipationStart >= 0 && (REELS - 1) >= anticipationStart;
    const lastDur = (lastReelIsAnticipating ? 950 : 520) + (REELS - 1) * 70;
    const totalWaitBase = (REELS - 1) * 110 + lastDur + 120;
    await delay(totalWaitBase);

    reels.forEach(({ reelCol, strip }) => {
        strip.querySelectorAll('.filler-cell').forEach(c => c.remove());
        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0px)';
        reelCol.classList.remove('anticipation-col');
        // Rebote de asentado real (recién visible), no oculto durante el scroll
        strip.querySelectorAll('.slot-cell').forEach(cell => {
            cell.classList.remove('landing');
            void cell.offsetWidth; // fuerza reflow para reiniciar la animación
            cell.classList.add('landing');
        });
    });

    // Marca visualmente los Scatters ya "bloqueados" que dispararon la anticipación
    if (anticipationStart >= 0) {
        gridState.forEach((item, idx) => {
            if (item && item.key === SCATTER_KEY && Math.floor(idx / ROWS) < anticipationStart) {
                const el = document.querySelector(`.slot-cell[data-reel="${Math.floor(idx / ROWS)}"][data-row="${idx % ROWS}"]`);
                if (el) el.classList.add('scatter-locked');
            }
        });
        await delay(400 * speedMult);
    }
}

async function executeSpin() {
    isSpinning = true;
    spinBtn.disabled = true;
    statusMessage.innerText = isFreeSpinsMode ? `GIROS RESTANTES: ${freeSpinsLeft}` : (speedMult < 1 ? "GIRO RÁPIDO/TURBO" : "¡TIRANDO LA LÍNEA!");
    spinWinAccumulator.style.display = 'none';
    accumValue.innerText = "$0.00";
    accumMult.innerText = "";

    if (isFreeSpinsMode) saveGameState();

    generateNewGrid();
    await animateReelsSpin();

    await maybeTriggerDragonfly();
    await resolveSpin();
}

// ==========================================
// RESOLUCIÓN: LÍNEAS DE PAGO + SCATTER + PESCA DEL WILD
// ==========================================
function evaluatePaylines() {
    let total = 0;
    const winningCells = new Set();

    PAYLINES.forEach(line => {
        const lineSymbols = line.map((row, reel) => getCell(reel, row));

        // Determina el símbolo objetivo (el primero que no sea Wild)
        let target = null;
        for (const sym of lineSymbols) {
            if (!sym) { target = null; break; }
            if (sym.key === WILD_KEY) continue;
            target = sym.key;
            break;
        }
        if (target === null) {
            // toda la línea podría ser Wild
            if (lineSymbols.every(s => s && s.key === WILD_KEY)) target = WILD_KEY;
            else return;
        }
        if (target === MONEY_KEY || target === SCATTER_KEY) return;
        if (!PAYTABLE[target]) return;

        let count = 0;
        const idxs = [];
        for (let reel = 0; reel < REELS; reel++) {
            const sym = lineSymbols[reel];
            if (sym && (sym.key === target || sym.key === WILD_KEY)) {
                count++;
                idxs.push(reel * ROWS + line[reel]);
            } else break;
        }

        if (count >= 3) {
            const clamped = Math.min(count, 5);
            const factor = PAYTABLE[target][clamped] || 0;
            if (factor > 0) {
                total += factor * baseBet;
                idxs.forEach(i => winningCells.add(i));
            }
        }
    });

    return { total, winningCells };
}

function evaluateScatter() {
    let count = 0;
    const idxs = [];
    gridState.forEach((item, idx) => {
        if (item && item.key === SCATTER_KEY) { count++; idxs.push(idx); }
    });
    if (count >= 3) {
        const clamped = Math.min(count, 5);
        const factor = PAYTABLE[SCATTER_KEY][clamped] || 0;
        return { count, win: factor * baseBet, idxs };
    }
    return { count, win: 0, idxs };
}

function evaluateWildCatch() {
    // Todos los símbolos de dinero visibles se "pescan" si hay al menos un Wild en pantalla
    let wildCount = 0;
    let moneySum = 0;
    const wildIdxs = [];
    const moneyIdxs = [];

    gridState.forEach((item, idx) => {
        if (item && item.key === WILD_KEY) { wildCount++; wildIdxs.push(idx); }
        if (item && item.key === MONEY_KEY) { moneySum += item.value; moneyIdxs.push(idx); }
    });

    if (wildCount === 0 || moneyIdxs.length === 0) return { win: 0, wildCount, moneyIdxs: [], wildIdxs: [] };

    // Cuantos más pescadores en pantalla, mejor la pesca
    const catchMultiplier = wildCount;
    const win = moneySum * baseBet * catchMultiplier;
    return { win, wildCount, moneyIdxs, wildIdxs, catchMultiplier };
}

async function resolveSpin() {
    const domCells = document.querySelectorAll('.slot-cell');
    let spinWin = 0;
    let activatedFreeSpins = false;
    let extraFreeSpinsAwarded = false;

    // 1) Líneas de pago normales
    const { total: lineWin, winningCells } = evaluatePaylines();
    if (lineWin > 0) {
        winningCells.forEach(idx => domCells[idx] && domCells[idx].classList.add('win-highlight'));
        spinWin += lineWin;
        spinWinAccumulator.style.display = 'flex';
        accumValue.innerText = `$${spinWin.toFixed(2)}`;
        statusMessage.innerText = "¡LÍNEA GANADORA!";
        await delay(650);
    }

    // 2) Pesca del Wild (cobra símbolos de dinero visibles), con el
    //    multiplicador de nivel del medidor de pescadores si estamos en bono
    const catchResult = evaluateWildCatch();
    const levelMult = (isFreeSpinsMode && wildMeterLevel > 1) ? WILD_LEVEL_MULT[wildMeterLevel] : 1;
    const finalCatchWin = catchResult.win * levelMult;
    if (finalCatchWin > 0) {
        catchResult.moneyIdxs.forEach(idx => domCells[idx] && domCells[idx].classList.add('money-highlight'));
        catchResult.wildIdxs.forEach(idx => domCells[idx] && domCells[idx].classList.add('wild-highlight'));
        statusMessage.innerText = levelMult > 1
            ? `🎣 ¡EL PESCADOR ATRAPA TODO! x${catchResult.catchMultiplier} · NIVEL x${levelMult}`
            : `🎣 ¡EL PESCADOR ATRAPA TODO! x${catchResult.catchMultiplier}`;
        await delay(300);
        spinWin += finalCatchWin;
        spinWinAccumulator.style.display = 'flex';
        accumValue.innerText = `$${spinWin.toFixed(2)}`;
        let multText = catchResult.wildCount > 1 ? ` x🎣${catchResult.catchMultiplier}` : '';
        if (levelMult > 1) multText += ` x🌊${levelMult}`;
        accumMult.innerText = multText;
        await delay(750);
    }

    // 2b) Acumulación en el medidor de pescadores (solo durante Giros Gratis):
    //     cada Pescador visible suma al medidor; al llegar a 4 sube de nivel,
    //     otorga +10 Giros Gratis y aumenta el multiplicador permanente.
    let wildMeterLevelUp = false;
    if (isFreeSpinsMode && catchResult.wildCount > 0) {
        wildMeterCount += catchResult.wildCount;
        while (wildMeterCount >= WILD_METER_TARGET && wildMeterLevel < MAX_WILD_LEVEL) {
            wildMeterCount -= WILD_METER_TARGET;
            wildMeterLevel++;
            wildMeterLevelUp = true;
        }
        if (wildMeterLevel >= MAX_WILD_LEVEL) wildMeterCount = 0;
        updateWildMeterUI();
    }

    // 3) Scatter (pago propio + activación de Giros Gratis)
    const scatterResult = evaluateScatter();
    if (scatterResult.count >= 3) {
        scatterResult.idxs.forEach(idx => domCells[idx] && domCells[idx].classList.add('scatter-highlight'));
        spinWin += scatterResult.win;
        spinWinAccumulator.style.display = 'flex';
        accumValue.innerText = `$${spinWin.toFixed(2)}`;
        if (!isFreeSpinsMode) {
            activatedFreeSpins = true;
            if (autoSpinActive && stopOnBonus) stopAutoPlay();
        } else {
            extraFreeSpinsAwarded = true;
        }
        statusMessage.innerText = "🐟 ¡VICTORY BASS SCATTER!";
        await delay(700);
    }

    let finalSpinWin = spinWin;

    if (finalSpinWin > 0) {
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
        accumValue.innerText = `$${finalSpinWin.toFixed(2)}`;

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
    spinBtn.disabled = false;

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

    if (wildMeterLevelUp) {
        freeSpinsLeft += 10;
        if (wildMeterEl) {
            wildMeterEl.classList.remove('level-up-flash');
            void wildMeterEl.offsetWidth;
            wildMeterEl.classList.add('level-up-flash');
        }
        statusMessage.innerText = wildMeterLevel >= MAX_WILD_LEVEL
            ? `🌊 ¡NIVEL MÁXIMO! MULTIPLICADOR x${WILD_LEVEL_MULT[wildMeterLevel]} · +10 GIROS`
            : `🌊 ¡NIVEL ${wildMeterLevel}! MULTIPLICADOR x${WILD_LEVEL_MULT[wildMeterLevel]} · +10 GIROS`;
        saveGameState();
        await delay(1300);
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

function triggerFreeSpins(count) {
    isFreeSpinsMode = true;
    freeSpinsLeft = count;
    totalFsWin = 0;
    resetWildMeter();
    saveGameState();

    if (bonusHeaderWin) bonusHeaderWin.style.display = 'flex';
    bonusTotalAmount.innerText = "$0.00";
    if (wildMeterEl) wildMeterEl.style.display = 'flex';

    fsOverlayTitle.innerText = isSuperBonusMode ? "¡SÚPER PESCA ADQUIRIDA!" : "¡GIROS GRATIS!";
    fsCountText.innerText = `${count} GIROS · MÁS PESCADOS Y DINERO EN PANTALLA`;
    fsOverlay.style.display = 'flex';

    setTimeout(() => { fsOverlay.style.display = 'none'; executeFreeSpinsLoop(); }, 2200 * speedMult);
}

function executeFreeSpinsLoop() {
    if (freeSpinsLeft > 0) { freeSpinsLeft--; executeSpin(); }
}

function updateWildMeterUI() {
    if (!wildMeterEl) return;
    const dots = wildMeterDotsEl.querySelectorAll('.wm-dot');
    dots.forEach((dot, i) => dot.classList.toggle('filled', i < wildMeterCount));

    const atMax = wildMeterLevel >= MAX_WILD_LEVEL;
    wildMeterEl.classList.toggle('level-max', atMax);
    wildMeterLevelEl.innerText = atMax
        ? `NIVEL MÁXIMO · MULTIPLICADOR x${WILD_LEVEL_MULT[wildMeterLevel]}`
        : `NIVEL ${wildMeterLevel} · MULTIPLICADOR x${WILD_LEVEL_MULT[wildMeterLevel]}`;
    wildMeterDotsEl.style.display = atMax ? 'none' : 'flex';
}

function resetWildMeter() {
    wildMeterCount = 0;
    wildMeterLevel = 1;
    updateWildMeterUI();
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

    fsOverlayTitle.innerText = "¡PREMIO TOTAL DE LA PESCA!";
    fsCountText.innerText = `GANANCIA: $${totalFsWin.toFixed(2)}`;
    fsOverlay.style.display = 'flex';

    setTimeout(() => {
        fsOverlay.style.display = 'none';
        if (bonusHeaderWin) bonusHeaderWin.style.display = 'none';
        if (wildMeterEl) wildMeterEl.style.display = 'none';
        spinWinAccumulator.style.display = 'none';
        statusMessage.innerText = autoSpinActive ? "CONTINUANDO AUTO..." : "PRESIONA PARA GIRAR";
        winDisplay.innerText = `$${totalFsWin.toFixed(2)}`;
        updateUI();
    }, 2800 * speedMult);
}

// LÓGICA MODO AUTOMÁTICO
if (autoOpenBtn) {
    autoOpenBtn.addEventListener('click', () => {
        if (autoSpinActive) {
            stopAutoPlay();
        } else if (!isSpinning && !isFreeSpinsMode) {
            autoModal.style.display = 'flex';
        }
    });
}
if (closeAutoModal) { closeAutoModal.addEventListener('click', () => { autoModal.style.display = 'none'; }); }

if (startAutoBtn) {
    startAutoBtn.addEventListener('click', () => {
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
    if (autoOpenBtn) {
        autoOpenBtn.innerText = "AUTO";
        autoOpenBtn.classList.remove('active-auto');
    }
}

async function startAutoPlay() {
    autoSpinActive = true;
    if (autoOpenBtn) {
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

infoBtn.addEventListener('click', () => { if (!isSpinning) infoModal.style.display = 'flex'; });
closeModal.addEventListener('click', () => { infoModal.style.display = 'none'; });

window.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.style.display = 'none';
    if (e.target === autoModal) autoModal.style.display = 'none';
});

// ==========================================
// NOTA SOBRE LA CALIBRACIÓN
// ==========================================
// Big Bass Bonanza (Pragmatic Play) es un juego con RTP certificado ~96%, pero
// las tablas exactas de pesos y valores de dinero por rodillo son propiedad
// del proveedor y no están publicadas oficialmente. Para este proyecto se
// investigó su mecánica pública (grilla 5x3, 10 líneas fijas, símbolos de
// dinero solo en rodillos 2-5, Wild "Pescador" que cobra el dinero visible,
// Scatter que activa Giros Gratis) y se armó una tabla de pesos propia,
// pensada para que el juego base pague con cierta frecuencia sin ser
// "imposible" ni "regalado", y para que los Giros Gratis / Súper Pesca sean
// notablemente más generosos, tal como en el juego original.
