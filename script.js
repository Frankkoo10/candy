// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = 'https://wgqqbahoalozgfukioza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncXFiYWhvYWxvemdmdWtpb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTA3OTYsImV4cCI6MjA5OTgyNjc5Nn0.v_kpYceS8ceIUBNaLLHjfyBeFA2Y3lDRy7Yn6cb5Uz8';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;


// ==========================================
// ESTADO GENERAL DEL JUEGO
// ==========================================
const symbols = [
    { char: '💖', val: 10 },    { char: '💜', val: 5 },     { char: '💚', val: 4 },
    { char: '💙', val: 3 },     { char: '🍎', val: 2 },     { char: '🍑', val: 1.5 },
    { char: '🍉', val: 1 },     { char: '🍇', val: 0.8 },   { char: '🍌', val: 0.5 },
    { char: '🍭', val: 20 }
];

let credit = 0; // Inicia en 0, se carga desde Supabase
let baseBet = 2.00;
let actualBet = 2.00;
let doubleChance = false;
let isSpinning = false;

// Estado de Giros Gratis
let isFreeSpinsMode = false;
let isSuperBonusMode = false; 
let freeSpinsLeft = 0;
let totalFsWin = 0;

// Grilla de 30 celdas
let gridState = [];

// DOM Elements
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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// FUNCIONES DE BASE DE DATOS (SUPABASE)
// ==========================================
async function loadBalanceFromDB() {
    try {
        const { data, error } = await supabaseClient
            .from(NOMBRE_TABLA_USUARIOS)
            .select(NOMBRE_COLUMNA_SALDO)
            .eq('id', ID_DEL_USUARIO)
            .single();

        if (error) throw error;

        if (data) {
            credit = parseFloat(data[NOMBRE_COLUMNA_SALDO]);
            updateUI();
        }
    } catch (error) {
        console.error("Error al cargar saldo desde Supabase:", error);
        statusMessage.innerText = "ERROR DE CONEXIÓN CON BD";
    }
}

async function updateBalanceInDB(newBalance) {
    try {
        const updateData = {};
        updateData[NOMBRE_COLUMNA_SALDO] = newBalance;

        const { error } = await supabaseClient
            .from(NOMBRE_TABLA_USUARIOS)
            .update(updateData)
            .eq('id', ID_DEL_USUARIO);

        if (error) throw error;
    } catch (error) {
        console.error("Error al actualizar saldo en Supabase:", error);
    }
}

// ==========================================
// LÓGICA DEL JUEGO
// ==========================================
function initGrid() {
    gridContainer.innerHTML = '';
    gridState = [];
    for (let i = 0; i < 30; i++) {
        const randomSym = symbols[4 + Math.floor(Math.random() * 5)]; 
        gridState.push({ ...randomSym });
    }
    renderGridDOM();
    updateUI();
}

function renderGridDOM() {
    gridContainer.innerHTML = '';
    gridState.forEach((item, index) => {
        const cell = document.createElement('div');
        cell.classList.add('slot-cell');
        cell.classList.add('landing'); 
        
        if (item) {
            const span = document.createElement('span');
            span.innerText = item.char;
            cell.appendChild(span);

            if (item.isBomb) {
                cell.style.background = "radial-gradient(circle, #ffea00 0%, #ff0055 100%)";
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
    if (isSpinning || isFreeSpinsMode) return;
    if (baseBet < 100) { baseBet += 2.00; calculateActualBet(); }
});

betMinus.addEventListener('click', () => {
    if (isSpinning || isFreeSpinsMode) return;
    if (baseBet > 2.00) { baseBet -= 2.00; calculateActualBet(); }
});

function calculateActualBet() {
    actualBet = doubleChance ? baseBet * 1.25 : baseBet;
    updateUI();
}

doubleChanceToggle.addEventListener('change', (e) => {
    if (isSpinning || isFreeSpinsMode) {
        e.target.checked = !e.target.checked;
        return;
    }
    doubleChance = e.target.checked;
    calculateActualBet();
});

btnBuyFree.addEventListener('click', () => {
    if (isSpinning || isFreeSpinsMode) return;
    const cost = baseBet * 100;
    if (credit >= cost) {
        credit -= cost;
        updateBalanceInDB(credit); // Actualizar base de datos
        isSuperBonusMode = false; 
        triggerFreeSpins(10);
    } else {
        statusMessage.innerText = "CRÉDITO INSUFICIENTE";
    }
});

btnBuySuper.addEventListener('click', () => {
    if (isSpinning || isFreeSpinsMode) return;
    const cost = baseBet * 500;
    if (credit >= cost) {
        credit -= cost;
        updateBalanceInDB(credit); // Actualizar base de datos
        isSuperBonusMode = true; 
        triggerFreeSpins(15);
    } else {
        statusMessage.innerText = "CRÉDITO INSUFICIENTE";
    }
});

spinBtn.addEventListener('click', () => {
    if (isSpinning || isFreeSpinsMode) return;
    if (credit >= actualBet) {
        credit -= actualBet;
        updateBalanceInDB(credit); // Descuenta apuesta en base de datos
        winDisplay.innerText = "$0.00";
        updateUI();
        executeSpin();
    } else {
        statusMessage.innerText = "CRÉDITO INSUFICIENTE";
    }
});

async function executeSpin() {
    isSpinning = true;
    statusMessage.innerText = isFreeSpinsMode ? `GIRO RESTANTE: ${freeSpinsLeft}` : "¡SABOREANDO EL GIRO!";
    spinWinAccumulator.style.display = 'none';
    accumValue.innerText = "$0.00";
    accumMult.innerText = "";
    
    const cells = document.querySelectorAll('.slot-cell');
    cells.forEach(cell => cell.classList.add('spinning'));
    await delay(600);

    generateNewSymbols();
    renderGridDOM();

    await handleTumbles();
}

function generateNewSymbols() {
    gridState = [];
    for (let i = 0; i < 30; i++) {
        gridState.push(getRandomSymbolWithProbability());
    }
}

function getRandomSymbolWithProbability() {
    const weights = {
        '🍌': 110, '🍇': 95, '🍉': 85, '🍑': 70, '🍎': 60,
        '💙': 40, '💚': 28, '💜': 18, '💖': 8,
        '🍭': doubleChance ? 16 : 7 
    };

    if (isFreeSpinsMode) {
        weights['💣'] = isSuperBonusMode ? 22 : 10;
    }

    let totalWeight = 0;
    for (let key in weights) totalWeight += weights[key];

    let randomNum = Math.random() * totalWeight;
    let selectedChar = '🍌';

    for (let key in weights) {
        if (randomNum < weights[key]) {
            selectedChar = key;
            break;
        }
        randomNum -= weights[key];
    }

    if (selectedChar === '💣') {
        let multWeights = isSuperBonusMode 
            ? { 2: 0, 3: 0, 5: 10, 8: 20, 10: 30, 15: 20, 25: 12, 50: 6, 100: 2 }
            : { 2: 50, 3: 30, 5: 15, 8: 8, 10: 5, 15: 3, 25: 2, 50: 1, 100: 0.5 };
        
        let totalMWeight = 0;
        for (let m in multWeights) totalMWeight += multWeights[m];

        let mRand = Math.random() * totalMWeight;
        let finalMult = isSuperBonusMode ? 10 : 2;

        for (let mVal in multWeights) {
            if (mRand < multWeights[mVal]) {
                finalMult = parseInt(mVal);
                break;
            }
            mRand -= multWeights[mVal];
        }

        return { char: '💣', isBomb: true, multiplierValue: finalMult };
    }

    const baseSym = symbols.find(s => s.char === selectedChar);
    return { ...baseSym };
}

async function handleTumbles() {
    let tumbleCount = 0;
    let accumulatedSpinWin = 0; 
    let isWinningTumble = true;
    let extraFreeSpinsAwarded = false;
    let activatedFreeSpins = false;

    if (isFreeSpinsMode) {
        spinWinAccumulator.style.display = 'flex';
    }

    while (isWinningTumble) {
        const counts = {};
        gridState.forEach(item => {
            if (item) counts[item.char] = (counts[item.char] || 0) + 1;
        });

        const winningSymbolsList = [];
        let winThisStep = 0;
        const scatterQty = counts['🍭'] || 0;
        
        if (scatterQty >= 4) {
            winningSymbolsList.push('🍭');
            winThisStep += 15 * baseBet;
            if (!isFreeSpinsMode) activatedFreeSpins = true;
            else extraFreeSpinsAwarded = true;
        } else if (scatterQty === 3 && isFreeSpinsMode) {
            winningSymbolsList.push('🍭'); 
            extraFreeSpinsAwarded = true;
        }

        for (const key in counts) {
            if (key === '🍭' || key === '💣') continue;
            const qty = counts[key];
            if (qty >= 8) {
                winningSymbolsList.push(key);
                const config = symbols.find(s => s.char === key);
                let factor = 1.0;
                if (qty >= 10 && qty <= 11) factor = 1.5;
                if (qty >= 12) factor = 3.0;
                winThisStep += config.val * baseBet * factor;
            }
        }

        if (winningSymbolsList.length > 0) {
            tumbleCount++;
            accumulatedSpinWin += winThisStep;
            spinWinAccumulator.style.display = 'flex';
            accumValue.innerText = `$${accumulatedSpinWin.toFixed(2)}`;

            const domCells = document.querySelectorAll('.slot-cell');
            gridState.forEach((item, index) => {
                if (item && winningSymbolsList.includes(item.char)) {
                    domCells[index].classList.add('win-highlight');
                }
            });

            await delay(900);

            gridState.forEach((item, index) => {
                if (item && winningSymbolsList.includes(item.char)) {
                    domCells[index].classList.add('win-pop');
                    gridState[index] = null; 
                }
            });

            await delay(300);
            applyGravity();
            renderGridDOM();
            await delay(300);
            fillEmptySpaces();
            renderGridDOM();
            await delay(400);

        } else {
            isWinningTumble = false;
        }
    }

    if (accumulatedSpinWin > 0) {
        let multiplierSum = 0;
        let finalSpinWin = accumulatedSpinWin;

        if (isFreeSpinsMode) {
            const domCells = document.querySelectorAll('.slot-cell');
            gridState.forEach((item, index) => {
                if (item && item.isBomb) {
                    multiplierSum += item.multiplierValue;
                    domCells[index].classList.add('bomb-pulse'); 
                }
            });

            if (multiplierSum > 0) {
                accumMult.innerText = ` x 💣${multiplierSum}`;
                await delay(1200); 
                finalSpinWin = accumulatedSpinWin * multiplierSum;
                accumValue.innerText = `$${finalSpinWin.toFixed(2)}`;
                statusMessage.innerText = `¡BOOM! MULTIPLICADO POR x${multiplierSum}`;
            }
        }

        credit += finalSpinWin;
        updateBalanceInDB(credit); // SUMA EL PREMIO A LA BASE DE DATOS
        winDisplay.innerText = `$${finalSpinWin.toFixed(2)}`;

        if (isFreeSpinsMode) {
            totalFsWin += finalSpinWin;
            animateBonusHeader(totalFsWin);
        }

    } else {
        statusMessage.innerText = isFreeSpinsMode ? "Tirada en blanco" : "Suerte en la próxima";
    }

    updateUI();
    isSpinning = false;

    if (activatedFreeSpins) {
        await delay(1500);
        triggerFreeSpins(10);
        return;
    }

    if (extraFreeSpinsAwarded) {
        freeSpinsLeft += 5;
        statusMessage.innerText = "¡+5 GIROS GRATIS EXTRA!";
        await delay(1500);
    }

    if (isFreeSpinsMode) {
        if (freeSpinsLeft > 0) {
            await delay(1500);
            executeFreeSpinsLoop();
        } else {
            await delay(1500);
            finishFreeSpinsMode();
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
            gridState[index] = activeElements.length > 0 ? activeElements.shift() : null;
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
    bonusHeaderWin.style.display = 'flex';
    bonusTotalAmount.innerText = "$0.00";
    fsOverlayTitle.innerText = isSuperBonusMode ? "¡SUPER BONUS ADQUIRIDO!" : "¡GIROS GRATIS!";
    fsCountText.innerText = `${count} GIROS CON MULTIPLICADORES ÉPICOS`;
    fsOverlay.style.display = 'flex';

    setTimeout(() => {
        fsOverlay.style.display = 'none';
        executeFreeSpinsLoop();
    }, 3000);
}

function executeFreeSpinsLoop() {
    if (freeSpinsLeft > 0) {
        freeSpinsLeft--;
        executeSpin();
    }
}

function animateBonusHeader(targetValue) {
    let current = parseFloat(bonusTotalAmount.innerText.replace('$', ''));
    let increment = (targetValue - current) / 15;
    let step = 0;

    const timer = setInterval(() => {
        current += increment;
        bonusTotalAmount.innerText = `$${current.toFixed(2)}`;
        step++;
        if (step >= 15) {
            clearInterval(timer);
            bonusTotalAmount.innerText = `$${targetValue.toFixed(2)}`;
        }
    }, 40);
}

function finishFreeSpinsMode() {
    isFreeSpinsMode = false;
    isSuperBonusMode = false;
    fsOverlayTitle.innerText = "¡PREMIO DEL BONUS TOTAL!";
    fsCountText.innerText = `GANANCIA TOTAL: $${totalFsWin.toFixed(2)}`;
    fsOverlay.style.display = 'flex';

    setTimeout(() => {
        fsOverlay.style.display = 'none';
        bonusHeaderWin.style.display = 'none'; 
        spinWinAccumulator.style.display = 'none';
        statusMessage.innerText = "PRESIONA PARA GIRAR";
        winDisplay.innerText = `$${totalFsWin.toFixed(2)}`;
        updateUI();
    }, 4000);
}

infoBtn.addEventListener('click', () => {
    if (isSpinning) return;
    infoModal.style.display = 'flex';
});

closeModal.addEventListener('click', () => infoModal.style.display = 'none');
window.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.style.display = 'none';
});

// ==========================================
// INICIALIZACIÓN
// ==========================================
window.onload = async () => {
    await loadBalanceFromDB(); // Carga el saldo real desde Supabase primero
    initGrid();                // Luego inicia visualmente la grilla
};
