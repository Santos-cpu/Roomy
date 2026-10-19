import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, orderBy, updateDoc, deleteDoc, onSnapshot, limit, getDocs, deleteField } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { enableIndexedDbPersistence, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyCGWAqi1MKJrlLNiCOIEztMu5qrNGbGtMA",
    authDomain: "piso-app-11882.firebaseapp.com",
    projectId: "piso-app-11882",
    storageBucket: "piso-app-11882.firebasestorage.app",
    messagingSenderId: "897201846594",
    appId: "1:897201846594:web:eb7df0b778ee8350eff0db"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistencia: Varias pestañas abiertas.');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistencia: Navegador no compatible.');
    }
});

const messaging = getMessaging(app);

// PIN SECRETO PARA ENTRAR AL PANEL MAESTRO
const MASTER_PIN = "2026";
// IDENTIFICADOR DE VERSIÓN PARA EL POPUP DE NOVEDADES
const PATCH_VERSION = "v2.0_retro";

async function activarNotificacionesPush() {
    try {
        const permiso = await Notification.requestPermission();
        if (permiso === 'granted') {
            const token = await getToken(messaging, { vapidKey: "BMwN91jpJDw5pzlQB2syEMaK0ooR7893Dv880j2LRKM4ENlZES0cSLjot2M08vIq7qxGC9ZwIud8uySMBGXcZfs" });
            if (token) {
                await setDoc(doc(db, "grupos", idPisoActual, "tokens_push", nombreUsuario), {
                    token: token,
                    actualizado: new Date().toISOString()
                });
            }
        }
    } catch (error) { console.log("Notificaciones bloqueadas o no soportadas en este navegador."); }
}

let participantesGrupo = [];
let creadorGrupo = "";
let idPisoActual = "";
let nombreUsuario = "";
let nombresNuevos = [];
let idGastoEditando = null;
let idZonaEditando = null;
let zonasLimpiezaCache = [];
let fechaCalendario = new Date();
let misPisos = JSON.parse(localStorage.getItem('misPisos_v2')) || [];
let ultimoPisoActivo = localStorage.getItem('ultimoPisoActivo');
let unsubGrupo = null;
let unsubGastos = null;
let unsubCompra = null;
let unsubLimpieza = null;
let unsubHistorial = null;
let ultimosGastos = [];
let ultimosBalances = {};
let strikesAutomaticos = {};
let ultimosStrikes = {};
let parcheLogRegistradoEnGrupo = false;

let chartMisGastosObj = null;
let chartPisoGastosObj = null;

// --- SINTETIZADOR 8-BITS (SOLO TAREAS Y BIZUM) + VIBRACIÓN HÁPTICA ---
let sonidoActivo = localStorage.getItem('sonido8Bit') !== 'OFF';
let audioCtx = null;

function actualizarTextoBotonSonido() {
    const icono = document.getElementById('iconoToggleSonido');
    const texto = document.getElementById('textoToggleSonido');
    if (icono && texto) {
        icono.innerText = sonidoActivo ? '🔊' : '🔇';
        texto.innerText = `FX / Vibración: ${sonidoActivo ? 'ON' : 'OFF'}`;
    }
}

window.playRetroSound = function(tipo = 'blip') {
    if (!sonidoActivo) return;

    // Solo reproducimos sonido 8-bits al pagar un Bizum ('coin_bizum') o completar tarea ('powerup')
    if (tipo === 'coin_bizum' || tipo === 'powerup') {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const now = audioCtx.currentTime;

            if (tipo === 'coin_bizum') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(987.77, now); // B5
                osc.frequency.setValueAtTime(1318.51, now + 0.07); // E6
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.start(now); osc.stop(now + 0.29);
            } else if (tipo === 'powerup') {
                const notas = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
                notas.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.055);
                    gain.gain.setValueAtTime(0.05, now + idx * 0.055);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1) * 0.055 + 0.04);
                    osc.connect(gain); gain.connect(audioCtx.destination);
                    osc.start(now + idx * 0.055);
                    osc.stop(now + (idx + 1) * 0.055 + 0.05);
                });
            }
        } catch (e) {}

        if (navigator.vibrate) navigator.vibrate([25, 40, 25]);
    } else {
        // Para el resto de acciones, leve vibración háptica sin sonido
        if (navigator.vibrate) {
            navigator.vibrate(tipo === 'hit' ? [20, 30, 20] : 15);
        }
    }
};

// --- VENTANA EMERGENTE RETRO DE NOVEDADES (PATCH NOTES) ---
function comprobarYMostrarNovedades(idPiso) {
    const storageKey = `roomy_patch_${PATCH_VERSION}_${idPiso}`;
    if (localStorage.getItem(storageKey)) return;

    if (document.getElementById('patchNotesOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'patchNotesOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 10000; background: rgba(0, 0, 0, 0.82);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; box-sizing: border-box;
    `;

    overlay.innerHTML = `
        <div style="background: var(--bg-card); width: 100%; max-width: 370px; max-height: 85vh; border: 3px solid #ffffff; border-radius: 4px; box-shadow: 6px 6px 0px #000000; display: flex; flex-direction: column; overflow: hidden;">
            <div style="background: #090a10; padding: 14px 16px; border-bottom: 2px solid var(--border-color); text-align: center;">
                <div style="font-family: var(--font-pixel); font-size: 0.65em; color: var(--border-highlight); margin-bottom: 6px;">UPDATE // V2.0</div>
                <h3 style="margin: 0; font-family: var(--font-pixel); font-size: 0.9em; color: var(--arcade-yellow);">🕹️ NOVEDADES ROOMY</h3>
            </div>
            
            <div style="padding: 14px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; font-size: 0.9em; line-height: 1.35; color: var(--text-main);">
                <div style="background: #090a10; border: 1px solid #262b44; border-left: 3px solid var(--arcade-yellow); padding: 10px; border-radius: 4px;">
                    <div style="font-weight: 700; color: var(--arcade-yellow); margin-bottom: 3px;">🎨 Nuevo Diseño & Menú Pausa</div>
                    <div style="color: var(--text-muted); font-size: 0.92em;">Interfaz arcade más limpia. Pulsa en tu nombre (arriba a la derecha) para cambiar tu avatar, color o copiar el enlace del piso.</div>
                </div>

                <div style="background: #090a10; border: 1px solid #262b44; border-left: 3px solid var(--border-highlight); padding: 10px; border-radius: 4px;">
                    <div style="font-weight: 700; color: var(--border-highlight); margin-bottom: 3px;">📊 Categorías, Plantillas y Stats</div>
                    <div style="color: var(--text-muted); font-size: 0.92em;">Botones rápidos de 1 clic (<i>Wi-Fi, Súper, Cerves</i>), filtro por meses, tocar cualquier gasto para editarlo y gráficos en <b>📊</b>.</div>
                </div>

                <div style="background: #090a10; border: 1px solid #262b44; border-left: 3px solid var(--arcade-red); padding: 10px; border-radius: 4px;">
                    <div style="font-weight: 700; color: var(--arcade-red); margin-bottom: 3px;">🚩 Sistema VAR en Limpieza</div>
                    <div style="color: var(--text-muted); font-size: 0.92em;">Si alguien marca una tarea como hecha sin haber limpiado, <b>2 compañeros</b> pueden pulsar <b>🚩 VAR</b> para anularla y meterle <b>+1 falta</b> por intento de tongo.</div>
                </div>

                <div style="background: #090a10; border: 1px solid #262b44; border-left: 3px solid var(--arcade-green); padding: 10px; border-radius: 4px;">
                    <div style="font-weight: 700; color: var(--arcade-green); margin-bottom: 3px;">🏆 Niveles XP, Títulos y Wanted</div>
                    <div style="color: var(--text-muted); font-size: 0.92em;">Sube de nivel (<b>LVL</b>) cumpliendo tareas y haciendo Bizums, desbloquea nuevos títulos dinámicos y evita caer en el cartel de <i>Wanted</i>.</div>
                </div>
            </div>

            <div style="padding: 12px 16px; background: #090a10; border-top: 2px solid var(--border-color);">
                <button type="button" id="btnCerrarPatchNotes" style="margin: 0; background: var(--arcade-green); color: #000;">¡ENTENDIDO! (START)</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('btnCerrarPatchNotes').onclick = async () => {
        window.playRetroSound('blip');
        localStorage.setItem(storageKey, 'true');
        overlay.remove();

        if (!parcheLogRegistradoEnGrupo) {
            parcheLogRegistradoEnGrupo = true;
            try {
                await updateDoc(doc(db, "grupos", idPiso), {
                    parche_notificado: PATCH_VERSION
                });
                await registrarActividad(
                    `ACTUALIZACIÓN V2.0: Nuevo menú de perfil, gráficos (📊), filtro mensual, niveles XP en el Top y sistema 🚩 VAR en tareas (2 votos anulan limpieza + 1 falta).`,
                    "🕹️"
                );
            } catch (e) { console.error(e); }
        }
    };
}

// --- SISTEMA DE AVATARES, COLORES Y AJUSTES MANUALES DE FALTAS ---
window.avataresGrupo = {};
window.coloresGrupo = {};
window.ajustesFaltasGrupo = {};

function getAvatar(nombre) {
    return window.avataresGrupo[nombre] || "👾";
}

function getColor(nombre) {
    return window.coloresGrupo[nombre] || "#00e5ff";
}

function esUsuarioMaster() {
    if (!nombreUsuario) return false;
    const n = nombreUsuario.trim().toLowerCase();
    return n === 'diego' || nombreUsuario === creadorGrupo;
}

// --- SISTEMA DE HISTORIAL DE ACTIVIDAD ---
async function registrarActividad(mensaje, icono) {
    if (!idPisoActual) return;
    try {
        await addDoc(collection(db, "grupos", idPisoActual, "historial"), {
            mensaje: mensaje,
            icono: icono,
            fecha: Date.now()
        });
    } catch (e) { console.error("Error al registrar actividad", e); }
}

window.mostrarModal = function({ titulo, mensaje, tipo = 'alert', valorInput = '' }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('iosModalOverlay');
        const titleEl = document.getElementById('iosModalTitle');
        const msgEl = document.getElementById('iosModalMessage');
        const inputEl = document.getElementById('iosModalInput');
        const btnCancel = document.getElementById('iosModalBtnCancel');
        const btnConfirm = document.getElementById('iosModalBtnConfirm');
        
        titleEl.innerText = titulo;
        msgEl.innerText = mensaje;
        inputEl.classList.add('hidden');
        btnCancel.classList.add('hidden');
        inputEl.value = valorInput;
        inputEl.type = (titulo.toLowerCase().includes('precio') || titulo.toLowerCase().includes('importe') || titulo.toLowerCase().includes('pin')) ? 'number' : 'text';
        
        if (tipo === 'confirm' || tipo === 'prompt') btnCancel.classList.remove('hidden');
        if (tipo === 'prompt') inputEl.classList.remove('hidden');
        
        overlay.classList.add('active');
        const close = () => { overlay.classList.remove('active'); btnConfirm.onclick = null; btnCancel.onclick = null; };
        
        btnConfirm.onclick = () => { window.playRetroSound('blip'); close(); if (tipo === 'prompt') resolve(inputEl.value); else resolve(true); };
        btnCancel.onclick = () => { window.playRetroSound('blip'); close(); if (tipo === 'prompt') resolve(null); else resolve(false); };
    });
};

window.mostrarAlerta = (t, m) => window.mostrarModal({titulo: t, mensaje: m, tipo: 'alert'});
window.mostrarConfirmacion = (t, m) => window.mostrarModal({titulo: t, mensaje: m, tipo: 'confirm'});
window.mostrarPrompt = (t, m, val) => window.mostrarModal({titulo: t, mensaje: m, tipo: 'prompt', valorInput: val});

const pantallaCrear = document.getElementById('pantallaCrear');
const pantallaUnirse = document.getElementById('pantallaUnirse');
const pantallaMisPisos = document.getElementById('pantallaMisPisos');
const pantallaDashboard = document.getElementById('pantallaDashboard');

async function iniciarApp() {
    actualizarTextoBotonSonido();
    const urlParams = new URLSearchParams(window.location.search);
    const pisoIdUrl = urlParams.get('id');
    if (pisoIdUrl) { 
        document.body.classList.add('pantalla-centrada'); 
        pantallaUnirse.classList.remove('hidden'); 
        await cargarPantallaUnirse(pisoIdUrl); 
        return; 
    }
    if (ultimoPisoActivo) {
        const pisoGuardado = misPisos.find(p => p.id === ultimoPisoActivo);
        if (pisoGuardado) { 
            document.body.classList.remove('pantalla-centrada'); 
            nombreUsuario = pisoGuardado.nombreUsuario; 
            idPisoActual = pisoGuardado.id; 
            mostrarDashboard(nombreUsuario, idPisoActual); 
            return; 
        }
    }
    if (misPisos.length > 0) { 
        document.body.classList.add('pantalla-centrada'); 
        mostrarPantallaMisPisos(); 
    } else { 
        document.body.classList.add('pantalla-centrada'); 
        pantallaCrear.classList.remove('hidden'); 
    }
}

function mostrarPantallaMisPisos() {
    pantallaMisPisos.classList.remove('hidden');
    pantallaCrear.classList.add('hidden');
    document.getElementById('btnCancelarCrear').classList.remove('hidden');
    const div = document.getElementById('listaMisPisos');
    div.innerHTML = '';
    
    if (misPisos.length === 0) {
        div.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-bottom: 20px;">No tienes ninguna partida guardada.</p>';
        return;
    }
    
    misPisos.forEach((piso, index) => {
        const fila = document.createElement('div');
        fila.style.cssText = "display: flex; gap: 8px; align-items: stretch; margin-bottom: 12px;";
        
        const btn = document.createElement('button');
        btn.className = 'btn-piso';
        btn.style.margin = "0";
        btn.style.flex = "1";
        btn.innerHTML = `▶ ${piso.nombrePiso} <br><small style="font-weight:600; font-size:0.8em; color: rgba(0,0,0,0.75); display: block; margin-top: 2px;">🕹️ Jugar como ${piso.nombreUsuario}</small>`;
        
        btn.onclick = () => {
            window.playRetroSound('blip');
            document.body.classList.remove('pantalla-centrada');
            pantallaMisPisos.classList.add('hidden');
            localStorage.setItem('ultimoPisoActivo', piso.id);
            nombreUsuario = piso.nombreUsuario;
            idPisoActual = piso.id;
            mostrarDashboard(piso.nombreUsuario, piso.id);
        };
        
        const btnEliminar = document.createElement('button');
        btnEliminar.innerHTML = "🗑️";
        btnEliminar.title = "Borrar piso";
        btnEliminar.style.cssText = "background: #1e2238; border: 2px solid #ff0055; width: 50px; border-radius: 4px; cursor: pointer; font-size: 1.1em; display: flex; align-items: center; justify-content: center; margin: 0; flex-shrink: 0; box-shadow: 0 4px 0 #000;";
        
        btnEliminar.onclick = async () => {
            window.playRetroSound('hit');
            const seguro = await window.mostrarConfirmacion("Borrar Base", `¿Seguro que quieres borrar "${piso.nombrePiso}" de tu lista?`);
            if (seguro) {
                misPisos.splice(index, 1);
                localStorage.setItem('misPisos_v2', JSON.stringify(misPisos));
                if (localStorage.getItem('ultimoPisoActivo') === piso.id) {
                    localStorage.removeItem('ultimoPisoActivo');
                }
                mostrarPantallaMisPisos();
                if (misPisos.length === 0) {
                    pantallaMisPisos.classList.add('hidden');
                    pantallaCrear.classList.remove('hidden');
                }
            }
        };
        fila.appendChild(btn);
        fila.appendChild(btnEliminar);
        div.appendChild(fila);
    });
}

document.getElementById('btnIrCrearPiso').addEventListener('click', () => { window.playRetroSound('blip'); pantallaMisPisos.classList.add('hidden'); pantallaCrear.classList.remove('hidden'); });
document.getElementById('btnCancelarCrear').addEventListener('click', () => { window.playRetroSound('blip'); pantallaCrear.classList.add('hidden'); pantallaMisPisos.classList.remove('hidden'); });

async function procesarEnlaceInvitacion() {
    window.playRetroSound('blip');
    const enlace = await window.mostrarPrompt("Unirse a un piso", "Pega aquí el enlace o código que te han pasado:");
    if (enlace) {
        let idToJoin = enlace.trim();
        if (idToJoin.includes('?id=')) {
            idToJoin = idToJoin.split('?id=')[1].split('&')[0];
        }
        if (idToJoin) {
            document.body.classList.add('pantalla-centrada');
            pantallaMisPisos.classList.add('hidden');
            pantallaCrear.classList.add('hidden');
            pantallaUnirse.classList.remove('hidden');
            await cargarPantallaUnirse(idToJoin);
        }
    }
}
document.getElementById('btnIrUnirsePiso').addEventListener('click', procesarEnlaceInvitacion);
document.getElementById('btnIrUnirsePiso2').addEventListener('click', procesarEnlaceInvitacion);

document.getElementById('btnAñadirNombre').addEventListener('click', () => {
    const input = document.getElementById('inputNuevoNombre');
    const nombre = input.value.trim();
    if (nombre && !nombresNuevos.includes(nombre)) { 
        window.playRetroSound('blip');
        nombresNuevos.push(nombre); 
        actualizarListaNuevosNombres(); 
        input.value = ''; 
    }
});

function actualizarListaNuevosNombres() {
    const contenedor = document.getElementById('contenedorNuevosNombres'); 
    contenedor.innerHTML = '';
    nombresNuevos.forEach((nombre, index) => { 
        contenedor.innerHTML += `<div class="tag-nombre"><span>👾 ${nombre}</span><span style="cursor:pointer;" onclick="quitarNombre(${index})">❌</span></div>`; 
    });
}

window.quitarNombre = function(index) { 
    window.playRetroSound('hit');
    nombresNuevos.splice(index, 1); 
    actualizarListaNuevosNombres(); 
};

document.getElementById('btnCrear').addEventListener('click', async () => {
    const nombrePiso = document.getElementById('nombrePiso').value; 
    const boton = document.getElementById('btnCrear');
    if (!nombrePiso || nombresNuevos.length === 0) return await window.mostrarAlerta("Datos incompletos", "Escribe el nombre del piso y añade al menos a un jugador.");
    
    boton.innerText = "CREANDO..."; boton.disabled = true;
    const idUnico = 'piso-' + Math.random().toString(36).substring(2, 8);
    const tablonInicial = { wifi_nombre: "", wifi_pass: "", iban: "", notas: "" };
    
    const emojis = ["🦊", "🐼", "🐵", "🐶", "🐱", "🐯", "🐨", "🐸", "🐷", "🐻", "🐰", "🦁", "🐮", "🐙", "🐢", "👽", "🤖", "👻", "🤡", "👾"];
    const hexColors = ["#ff453a", "#ff9f0a", "#ffd60a", "#32d74b", "#66d4cf", "#0a84ff", "#bf5af2", "#ff375f", "#a2845e", "#86868b"];
    const shuffledEmojis = emojis.sort(() => 0.5 - Math.random());
    const shuffledColors = hexColors.sort(() => 0.5 - Math.random());
    
    let avataresNuevos = {};
    let coloresNuevos = {};
    nombresNuevos.forEach((n, idx) => {
        avataresNuevos[n] = shuffledEmojis[idx % shuffledEmojis.length];
        coloresNuevos[n] = shuffledColors[idx % shuffledColors.length];
    });
    
    try {
        await setDoc(doc(db, "grupos", idUnico), { 
            id: idUnico, 
            nombre_piso: nombrePiso, 
            creador: nombresNuevos[0], 
            participantes: nombresNuevos, 
            avatares: avataresNuevos,
            colores: coloresNuevos,
            ajustes_faltas: {},
            parche_notificado: PATCH_VERSION,
            tablon: tablonInicial, 
            fecha_creacion: new Date().toISOString() 
        });
        window.playRetroSound('blip');
        pantallaCrear.classList.add('hidden'); pantallaUnirse.classList.remove('hidden');
        document.getElementById('nombrePiso').value = ""; nombresNuevos = []; actualizarListaNuevosNombres();
        await cargarPantallaUnirse(idUnico);
    } catch (error) { 
        await window.mostrarAlerta("Error", "No se pudo guardar."); 
    } finally { 
        boton.innerText = "CREAR PISO"; boton.disabled = false; 
    }
});

async function cargarPantallaUnirse(id) {
    try {
        const docSnap = await getDoc(doc(db, "grupos", id));
        if (docSnap.exists()) {
            const datosPiso = docSnap.data(); 
            document.getElementById('tituloUnirse').innerText = `🕹️ ${datosPiso.nombre_piso}`;
            const listaNombres = document.getElementById('listaNombres'); 
            listaNombres.innerHTML = ''; 
            
            window.avataresGrupo = datosPiso.avatares || {};
            window.coloresGrupo = datosPiso.colores || {};
            
            datosPiso.participantes.forEach(nombre => {
                const btn = document.createElement('button'); 
                btn.innerText = `${getAvatar(nombre)} ${nombre}`; 
                btn.className = 'btn-name';
                btn.style.borderColor = getColor(nombre); 
                btn.onclick = () => { window.playRetroSound('blip'); unirseYGuardar(nombre, id, datosPiso.nombre_piso); }; 
                listaNombres.appendChild(btn);
            });
        } else { document.getElementById('tituloUnirse').innerText = "❌ PISO NO EXISTE"; }
    } catch (error) { document.getElementById('tituloUnirse').innerText = "ERROR DE CONEXIÓN"; }
}

function unirseYGuardar(nombre, id, nombrePiso) {
    misPisos = misPisos.filter(piso => piso.id !== id);
    misPisos.push({ id: id, nombrePiso: nombrePiso, nombreUsuario: nombre });
    localStorage.setItem('misPisos_v2', JSON.stringify(misPisos)); 
    localStorage.setItem('ultimoPisoActivo', id);
    nombreUsuario = nombre; idPisoActual = id;
    pantallaUnirse.classList.add('hidden'); 
    document.body.classList.remove('pantalla-centrada');
    window.history.pushState({}, document.title, window.location.pathname);
    mostrarDashboard(nombre, id);
}

async function mostrarDashboard(nombre, id) {
    pantallaDashboard.classList.remove('hidden');
    if (unsubGrupo) unsubGrupo();

    unsubGrupo = onSnapshot(doc(db, "grupos", id), (docSnap) => {
        if (docSnap.exists()) {
            const datos = docSnap.data();
            window.avataresGrupo = datos.avatares || {};
            window.coloresGrupo = datos.colores || {};
            window.ajustesFaltasGrupo = datos.ajustes_faltas || {};
            creadorGrupo = datos.creador || "";
            participantesGrupo = datos.participantes || [];
            parcheLogRegistradoEnGrupo = (datos.parche_notificado === PATCH_VERSION);
            
            document.getElementById('tituloDashboard').innerText = datos.nombre_piso;
            document.getElementById('nombreUsuarioActual').innerHTML = `${getAvatar(nombre)} <span style="color: ${getColor(nombre)}; font-weight: bold;">${nombre}</span>`;
            
            const btnMaster = document.getElementById('btnAbrirMaster');
            if (btnMaster) {
                if (esUsuarioMaster()) btnMaster.classList.remove('hidden');
                else btnMaster.classList.add('hidden');
            }

            cargarTablon(datos.tablon || { wifi_nombre: "", wifi_pass: "", iban: "", notas: "" });
            recalcularStrikesTotales();

            comprobarYMostrarNovedades(id);
        }
    });

    cargarListaGastos();
    cargarListaLimpieza();
    cargarListaCompra();
    cargarHistorial();
    activarNotificacionesPush();
}

// --- LÓGICA DEL MENÚ DE PAUSA / PERFIL DESPLEGABLE ---
const menuPerfil = document.getElementById('menuPerfil');
document.getElementById('btnPerfil').addEventListener('click', (e) => {
    e.stopPropagation(); 
    window.playRetroSound('blip');
    menuPerfil.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    const contenedor = document.getElementById('contenedorMenuPerfil');
    if (contenedor && !contenedor.contains(e.target)) {
        menuPerfil.classList.add('hidden');
    }
});

document.getElementById('btnToggleSonido').addEventListener('click', (e) => {
    e.stopPropagation();
    sonidoActivo = !sonidoActivo;
    localStorage.setItem('sonido8Bit', sonidoActivo ? 'ON' : 'OFF');
    actualizarTextoBotonSonido();
    if (sonidoActivo) window.playRetroSound('blip');
});

// --- LÓGICA DEL PANEL MAESTRO (EXCLUSIVO ADMIN) ---
document.getElementById('btnAbrirMaster').addEventListener('click', async () => {
    menuPerfil.classList.add('hidden');
    if (!esUsuarioMaster()) return;

    const pinIntroducido = await window.mostrarPrompt("👑 ACCESO MAESTRO", "Introduce tu PIN secreto de administrador:");
    if (pinIntroducido === null) return;

    if (pinIntroducido.trim() !== MASTER_PIN) {
        window.playRetroSound('hit');
        return await window.mostrarAlerta("Acceso Denegado", "PIN incorrecto.");
    }

    window.playRetroSound('blip');
    renderPanelMaestro();
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    document.getElementById('vistaMaster').classList.remove('hidden');
});

document.getElementById('btnCerrarMaster').addEventListener('click', () => {
    window.playRetroSound('blip');
    document.body.style.overflow = 'auto';
    document.getElementById('vistaMaster').classList.add('hidden');
});

window.modificarFaltaManual = async function(persona, delta) {
    window.playRetroSound('blip');
    const actualAjuste = window.ajustesFaltasGrupo[persona] || 0;
    const autoBase = strikesAutomaticos[persona] || 0;
    
    if (autoBase + actualAjuste + delta < 0) return;

    const nuevoAjuste = actualAjuste + delta;
    try {
        await updateDoc(doc(db, "grupos", idPisoActual), {
            [`ajustes_faltas.${persona}`]: nuevoAjuste
        });
    } catch (e) {
        await window.mostrarAlerta("Error", "No se pudo actualizar la falta.");
    }
};

window.anularTareaSemanaActual = async function(idZona, nombreZona, responsable) {
    const seguro = await window.mostrarConfirmacion("Anular Tarea", `¿Desmarcar "${nombreZona}" de ${responsable} por no haberla hecho realmente?`);
    if (!seguro) return;

    const tsActual = new Date(obtenerLunes(new Date())).getTime();
    try {
        await updateDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZona), {
            [`semanas_hechas.${tsActual}`]: deleteField(),
            [`var_votos.${tsActual}`]: deleteField()
        });
        window.playRetroSound('hit');
        registrarActividad(`👑 **${nombreUsuario}** anuló la validación de "${nombreZona}" (${responsable}).`, "🚨");
        renderPanelMaestro();
    } catch (e) {
        await window.mostrarAlerta("Error", "No se pudo anular la tarea.");
    }
};

function renderPanelMaestro() {
    const contFaltas = document.getElementById('listaControlFaltasMaster');
    const contTareas = document.getElementById('listaAuditoriaTareasMaster');
    if (!contFaltas || !contTareas) return;

    contFaltas.innerHTML = '';
    participantesGrupo.forEach(p => {
        const total = ultimosStrikes[p] || 0;
        contFaltas.innerHTML += `
            <div class="manual-split-row">
                <div>
                    <span style="color: ${getColor(p)}; font-weight: 700; font-size: 1.05em;">${getAvatar(p)} ${p}</span>
                    <small style="display: block; color: var(--text-muted); font-size: 0.75em;">Faltas activas: <b style="color: var(--arcade-yellow);">${total}</b></small>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" class="btn-secundario btn-master-ctrl" onclick="modificarFaltaManual('${p}', -1)">-1</button>
                    <span style="font-family: var(--font-pixel); font-size: 0.9em; min-width: 26px; text-align: center; color: ${total > 0 ? 'var(--arcade-red)' : 'var(--text-main)'};">${total}</span>
                    <button type="button" class="btn-master-ctrl" style="background: var(--arcade-red); color: #fff;" onclick="modificarFaltaManual('${p}', 1)">+1</button>
                </div>
            </div>`;
    });

    const tsActual = new Date(obtenerLunes(new Date())).getTime();
    const asigs = calcularAsignacionesParaSemana(new Date(tsActual));
    const hechasEstaSemana = asigs.filter(a => (a.zonaRef.semanas_hechas || {})[tsActual]);

    if (hechasEstaSemana.length === 0) {
        contTareas.innerHTML = '<p style="color: var(--text-muted); text-align: center; font-size: 0.85em; margin: 0;">Nadie ha marcado tareas como completadas esta semana todavía.</p>';
    } else {
        contTareas.innerHTML = '';
        hechasEstaSemana.forEach(a => {
            contTareas.innerHTML += `
                <div class="manual-split-row">
                    <div>
                        <span style="font-weight: 700; color: var(--text-main);">${a.nombre_zona}</span>
                        <small style="display: block; color: var(--arcade-green); font-size: 0.78em;">Marcada por: ${getAvatar(a.leTocaA)} ${a.leTocaA}</small>
                    </div>
                    <button type="button" class="btn-bizum" style="background: var(--arcade-red); color: #fff;" onclick="anularTareaSemanaActual('${a.idZona}', '${a.nombre_zona.replace(/'/g, "\\'")}', '${a.leTocaA}')">❌ ANULAR</button>
                </div>`;
        });
    }
}

document.getElementById('btnCambiarUsuarioMenu').addEventListener('click', async () => {
    menuPerfil.classList.add('hidden');
    const seguro = await window.mostrarConfirmacion("Cambiar Jugador", "¿Te has equivocado de personaje? Volverás a la pantalla de selección.");
    if (seguro) {
        if(unsubGrupo) unsubGrupo(); if(unsubGastos) unsubGastos(); if(unsubCompra) unsubCompra(); if(unsubLimpieza) unsubLimpieza(); if(unsubHistorial) unsubHistorial();
        localStorage.removeItem('ultimoPisoActivo');
        document.getElementById('pantallaDashboard').classList.add('hidden');
        document.body.classList.add('pantalla-centrada');
        document.getElementById('pantallaUnirse').classList.remove('hidden');
        await cargarPantallaUnirse(idPisoActual);
    }
});

document.getElementById('btnCambiarAvatar').addEventListener('click', async () => {
    menuPerfil.classList.add('hidden');
    const nuevoEmoji = await window.mostrarPrompt("Cambiar Avatar", "Escribe o pega el emoji para tu personaje (Ej: 👽, 🦊, 👾):");
    
    if (nuevoEmoji && nuevoEmoji.trim().length > 0) {
        const emojiFinal = nuevoEmoji.trim().substring(0, 4); 
        
        try {
            const objUpdate = {};
            objUpdate[`avatares.${nombreUsuario}`] = emojiFinal;
            await updateDoc(doc(db, "grupos", idPisoActual), objUpdate);
            
            window.playRetroSound('blip');
            registrarActividad(`**${nombreUsuario}** ha cambiado su avatar a ${emojiFinal}.`, "😎");
        } catch (error) { 
            await window.mostrarAlerta("Error", "No se pudo cambiar el avatar."); 
        }
    }
});

document.getElementById('btnCambiarColor').addEventListener('click', async () => {
    menuPerfil.classList.add('hidden');
    
    const todosLosColores = [
        { id: "1", hex: "#ff453a", nombre: "🔴 Rojo" },
        { id: "2", hex: "#ff9f0a", nombre: "🟠 Naranja" },
        { id: "3", hex: "#ffd60a", nombre: "🟡 Amarillo" },
        { id: "4", hex: "#32d74b", nombre: "🟢 Verde" },
        { id: "5", hex: "#66d4cf", nombre: "🩵 Menta" },
        { id: "6", hex: "#0a84ff", nombre: "🔵 Azul" },
        { id: "7", hex: "#bf5af2", nombre: "🟣 Morado" },
        { id: "8", hex: "#ff375f", nombre: "🩷 Rosa" },
        { id: "9", hex: "#a2845e", nombre: "🟤 Marrón" },
        { id: "10", hex: "#86868b", nombre: "⚪ Gris" }
    ];

    const coloresEnUso = participantesGrupo
        .filter(p => p !== nombreUsuario)
        .map(p => window.coloresGrupo[p])
        .filter(c => c);

    const coloresDisponibles = todosLosColores.filter(c => !coloresEnUso.includes(c.hex));

    if (coloresDisponibles.length === 0) {
        return await window.mostrarAlerta("Sin colores", "Ya no quedan colores libres en este piso.");
    }

    let msg = "Escribe el número del color disponible:\n\n";
    let mapaOpciones = {};
    coloresDisponibles.forEach((c, index) => {
        let numeroOpcion = (index + 1).toString();
        msg += `${numeroOpcion}. ${c.nombre}\n`;
        mapaOpciones[numeroOpcion] = c.hex;
    });

    const seleccion = await window.mostrarPrompt("Elegir Color", msg);
    
    let nuevoColor = mapaOpciones[seleccion ? seleccion.trim() : ""];
    if (nuevoColor) {
        try {
            const objUpdate = {};
            objUpdate[`colores.${nombreUsuario}`] = nuevoColor;
            await updateDoc(doc(db, "grupos", idPisoActual), objUpdate);
            window.playRetroSound('blip');
        } catch (e) {
            await window.mostrarAlerta("Error", "No se pudo cambiar el color.");
        }
    } else if (seleccion !== null) {
        await window.mostrarAlerta("Atención", "Número no válido de la lista disponible.");
    }
});

document.getElementById('btnEditarNombrePiso').addEventListener('click', async () => {
    menuPerfil.classList.add('hidden');
    const n = document.getElementById('tituloDashboard').innerText;
    const nn = await window.mostrarPrompt("Renombrar Piso", "Escribe un nuevo nombre para la base:", n);
    if (nn && nn.trim() !== "" && nn.trim() !== n) {
        await updateDoc(doc(db, "grupos", idPisoActual), { nombre_piso: nn.trim() });
        document.getElementById('tituloDashboard').innerText = nn.trim();
        let p = misPisos.find(p => p.id === idPisoActual);
        if (p) { p.nombrePiso = nn.trim(); localStorage.setItem('misPisos_v2', JSON.stringify(misPisos)); }
    }
});

document.getElementById('btnCopiarEnlace').addEventListener('click', async () => {
    menuPerfil.classList.add('hidden');
    const enlace = `${window.location.origin}${window.location.pathname}?id=${idPisoActual}`;
    try { 
        await navigator.clipboard.writeText(enlace); 
        window.playRetroSound('blip');
        await window.mostrarAlerta("Enlace copiado", "¡Pásalo por WhatsApp a tus compañeros para que se unan!"); 
    } catch (e) { 
        await window.mostrarAlerta("Error al copiar", "Cópialo manualmente: \n\n" + enlace); 
    }
});

function activarPestaña(idTab, idVista) {
    window.playRetroSound('blip');
    ['tabGastos', 'tabCompra', 'tabLimpieza', 'tabRanking'].forEach(t => document.getElementById(t).classList.remove('active'));
    ['vistaGastos', 'vistaCompra', 'vistaLimpieza', 'vistaRanking'].forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById(idTab).classList.add('active'); 
    document.getElementById(idVista).classList.remove('hidden');
}

document.getElementById('tabGastos').addEventListener('click', () => activarPestaña('tabGastos', 'vistaGastos'));
document.getElementById('tabCompra').addEventListener('click', () => activarPestaña('tabCompra', 'vistaCompra'));
document.getElementById('tabLimpieza').addEventListener('click', () => activarPestaña('tabLimpieza', 'vistaLimpieza'));
document.getElementById('tabRanking').addEventListener('click', () => activarPestaña('tabRanking', 'vistaRanking'));

document.getElementById('btnAbrirGraficos').addEventListener('click', () => { window.playRetroSound('blip'); window.scrollTo(0, 0); document.body.style.overflow = 'hidden'; document.getElementById('vistaGraficos').classList.remove('hidden'); actualizarGraficos(); });
document.getElementById('btnCerrarGraficos').addEventListener('click', () => { window.playRetroSound('blip'); document.body.style.overflow = 'auto'; document.getElementById('vistaGraficos').classList.add('hidden'); });

document.getElementById('btnAbrirTablon').addEventListener('click', () => { window.playRetroSound('blip'); window.scrollTo(0, 0); document.body.style.overflow = 'hidden'; document.getElementById('vistaTablon').classList.remove('hidden'); });
document.getElementById('btnCerrarTablon').addEventListener('click', () => { window.playRetroSound('blip'); document.body.style.overflow = 'auto'; document.getElementById('vistaTablon').classList.add('hidden'); });

document.getElementById('btnAbrirHistorial').addEventListener('click', () => { window.playRetroSound('blip'); window.scrollTo(0, 0); document.body.style.overflow = 'hidden'; document.getElementById('vistaHistorial').classList.remove('hidden'); });
document.getElementById('btnCerrarHistorial').addEventListener('click', () => { window.playRetroSound('blip'); document.body.style.overflow = 'auto'; document.getElementById('vistaHistorial').classList.add('hidden'); });

document.getElementById('btnVaciarHistorial').addEventListener('click', async () => {
    window.playRetroSound('hit');
    const seguro = await window.mostrarConfirmacion("Vaciar Logs", "¿Seguro que quieres borrar todo el registro de actividad?");
    if (seguro) {
        const btn = document.getElementById('btnVaciarHistorial');
        btn.disabled = true;
        btn.innerText = "...";
        try {
            const q = collection(db, "grupos", idPisoActual, "historial");
            const snap = await getDocs(q);
            
            const batch = writeBatch(db);
            snap.forEach(d => {
                batch.delete(doc(db, "grupos", idPisoActual, "historial", d.id));
            });
            await batch.commit();

            registrarActividad(`**${nombreUsuario}** vació el historial de actividad.`, "🧹");
        } catch (e) {
            await window.mostrarAlerta("Error", "No se pudo vaciar el historial.");
        } finally {
            btn.disabled = false;
            btn.innerText = "VACIAR";
        }
    }
});

function cargarHistorial() {
    if (unsubHistorial) unsubHistorial();
    const q = query(collection(db, "grupos", idPisoActual, "historial"), orderBy("fecha", "desc"), limit(60));
    
    unsubHistorial = onSnapshot(q, (snap) => {
        const lista = document.getElementById('listaHistorial');
        lista.innerHTML = '';
        if (snap.empty) {
            lista.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No hay actividad reciente.</p>';
            return;
        }
        snap.forEach(doc => {
            const act = doc.data();
            const fechaStr = new Date(act.fecha).toLocaleString([], {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
            
            let mensajeFormateado = act.mensaje.replace(/\*\*(.*?)\*\*/g, (match, nombreExtraido) => {
                return `<span style="color: ${getColor(nombreExtraido)}; font-weight: bold;">${nombreExtraido}</span>`;
            });
            
            lista.innerHTML += `
                <div class="item-lista">
                    <div style="font-size: 1.5em; margin-right: 12px;">${act.icono}</div>
                    <div class="item-info">
                        <span class="item-titulo" style="font-size: 0.95em; display:block; white-space:normal;">${mensajeFormateado}</span>
                        <span class="item-detalle">${fechaStr}</span>
                    </div>
                </div>`;
        });
    });
}

function esGastoBizum(g) {
    return g.esBizum || (g.concepto && g.concepto.toLowerCase().includes('bizum'));
}

function actualizarGraficos() {
    let misData = [0, 0, 0]; 
    let pisoData = [0, 0, 0];
    let totalMio = 0;
    let totalPiso = 0;
    
    ultimosGastos.forEach(g => {
        if (esGastoBizum(g)) return; 
        
        let cat = g.categoria || "🏠 Piso";
        let idx = cat.includes("Facturas") ? 1 : (cat.includes("Ocio") ? 2 : 0);
        
        pisoData[idx] += g.importe;
        totalPiso += g.importe;
        
        let miParte = g.involucrados.find(i => (typeof i === 'string' ? i === nombreUsuario : i.nombre === nombreUsuario));
        if (miParte) {
            let qty = typeof miParte === 'string' ? (g.importe / g.involucrados.length) : miParte.importe;
            misData[idx] += qty;
            totalMio += qty;
        }
    });
    
    if(document.getElementById('totalMisGastos')) document.getElementById('totalMisGastos').innerText = `TOTAL: ${totalMio.toFixed(2)}€`;
    if(document.getElementById('misG-piso')) document.getElementById('misG-piso').innerText = `${misData[0].toFixed(2)}€`;
    if(document.getElementById('misG-facturas')) document.getElementById('misG-facturas').innerText = `${misData[1].toFixed(2)}€`;
    if(document.getElementById('misG-ocio')) document.getElementById('misG-ocio').innerText = `${misData[2].toFixed(2)}€`;
    
    if(document.getElementById('totalPisoGastos')) document.getElementById('totalPisoGastos').innerText = `TOTAL: ${totalPiso.toFixed(2)}€`;
    if(document.getElementById('pisoG-piso')) document.getElementById('pisoG-piso').innerText = `${pisoData[0].toFixed(2)}€`;
    if(document.getElementById('pisoG-facturas')) document.getElementById('pisoG-facturas').innerText = `${pisoData[1].toFixed(2)}€`;
    if(document.getElementById('pisoG-ocio')) document.getElementById('pisoG-ocio').innerText = `${pisoData[2].toFixed(2)}€`;
    
    const ctxMis = document.getElementById('chartMisGastos');
    const ctxPiso = document.getElementById('chartPisoGastos');
    
    if(chartMisGastosObj) chartMisGastosObj.destroy();
    if(chartPisoGastosObj) chartPisoGastosObj.destroy();
    
    const configParams = (data) => ({
        type: 'doughnut',
        data: {
            labels: ['🏠 Piso', '💡 Facturas', '🍻 Ocio'],
            datasets: [{
                data: data,
                backgroundColor: ['#32d74b', '#ff9f0a', '#0a84ff'],
                borderColor: '#151828',
                borderWidth: 3,
                hoverOffset: 4
            }]
        },
        options: {
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    if (ctxMis && window.Chart) chartMisGastosObj = new Chart(ctxMis, configParams(misData));
    if (ctxPiso && window.Chart) chartPisoGastosObj = new Chart(ctxPiso, configParams(pisoData));
}

// --- MÓDULO GASTOS (MODO ENFOQUE + HISTORIAL LIMPIO) ---
window.usarPlantillaGasto = function(concepto, categoria) {
    window.playRetroSound('blip');
    document.getElementById('conceptoGasto').value = concepto;
    document.getElementById('categoriaGasto').value = categoria;
    document.getElementById('importeGasto').focus();
};

function mostrarModoFormularioGasto(mostrar) {
    if (mostrar) {
        document.getElementById('formGasto').classList.remove('hidden');
        document.getElementById('btnMostrarFormGasto').classList.add('hidden');
        document.getElementById('seccionBalances').classList.add('hidden');
        document.getElementById('listaGastosContenedor').classList.add('hidden');
    } else {
        document.getElementById('formGasto').classList.add('hidden');
        document.getElementById('btnMostrarFormGasto').classList.remove('hidden');
        document.getElementById('seccionBalances').classList.remove('hidden');
        document.getElementById('listaGastosContenedor').classList.remove('hidden');
    }
}

function resetFormGasto() {
    idGastoEditando = null; document.getElementById('tituloFormGasto').innerText = 'NUEVO GASTO';
    document.getElementById('conceptoGasto').value = ''; document.getElementById('importeGasto').value = '';
    document.getElementById('categoriaGasto').value = '🏠 Piso';
    document.getElementById('btnGuardarGasto').innerText = 'GUARDAR'; document.getElementById('btnEliminarGasto').classList.add('hidden');
    document.getElementById('tipoDivisionGasto').value = 'iguales'; 
    window.articulosPendientesDeBorrar = []; 
    prepararFormularioGastos();
}

document.getElementById('btnMostrarFormGasto').addEventListener('click', () => {
    window.playRetroSound('blip');
    resetFormGasto();
    mostrarModoFormularioGasto(true);
});

document.getElementById('btnCancelarGasto').addEventListener('click', () => {
    window.playRetroSound('blip');
    mostrarModoFormularioGasto(false);
    window.articulosPendientesDeBorrar = []; 
});

document.getElementById('tipoDivisionGasto').addEventListener('change', () => prepararFormularioGastos(idGastoEditando ? getGastoObjPorId(idGastoEditando) : null));

function getGastoObjPorId(id) {
    return ultimosGastos.find(g => g.id === id);
}

function prepararFormularioGastos(gastoObj = null) {
    const selectPagador = document.getElementById('pagadorGasto'); const divInvolucrados = document.getElementById('involucradosGasto');
    const tipoDiv = document.getElementById('tipoDivisionGasto').value; const infoManual = document.getElementById('infoDivisionManual');
    
    selectPagador.innerHTML = ''; 
    participantesGrupo.forEach(p => { 
        const opt = document.createElement('option'); opt.value = p; opt.innerText = `${getAvatar(p)} ${p}`; 
        if (gastoObj && gastoObj.pagador === p) {
            opt.selected = true;
        } else if (!gastoObj && p === nombreUsuario) {
            opt.selected = true;
        }
        selectPagador.appendChild(opt); 
    }); 
    
    divInvolucrados.innerHTML = '';
    if (tipoDiv === 'iguales') {
        infoManual.classList.add('hidden');
        participantesGrupo.forEach(p => {
            let checked = true;
            if (gastoObj && Array.isArray(gastoObj.involucrados)) checked = typeof gastoObj.involucrados[0] === 'string' ? gastoObj.involucrados.includes(p) : gastoObj.involucrados.some(i => i.nombre === p);
            divInvolucrados.innerHTML += `<label><input type="checkbox" value="${p}" class="gasto-cb" ${checked ? 'checked' : ''}> <span style="color: ${getColor(p)}">${getAvatar(p)} ${p}</span></label>`;
        });
    } else {
        infoManual.classList.remove('hidden');
        participantesGrupo.forEach(p => {
            let val = '';
            if (gastoObj && Array.isArray(gastoObj.involucrados) && typeof gastoObj.involucrados[0] === 'object') { const found = gastoObj.involucrados.find(i => i.nombre === p); if (found) val = found.importe; }
            divInvolucrados.innerHTML += `<div class="manual-split-row"><span style="color: ${getColor(p)}">${getAvatar(p)} ${p}</span><input type="number" class="manual-importe" data-nombre="${p}" step="0.01" min="0" placeholder="0.00" value="${val}"></div>`;
        });
        document.querySelectorAll('.manual-importe').forEach(inp => inp.addEventListener('input', calcularFaltanteManual));
        document.getElementById('importeGasto').addEventListener('input', calcularFaltanteManual);
        calcularFaltanteManual();
    }
}

function calcularFaltanteManual() {
    const total = parseFloat(document.getElementById('importeGasto').value) || 0; let sumaParcial = 0;
    document.querySelectorAll('.manual-importe').forEach(inp => { sumaParcial += parseFloat(inp.value) || 0; });
    const info = document.getElementById('infoDivisionManual'); const dif = total - sumaParcial;
    if (dif > 0.001) info.innerHTML = `Faltan por asignar: <b>${dif.toFixed(2)}€</b> (Se auto-rellenará)`;
    else if (dif < -0.001) info.innerHTML = `<span style="color:#ff0055;">Has asignado <b>${Math.abs(dif).toFixed(2)}€</b> de más.</span>`;
    else info.innerHTML = `<span style="color:#2ec4b6;">Cuadrado perfecto ✅</span>`;
}

window.abrirEditarGastoPorId = function(idGasto) {
    const gastoObj = getGastoObjPorId(idGasto);
    if (!gastoObj) return;
    window.playRetroSound('blip');
    idGastoEditando = gastoObj.id; document.getElementById('tituloFormGasto').innerText = 'EDITAR GASTO';
    document.getElementById('conceptoGasto').value = gastoObj.concepto; document.getElementById('importeGasto').value = gastoObj.importe;
    document.getElementById('categoriaGasto').value = gastoObj.categoria || '🏠 Piso';
    
    if (gastoObj.involucrados.length > 0 && typeof gastoObj.involucrados[0] === 'object') { document.getElementById('tipoDivisionGasto').value = 'manual'; } else { document.getElementById('tipoDivisionGasto').value = 'iguales'; }
    prepararFormularioGastos(gastoObj);
    document.getElementById('btnGuardarGasto').innerText = 'ACTUALIZAR'; document.getElementById('btnEliminarGasto').classList.remove('hidden');
    mostrarModoFormularioGasto(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.getElementById('btnEliminarGasto').addEventListener('click', async () => {
    window.playRetroSound('hit');
    const seguro = await window.mostrarConfirmacion("Eliminar Gasto", "¿Seguro que quieres eliminar este gasto? Afectará a las cuentas.");
    if (!seguro) return;
    const boton = document.getElementById('btnEliminarGasto'); boton.disabled = true;
    try { 
        await deleteDoc(doc(db, "grupos", idPisoActual, "gastos", idGastoEditando)); 
        registrarActividad(`**${nombreUsuario}** eliminó un gasto del historial.`, "🗑️");
        document.getElementById('btnCancelarGasto').click(); 
    } 
    catch (error) { await window.mostrarAlerta("Error", "No se pudo eliminar."); } finally { boton.disabled = false; }
});

document.getElementById('btnGuardarGasto').addEventListener('click', async () => {
    const concepto = document.getElementById('conceptoGasto').value; const importe = parseFloat(document.getElementById('importeGasto').value);
    const pagador = document.getElementById('pagadorGasto').value; const tipo = document.getElementById('tipoDivisionGasto').value;
    const categoria = document.getElementById('categoriaGasto').value; 
    
    if (!concepto || isNaN(importe)) return await window.mostrarAlerta("Datos incompletos", "Rellena el concepto y el importe.");
    
    let involucradosData = [];
    if (tipo === 'iguales') {
        const cbs = document.querySelectorAll('.gasto-cb:checked');
        if(cbs.length === 0) return await window.mostrarAlerta("Aviso", "Selecciona al menos a una persona para dividir.");
        involucradosData = Array.from(cbs).map(cb => cb.value); 
    } else {
        let sumaRellenados = 0; let inputsVacios = [];
        document.querySelectorAll('.manual-importe').forEach(inp => {
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val > 0) { sumaRellenados += val; involucradosData.push({ nombre: inp.getAttribute('data-nombre'), importe: val }); } 
            else { inputsVacios.push(inp.getAttribute('data-nombre')); }
        });
        const restante = importe - sumaRellenados;
        if (restante < -0.01) return await window.mostrarAlerta("Error de cálculo", "Has asignado más dinero del gasto total.");
        if (restante > 0.01) {
            if (inputsVacios.length === 0) return await window.mostrarAlerta("Error", `Faltan ${restante.toFixed(2)}€ por asignar.`);
            const aCadaVacio = restante / inputsVacios.length;
            inputsVacios.forEach(nombre => { involucradosData.push({ nombre: nombre, importe: aCadaVacio }); });
        }
    }
    
    const boton = document.getElementById('btnGuardarGasto'); boton.innerText = "GUARDANDO..."; boton.disabled = true;
    const datosGasto = { concepto: concepto, importe: importe, pagador: pagador, involucrados: involucradosData, categoria: categoria }; 
    try {
        if (idGastoEditando) {
            await updateDoc(doc(db, "grupos", idPisoActual, "gastos", idGastoEditando), datosGasto);
            window.playRetroSound('blip');
            registrarActividad(`**${nombreUsuario}** editó el gasto "${concepto}".`, "✏️");
        } else { 
            datosGasto.fecha = new Date().toISOString(); 
            await addDoc(collection(db, "grupos", idPisoActual, "gastos"), datosGasto); 
            window.playRetroSound('blip');
            registrarActividad(`**${nombreUsuario}** añadió un gasto de ${importe}€ (${concepto}).`, "💸");
            
            if (window.articulosPendientesDeBorrar && window.articulosPendientesDeBorrar.length > 0) {
                const batch = writeBatch(db);
                for (let idArticulo of window.articulosPendientesDeBorrar) {
                    const docRef = doc(db, "grupos", idPisoActual, "compra", idArticulo);
                    batch.delete(docRef);
                }
                await batch.commit();
                registrarActividad(`**${nombreUsuario}** convirtió la lista de la compra en un gasto.`, "🛍️");
                window.articulosPendientesDeBorrar = []; 
            }
        }
        document.getElementById('btnCancelarGasto').click(); 
    } catch (error) { await window.mostrarAlerta("Error", "Fallo al guardar."); } finally { boton.disabled = false; }
});

document.getElementById('filtroMesGastos').addEventListener('change', () => {
    window.playRetroSound('blip');
    renderListaGastosFiltrada();
});

document.getElementById('btnArchivarGastos').addEventListener('click', async () => {
    if (ultimosGastos.length === 0) return await window.mostrarAlerta("Sin gastos", "El registro ya está vacío.");
    
    const hayDeudas = Object.values(ultimosBalances).some(saldo => Math.abs(saldo) > 0.02);
    if (hayDeudas) {
        window.playRetroSound('hit');
        return await window.mostrarAlerta("Cuentas pendientes", "Aún hay deudas sin saldar. Haz los Bizums pendientes para dejar los saldos a 0.00€ antes de liquidar el historial.");
    }

    const seguro = await window.mostrarConfirmacion("Liquidar Historial", "Todas las cuentas están saldadas (0.00€). ¿Quieres borrar todos los gastos antiguos para empezar un ciclo limpio?");
    if (seguro) {
        const btn = document.getElementById('btnArchivarGastos');
        btn.disabled = true;
        try {
            const batch = writeBatch(db);
            ultimosGastos.forEach(g => {
                batch.delete(doc(db, "grupos", idPisoActual, "gastos", g.id));
            });
            await batch.commit();
            window.playRetroSound('blip');
            registrarActividad(`**${nombreUsuario}** liquidó el historial de gastos con las cuentas saldadas.`, "🧹");
        } catch (e) {
            await window.mostrarAlerta("Error", "No se pudo liquidar el historial.");
        } finally {
            btn.disabled = false;
        }
    }
});

function actualizarOpcionesFiltroMes() {
    const select = document.getElementById('filtroMesGastos');
    if (!select) return;
    const valorPrevio = select.value;
    const mesesSet = new Set();
    const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    ultimosGastos.forEach(g => {
        const d = new Date(g.fecha);
        if (!isNaN(d)) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            mesesSet.add(key);
        }
    });

    select.innerHTML = '<option value="todos">📅 Todos</option>';
    Array.from(mesesSet).sort().reverse().forEach(key => {
        const [year, month] = key.split('-');
        const label = `${nombresMeses[parseInt(month, 10) - 1]} ${year}`;
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = label;
        select.appendChild(opt);
    });

    if ( Array.from(select.options).some(o => o.value === valorPrevio) ) {
        select.value = valorPrevio;
    } else {
        select.value = 'todos';
    }
}

function renderListaGastosFiltrada() {
    const listaHtml = document.getElementById('listaGastos');
    const filtro = document.getElementById('filtroMesGastos') ? document.getElementById('filtroMesGastos').value : 'todos';

    const gastosFiltrados = ultimosGastos.filter(g => {
        if (filtro === 'todos') return true;
        const d = new Date(g.fecha);
        if (isNaN(d)) return true;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === filtro;
    });

    if (gastosFiltrados.length === 0) {
        listaHtml.innerHTML = '<p style="color:var(--text-muted); text-align:center; margin: 12px 0;">Sin movimientos registrados.</p>';
        return;
    }

    listaHtml.innerHTML = '';
    gastosFiltrados.forEach((gasto) => {
        const divGasto = document.createElement('div');
        divGasto.className = 'item-lista gasto-row';
        divGasto.onclick = () => window.abrirEditarGastoPorId(gasto.id);

        const d = new Date(gasto.fecha);
        const fechaCorta = !isNaN(d) ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '';
        
        if (esGastoBizum(gasto)) {
            let receptor = gasto.receptor || '';
            if (!receptor && Array.isArray(gasto.involucrados) && gasto.involucrados.length > 0) {
                receptor = typeof gasto.involucrados[0] === 'object' ? gasto.involucrados[0].nombre : gasto.involucrados[0];
            }
            
            divGasto.innerHTML = `
                <div class="gasto-cat-icon" style="border-color: var(--arcade-green);">💸</div>
                <div class="item-info">
                    <span class="item-titulo">Pago por Bizum</span>
                    <span class="item-detalle">
                        <span style="color:${getColor(gasto.pagador)}; font-weight: 700;">${gasto.pagador}</span> 
                        ➔ 
                        <span style="color:${getColor(receptor)}; font-weight: 700;">${receptor}</span> 
                        • ${fechaCorta}
                    </span>
                </div>
                <span class="gasto-importe" style="color: var(--arcade-green);">${gasto.importe.toFixed(2)}€</span>`;
        } else {
            const esManual = typeof gasto.involucrados[0] === 'object';
            const esTodos = !esManual && gasto.involucrados.length === participantesGrupo.length;
            const infoReparto = esManual ? ' · Manual' : (!esTodos ? ` · ${gasto.involucrados.length}p` : '');
            const iconoCat = gasto.categoria ? gasto.categoria.split(' ')[0] : '🏠';
            
            divGasto.innerHTML = `
                <div class="gasto-cat-icon">${iconoCat}</div>
                <div class="item-info">
                    <span class="item-titulo">${gasto.concepto}</span>
                    <span class="item-detalle">
                        <span style="color:${getColor(gasto.pagador)}; font-weight: 700;">${getAvatar(gasto.pagador)} ${gasto.pagador}</span> 
                        • ${fechaCorta}${infoReparto}
                    </span>
                </div>
                <span class="gasto-importe">${gasto.importe.toFixed(2)}€</span>`;
        }
        listaHtml.appendChild(divGasto);
    });
}

function cargarListaGastos() {
    if (unsubGastos) unsubGastos();
    const q = query(collection(db, "grupos", idPisoActual, "gastos"), orderBy("fecha", "desc"));
    const listaHtml = document.getElementById('listaGastos');
    
    unsubGastos = onSnapshot(q, (querySnapshot) => {
        ultimosGastos = [];
        if (querySnapshot.empty) {
            actualizarOpcionesFiltroMes();
            listaHtml.innerHTML = '<p style="color:var(--text-muted); text-align:center; margin: 12px 0;">Sin movimientos registrados.</p>';
            document.getElementById('listaBalances').innerHTML = '<p style="color:var(--text-muted); grid-column: span 2; text-align:center; margin: 6px 0;">Sin actividad</p>';
            document.getElementById('listaDeudas').innerHTML = ''; 
            generarRankingGlobal(); 
            if(document.getElementById('vistaGraficos').classList.contains('hidden') === false) actualizarGraficos();
            return;
        }
        querySnapshot.forEach((docSnap) => {
            const gasto = docSnap.data(); gasto.id = docSnap.id; ultimosGastos.push(gasto); 
        });
        actualizarOpcionesFiltroMes();
        renderListaGastosFiltrada();
        calcularBalancesYDeudas(ultimosGastos);
        if(document.getElementById('vistaGraficos').classList.contains('hidden') === false) actualizarGraficos();
    });
}

function calcularBalancesYDeudas(gastos) {
    ultimosBalances = {}; participantesGrupo.forEach(p => ultimosBalances[p] = 0);
    gastos.forEach(gasto => {
        if (ultimosBalances[gasto.pagador] !== undefined) ultimosBalances[gasto.pagador] += gasto.importe;
        gasto.involucrados.forEach(inv => {
            if (typeof inv === 'string') { const costePP = gasto.importe / gasto.involucrados.length; if (ultimosBalances[inv] !== undefined) ultimosBalances[inv] -= costePP; } 
            else { if (ultimosBalances[inv.nombre] !== undefined) ultimosBalances[inv.nombre] -= inv.importe; }
        });
    });
    
    let htmlBalances = ''; let deudores = []; let acreedores = [];
    for (let persona in ultimosBalances) {
        let saldo = ultimosBalances[persona];
        let colorSaldo = saldo >= -0.01 && saldo <= 0.01 ? '#f0f4ff' : (saldo > 0 ? '#00ff66' : '#ff0055');
        let signo = saldo > 0.01 ? '+' : '';
        htmlBalances += `
            <div class="balance-item">
                <span style="color: ${getColor(persona)}; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${getAvatar(persona)} ${persona}</span>
                <span style="color: ${colorSaldo}; font-weight: 700;">${signo}${saldo.toFixed(2)}€</span>
            </div>`;
        if (saldo < -0.01) deudores.push({ nombre: persona, cantidad: Math.abs(saldo) });
        if (saldo > 0.01) acreedores.push({ nombre: persona, cantidad: saldo });
    }
    document.getElementById('listaBalances').innerHTML = htmlBalances;
    deudores.sort((a, b) => b.cantidad - a.cantidad); acreedores.sort((a, b) => b.cantidad - a.cantidad);
    
    let htmlDeudas = ''; let i = 0; let j = 0;
    if (deudores.length === 0) { 
        htmlDeudas = '<div style="background: rgba(46, 196, 182, 0.1); border: 1px solid #2ec4b6; border-radius: 4px; padding: 7px; text-align: center; color: #2ec4b6; font-weight: 700; font-size: 0.85em;">✅ CUENTAS SALDADAS</div>'; 
    } else {
        while (i < deudores.length && j < acreedores.length) {
            let deudor = deudores[i]; let acreedor = acreedores[j]; let transfer = Math.min(deudor.cantidad, acreedor.cantidad);
            htmlDeudas += `
                <div class="deuda-item">
                    <span style="min-width:0; overflow:hidden; text-overflow:ellipsis;">
                        <b style="color:${getColor(deudor.nombre)};">${deudor.nombre}</b> ➔ 
                        <b style="color:${getColor(acreedor.nombre)};">${acreedor.nombre}</b>: 
                        <b style="color:var(--arcade-yellow); margin-left:3px;">${transfer.toFixed(2)}€</b>
                    </span>
                    <button class="btn-bizum" onclick="registrarBizum('${deudor.nombre}', '${acreedor.nombre}', ${transfer})">BIZUM</button>
                </div>`;
            deudor.cantidad -= transfer; acreedor.cantidad -= transfer;
            if (deudor.cantidad < 0.01) i++; if (acreedor.cantidad < 0.01) j++;
        }
    }
    document.getElementById('listaDeudas').innerHTML = htmlDeudas;
    generarRankingGlobal();
}

window.registrarBizum = async function(deudor, acreedor, cantidad) {
    const seguro = await window.mostrarConfirmacion("Confirmar Bizum", `¿Confirmas que ${deudor} ha enviado ${cantidad.toFixed(2)}€ a ${acreedor}?`);
    if (!seguro) return;
    try {
        await addDoc(collection(db, "grupos", idPisoActual, "gastos"), {
            concepto: `Pago por Bizum`,
            importe: parseFloat(cantidad),
            pagador: deudor,
            receptor: acreedor,
            esBizum: true,
            involucrados: [{ nombre: acreedor, importe: parseFloat(cantidad) }],
            fecha: new Date().toISOString()
        });
        window.playRetroSound('coin_bizum');
        registrarActividad(`**${deudor}** ha saldado una cuenta de ${cantidad.toFixed(2)}€ a **${acreedor}**.`, "🤝");
    } catch(e) { await window.mostrarAlerta("Error", "No se pudo registrar el pago."); }
};

// --- MÓDULO LISTA COMPRA ---
document.getElementById('btnAñadirArticulo').addEventListener('click', async () => {
    const input = document.getElementById('inputNuevoArticulo'); const articulo = input.value.trim();
    if (!articulo) return; input.value = '';
    window.playRetroSound('blip');
    await addDoc(collection(db, "grupos", idPisoActual, "compra"), { articulo: articulo, añadidoPor: nombreUsuario, fecha: new Date().toISOString() });
    registrarActividad(`**${nombreUsuario}** añadió "${articulo}" a la lista de la compra.`, "🛒");
});

function cargarListaCompra() {
    if (unsubCompra) unsubCompra();
    const q = query(collection(db, "grupos", idPisoActual, "compra"), orderBy("fecha", "asc"));
    const listaHtml = document.getElementById('listaArticulos');
    
    unsubCompra = onSnapshot(q, (querySnapshot) => {
        if (querySnapshot.empty) { listaHtml.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Inventario vacío.</p>'; document.getElementById('btnComprarSeleccionados').disabled = true; return; }
        document.getElementById('btnComprarSeleccionados').disabled = false; listaHtml.innerHTML = '';
        querySnapshot.forEach(docSnap => {
            const item = docSnap.data();
            listaHtml.innerHTML += `
                <div class="manual-split-row" style="margin-bottom: 6px;">
                    <label style="flex:1; display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" class="cb-articulo" value="${docSnap.id}" data-nombre="${item.articulo}">
                        <span>${item.articulo} <small style="color:var(--text-muted); display:block; font-size:0.78em;">Pedido por <span style="color:${getColor(item.añadidoPor)}; font-weight: bold;">${getAvatar(item.añadidoPor)} ${item.añadidoPor}</span></small></span>
                    </label>
                    <button type="button" onclick="borrarArticulo('${docSnap.id}', '${item.articulo.replace(/'/g, "\\'")}')" style="background:none; border:none; box-shadow:none; width:auto; margin:0; padding:4px; color:var(--arcade-red); font-size:1.1em;">🗑️</button>
                </div>`;
        });
    });
}

window.borrarArticulo = async function(id, nombreArticulo) { 
    window.playRetroSound('hit');
    await deleteDoc(doc(db, "grupos", idPisoActual, "compra", id)); 
    registrarActividad(`**${nombreUsuario}** tachó "${nombreArticulo}" de la compra.`, "✔️");
};

document.getElementById('btnComprarSeleccionados').addEventListener('click', async () => {
    const seleccionados = Array.from(document.querySelectorAll('.cb-articulo:checked'));
    if (seleccionados.length === 0) return await window.mostrarAlerta("Atención", "Selecciona al menos un producto.");
    
    const nombresArticulos = seleccionados.map(cb => cb.getAttribute('data-nombre')).join(', ');
    const conceptoStr = nombresArticulos.length > 40 ? nombresArticulos.substring(0, 37) + '...' : nombresArticulos;
    
    resetFormGasto();
    document.getElementById('conceptoGasto').value = "🛒 Compra: " + conceptoStr;
    window.articulosPendientesDeBorrar = seleccionados.map(cb => cb.value); 
    
    activarPestaña('tabGastos', 'vistaGastos');
    mostrarModoFormularioGasto(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// --- MÓDULO LIMPIEZA, CALENDARIO & SISTEMA VAR ---
function resetFormZona() {
    idZonaEditando = null; document.getElementById('tituloFormZona').innerText = 'NUEVA ZONA';
    document.getElementById('nombreZona').value = ''; document.getElementById('frecuenciaZona').value = '1';
    document.getElementById('btnGuardarZona').innerText = 'GUARDAR'; document.getElementById('btnEliminarZona').classList.add('hidden');
    const div = document.getElementById('responsablesZona'); div.innerHTML = '';
    participantesGrupo.forEach(p => div.innerHTML += `<label><input type="checkbox" value="${p}" checked> <span style="color: ${getColor(p)}; font-weight: bold;">${getAvatar(p)} ${p}</span></label>`);
}

document.getElementById('btnMostrarFormZona').addEventListener('click', () => {
    window.playRetroSound('blip');
    resetFormZona(); document.getElementById('formZona').classList.remove('hidden'); document.getElementById('btnMostrarFormZona').classList.add('hidden');
});

document.getElementById('btnCancelarZona').addEventListener('click', () => {
    window.playRetroSound('blip');
    document.getElementById('formZona').classList.add('hidden'); document.getElementById('btnMostrarFormZona').classList.remove('hidden');
});

window.abrirEditarZona = function(idZona) {
    window.playRetroSound('blip');
    const zonaObj = zonasLimpiezaCache.find(z => z.id === idZona); if(!zonaObj) return;
    resetFormZona(); idZonaEditando = zonaObj.id; 
    document.getElementById('tituloFormZona').innerText = 'EDITAR ZONA'; document.getElementById('nombreZona').value = zonaObj.nombre_zona;
    document.getElementById('frecuenciaZona').value = zonaObj.frecuencia || 1;
    document.querySelectorAll('#responsablesZona input[type="checkbox"]').forEach(cb => { cb.checked = zonaObj.responsables.includes(cb.value); });
    document.getElementById('btnGuardarZona').innerText = 'ACTUALIZAR'; document.getElementById('btnEliminarZona').classList.remove('hidden');
    document.getElementById('formZona').classList.remove('hidden'); document.getElementById('btnMostrarFormZona').classList.add('hidden');
    document.getElementById('formZona').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('btnEliminarZona').addEventListener('click', async () => {
    window.playRetroSound('hit');
    const seguro = await window.mostrarConfirmacion("Eliminar Zona", "¿Borrar esta misión de limpieza definitivamente?");
    if (!seguro) return;
    try { 
        await deleteDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZonaEditando)); 
        registrarActividad(`**${nombreUsuario}** eliminó una zona de limpieza.`, "🗑️");
        document.getElementById('btnCancelarZona').click(); 
    } catch (e) { await window.mostrarAlerta("Error", "No se pudo borrar."); }
});

function obtenerLunes(fecha) {
    let d = new Date(fecha); let day = d.getDay(); let diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).setHours(0,0,0,0);
}

document.getElementById('btnGuardarZona').addEventListener('click', async () => {
    const nombreZona = document.getElementById('nombreZona').value; const btn = document.getElementById('btnGuardarZona');
    const freq = parseInt(document.getElementById('frecuenciaZona').value) || 1;
    const cbs = document.querySelectorAll('#responsablesZona input[type="checkbox"]:checked'); const resp = Array.from(cbs).map(cb => cb.value);
    if (!nombreZona || resp.length === 0) return await window.mostrarAlerta("Faltan datos", "Indica el nombre y quién limpia.");
    btn.disabled = true; const datos = { nombre_zona: nombreZona, responsables: resp, frecuencia: freq };
    try {
        if (idZonaEditando) {
            await updateDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZonaEditando), datos);
            window.playRetroSound('blip');
            registrarActividad(`**${nombreUsuario}** modificó la limpieza del ${nombreZona}.`, "✏️");
        } else { 
            datos.fecha_base = new Date(obtenerLunes(new Date())).toISOString(); 
            await addDoc(collection(db, "grupos", idPisoActual, "zonas_limpieza"), datos); 
            window.playRetroSound('blip');
            registrarActividad(`**${nombreUsuario}** creó la tarea de limpieza: ${nombreZona}.`, "🧹");
        }
        document.getElementById('btnCancelarZona').click();
    } catch (e) { await window.mostrarAlerta("Error", "Fallo al guardar."); } finally { btn.disabled = false; }
});

window.marcarLimpieza = async function(idZona, timestamp, esTarde = false, nombreZona = '') {
    let valor = esTarde ? `${nombreUsuario}_Tarde` : nombreUsuario;
    try { 
        await updateDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZona), { 
            [`semanas_hechas.${timestamp}`]: valor,
            [`var_votos.${timestamp}`]: deleteField()
        }); 
        window.playRetroSound('powerup');
        registrarActividad(`**${nombreUsuario}** confirmó la limpieza del ${nombreZona}.`, esTarde ? "⚠️" : "✨");
    } 
    catch (e) { await window.mostrarAlerta("Error", "No se pudo confirmar."); }
};

// --- FUNCIÓN DEL VAR (IMPUGNAR TAREA ENTRE 2 COMPAÑEROS) ---
window.votarVar = async function(idZona, timestamp, infractor, nombreZona) {
    if (nombreUsuario === infractor) return;

    const zonaObj = zonasLimpiezaCache.find(z => z.id === idZona);
    if (!zonaObj) return;

    const votosActuales = (zonaObj.var_votos && Array.isArray(zonaObj.var_votos[timestamp])) ? [...zonaObj.var_votos[timestamp]] : [];
    if (votosActuales.includes(nombreUsuario)) {
        return await window.mostrarAlerta("📺 VAR", "Ya has emitido tu voto de VAR en esta tarea.");
    }

    const faltan = 2 - votosActuales.length;
    const msgConfirm = faltan === 2 
        ? `¿Impugnar la limpieza de "${nombreZona}" de ${infractor}?\n\nFaltaría 1 voto más de otro compañero para anularla y meterle +1 falta por intento de tongo.`
        : `Ya hay 1 voto contra ${infractor} en "${nombreZona}".\n\n¿Confirmas el 2º voto del VAR para anular la tarea y sancionarle con +1 falta por intento de tongo?`;

    const seguro = await window.mostrarConfirmacion("📺 REVISIÓN DEL VAR", msgConfirm);
    if (!seguro) return;

    votosActuales.push(nombreUsuario);

    try {
        if (votosActuales.length >= 2) {
            await updateDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZona), {
                [`semanas_hechas.${timestamp}`]: deleteField(),
                [`var_votos.${timestamp}`]: deleteField()
            });

            const actualAjuste = window.ajustesFaltasGrupo[infractor] || 0;
            await updateDoc(doc(db, "grupos", idPisoActual), {
                [`ajustes_faltas.${infractor}`]: actualAjuste + 1
            });

            window.playRetroSound('hit');
            registrarActividad(`📺 VAR: **${votosActuales[0]}** y **${votosActuales[1]}** anularon "${nombreZona}". ¡+1 Falta a **${infractor}** por intento de tongo!`, "🚩");
            await window.mostrarAlerta("📺 SENTENCIA DEL VAR", `¡Tongo confirmado! "${nombreZona}" vuelve a estar pendiente y ${infractor} recibe +1 falta.`);
        } else {
            await updateDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZona), {
                [`var_votos.${timestamp}`]: votosActuales
            });
            window.playRetroSound('blip');
            registrarActividad(`📺 **${nombreUsuario}** pidió revisión del VAR en "${nombreZona}" (**${infractor}**) [1/2].`, "👀");
        }
    } catch (e) {
        await window.mostrarAlerta("Error", "No se pudo registrar el voto del VAR.");
    }
};

window.renderFaltasPolicial = function() {
    const cont = document.getElementById('seccionFaltasPolicial');
    const lista = document.getElementById('listaFaltasPolicial');
    if (!cont || !lista) return;

    let infractores = Object.keys(ultimosStrikes).filter(u => ultimosStrikes[u] > 0);
    infractores.sort((a, b) => ultimosStrikes[b] - ultimosStrikes[a]);
    
    if (infractores.length === 0) {
        cont.classList.add('hidden');
        return;
    }
    
    cont.classList.remove('hidden');
    lista.innerHTML = '';
    
    infractores.forEach(infractor => {
        let faltas = ultimosStrikes[infractor];
        let nivel = faltas >= 3 ? "DEBE RONDA AL PISO" : (faltas === 2 ? "REINCIDENTE" : "PRIMER AVISO");
        let color = faltas >= 3 ? "#ff0055" : (faltas === 2 ? "#fb5607" : "#ffbe0b");
        
        lista.innerHTML += `
            <div style="background: #151828; border: 2px solid ${color}; padding: 10px 12px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="font-size: 1.8em;">${getAvatar(infractor)}</div>
                    <div>
                        <div style="font-weight: 700; color: ${getColor(infractor)}; font-size: 1.05em;">${infractor}</div>
                        <div style="color: ${color}; font-size: 0.75em; font-weight: 700;">[ ${nivel} ]</div>
                    </div>
                </div>
                <div style="text-align: right; font-family: var(--font-pixel);">
                    <div style="color: ${color}; font-size: 1.1em;">${faltas}x</div>
                    <div style="color: ${color}; font-size: 0.55em; margin-top: 3px;">FALTA${faltas > 1 ? 'S' : ''}</div>
                </div>
            </div>
        `;
    });
};

function recalcularStrikesTotales() {
    strikesAutomaticos = {};
    ultimosStrikes = {};
    participantesGrupo.forEach(p => {
        strikesAutomaticos[p] = 0;
        ultimosStrikes[p] = 0;
    });

    let minTime = Math.min(...zonasLimpiezaCache.map(z => new Date(z.fecha_base).getTime()));
    if (zonasLimpiezaCache.length > 0 && isFinite(minTime)) {
        let t = minTime;
        let hoy = new Date(obtenerLunes(new Date())).getTime();
        while (t < hoy) {
            let asigs = calcularAsignacionesParaSemana(new Date(t));
            asigs.forEach(a => {
                let hechas = a.zonaRef.semanas_hechas || {};
                let conf = hechas[t];
                if (!conf || String(conf).includes('_Tarde')) {
                    if (strikesAutomaticos[a.leTocaA] !== undefined) {
                        strikesAutomaticos[a.leTocaA]++;
                    }
                }
            });
            t += 7 * 86400000;
        }
    }

    participantesGrupo.forEach(p => {
        const ajuste = window.ajustesFaltasGrupo[p] || 0;
        ultimosStrikes[p] = Math.max(0, (strikesAutomaticos[p] || 0) + ajuste);
    });

    let morososLimpieza = Object.keys(ultimosStrikes).filter(u => ultimosStrikes[u] >= 3);
    if (morososLimpieza.length > 0) {
        let hoyStr = new Date().toISOString().split('T')[0];
        if (localStorage.getItem('alerta_strikes_dia') !== hoyStr) {
            localStorage.setItem('alerta_strikes_dia', hoyStr);
            setTimeout(() => { window.playRetroSound('hit'); window.mostrarAlerta("⚠️ GAME OVER DE LIMPIEZA", "Los siguientes jugadores acumulan 3 o más misiones fallidas y deben ronda:\n\n" + morososLimpieza.join("\n")); }, 1000);
        }
    }

    renderVistaSemanaActual(); 
    renderCalendarioMensual(); 
    if (typeof window.renderFaltasPolicial === 'function') window.renderFaltasPolicial();
    if (!document.getElementById('vistaMaster').classList.contains('hidden')) renderPanelMaestro();
    generarRankingGlobal();
}

function cargarListaLimpieza() {
    if (unsubLimpieza) unsubLimpieza();
    const q = query(collection(db, "grupos", idPisoActual, "zonas_limpieza"));
    
    unsubLimpieza = onSnapshot(q, (snap) => {
        zonasLimpiezaCache = [];
        if (!snap.empty) {
            snap.forEach(d => { const z = d.data(); z.id = d.id; zonasLimpiezaCache.push(z); });
            zonasLimpiezaCache.sort((a, b) => a.nombre_zona.localeCompare(b.nombre_zona));
        }
        recalcularStrikesTotales();
    });
}

function calcularAsignacionesParaSemana(fechaLunes) {
    let asignaciones = []; let asignados = []; 
    zonasLimpiezaCache.forEach((zona, i) => {
        const freq = zona.frecuencia || 1;
        let sem = Math.floor((fechaLunes.getTime() - new Date(zona.fecha_base).getTime()) / 604800000); 
        if (sem < 0 || sem % freq !== 0) return;
        let periodos = Math.floor(sem / freq);
        let idIdeal = (periodos + i) % zona.responsables.length; let toca = zona.responsables[idIdeal]; let libre = false;
        for (let j = 0; j < zona.responsables.length; j++) {
            let cand = zona.responsables[(idIdeal + j) % zona.responsables.length];
            if (!asignados.includes(cand)) { toca = cand; asignados.push(cand); libre = true; break; }
        }
        if (!libre) toca = zona.responsables[idIdeal];
        asignaciones.push({ idZona: zona.id, nombre_zona: zona.nombre_zona, responsables: zona.responsables, leTocaA: toca, zonaRef: zona, freq: freq });
    });
    return asignaciones;
}

function renderVistaSemanaActual() {
    const list = document.getElementById('listaLimpieza');
    if (zonasLimpiezaCache.length === 0) return list.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No hay misiones configuradas.</p>';
    
    const tsActual = new Date(obtenerLunes(new Date())).getTime();
    let html = '';

    let minTime = Math.min(...zonasLimpiezaCache.map(z => new Date(z.fecha_base).getTime()));
    if (zonasLimpiezaCache.length > 0 && isFinite(minTime)) {
        let t = minTime;
        while (t < tsActual) {
            let asigsPasadas = calcularAsignacionesParaSemana(new Date(t));
            asigsPasadas.forEach(a => {
                if (a.leTocaA === nombreUsuario) {
                    let hechas = a.zonaRef.semanas_hechas || {};
                    if (!hechas[t]) {
                        html += `
                            <div class="item-lista" style="background-color: rgba(255, 0, 85, 0.12); padding: 10px; border-radius: 4px; border: 2px solid var(--arcade-red); margin-bottom: 8px;">
                                <div class="item-info">
                                    <span class="item-titulo" style="color: var(--arcade-red);">⚠️ ATRASADA: ${a.nombre_zona}</span>
                                    <span class="item-detalle">Semana del ${new Date(t).toLocaleDateString()}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                                    <button type="button" class="btn-bizum" style="background:var(--arcade-red); color:white;" onclick="marcarLimpieza('${a.idZona}', ${t}, true, '${a.nombre_zona.replace(/'/g, "\\'")}')">HECHA TARDE</button>
                                </div>
                            </div>`;
                    }
                }
            });
            t += 7 * 86400000;
        }
    }

    const asigs = calcularAsignacionesParaSemana(new Date(tsActual)); 
    if(asigs.length === 0 && html === '') return list.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Semana libre. No toca limpiar nada.</p>';
    
    asigs.forEach(a => {
        const esMi = a.leTocaA === nombreUsuario;
        let hechas = a.zonaRef.semanas_hechas || {}; 
        let conf = hechas[tsActual];
        let estaHecha = !!conf;
        let votosVar = (a.zonaRef.var_votos && Array.isArray(a.zonaRef.var_votos[tsActual])) ? a.zonaRef.var_votos[tsActual] : [];
        
        let botonHTML = "";
        if (estaHecha) { 
            let varHTML = "";
            if (!esMi) {
                if (votosVar.includes(nombreUsuario)) {
                    varHTML = `<span style="color:var(--arcade-orange); font-family:var(--font-pixel); font-size:0.52em;">🚩 VOTADO (${votosVar.length}/2)</span>`;
                } else {
                    varHTML = `<button type="button" class="btn-bizum" style="background:var(--arcade-red); color:#fff; padding:4px 7px; font-size:7.5px; box-shadow: 0 2px 0 #80002a;" onclick="votarVar('${a.idZona}', ${tsActual}, '${a.leTocaA}', '${a.nombre_zona.replace(/'/g, "\\'")}')">🚩 VAR (${votosVar.length}/2)</button>`;
                }
            } else if (votosVar.length > 0) {
                varHTML = `<span style="color:var(--arcade-orange); font-family:var(--font-pixel); font-size:0.52em;">👀 EN VAR (${votosVar.length}/2)</span>`;
            }

            botonHTML = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
                    <span style="color:var(--arcade-green); font-family:var(--font-pixel); font-size:0.65em;">✅ CLEAR!</span>
                    ${varHTML}
                </div>`; 
        } 
        else if (esMi) { 
            botonHTML = `<button type="button" class="btn-bizum" onclick="marcarLimpieza('${a.idZona}', ${tsActual}, false, '${a.nombre_zona.replace(/'/g, "\\'")}')">CONFIRMAR</button>`; 
        }
        else { 
            botonHTML = `<span style="color:var(--text-muted); font-size:0.85em;">Pendiente...</span>`; 
        }
        
        html += `
            <div class="item-lista ${esMi && !estaHecha ? 'mi-turno' : ''}">
                <div class="item-info">
                    <span class="item-titulo">${a.nombre_zona}</span>
                    <span class="item-detalle">Frecuencia: cada ${a.freq == 1 ? 'semana' : a.freq + ' semanas'}</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                    <div style="font-weight: 700; font-size: 1em; color: ${esMi ? 'var(--arcade-yellow)' : getColor(a.leTocaA)}">${esMi ? '▶ ¡TU TURNO!' : getAvatar(a.leTocaA) + ' ' + a.leTocaA}</div>
                    <div style="display:flex; align-items:center; gap: 8px;">
                        ${botonHTML}
                        <button type="button" style="background:none; border:none; box-shadow:none; width:auto; padding:0; cursor:pointer; font-size:1.1em; margin:0;" onclick='window.abrirEditarZona("${a.idZona}")'>✏️</button>
                    </div>
                </div>
            </div>`;
    });
    
    list.innerHTML = html;
}

function renderCalendarioMensual() {
    const cont = document.getElementById('contenedorSemanasMes');
    if (zonasLimpiezaCache.length === 0) return cont.innerHTML = '<p style="color:var(--text-muted);">No hay zonas.</p>';
    const mes = fechaCalendario.getMonth(); const anio = fechaCalendario.getFullYear();
    const nombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    document.getElementById('textoMesAnio').innerText = `${nombres[mes]} ${anio}`; cont.innerHTML = '';
    let sem = []; let pivot = new Date(obtenerLunes(new Date(anio, mes, 1)));
    while (pivot.getMonth() === mes || (new Date(pivot.getTime() + 6*86400000)).getMonth() === mes) { sem.push(new Date(pivot)); pivot = new Date(pivot.getTime() + 7 * 86400000); }
    const hoy = new Date(obtenerLunes(new Date())).getTime();
    sem.forEach(l => {
        const dom = new Date(l.getTime() + 6*86400000); const esHoy = l.getTime() === hoy;
        const asigsSem = calcularAsignacionesParaSemana(l);
        if(asigsSem.length === 0) return;
        
        let html = `<div style="background:#090a10; border:${esHoy ? '2px solid var(--arcade-green)' : '2px solid #262b44'}; border-radius:4px; padding:12px; margin-bottom:12px;"><h5 style="color:var(--border-highlight); border-bottom:1px solid #262b44; padding-bottom:6px; font-size:0.7em; margin-bottom:8px;">🗓️ ${l.getDate()} ${nombres[l.getMonth()].substring(0,3)} - ${dom.getDate()} ${nombres[dom.getMonth()].substring(0,3)} ${esHoy ? '<span style="background:var(--arcade-green); color:#000; padding:2px 5px; border-radius:2px; font-size:0.85em; margin-left:4px;">ACTUAL</span>' : ''}</h5>`;
        asigsSem.forEach(a => {
            const esM = a.leTocaA === nombreUsuario; 
            let hechas = a.zonaRef.semanas_hechas || {}; 
            let conf = hechas[l.getTime()]; 
            let check = conf ? (String(conf).includes('_Tarde') ? '☑️ ' : '✅ ') : '';
            html += `<div style="display:flex; justify-content:space-between; margin-bottom:6px; ${esM && !conf ? 'background: rgba(46, 196, 182, 0.12); padding: 4px 8px; border-radius: 2px; border-left: 3px solid var(--arcade-green);' : 'padding: 4px 8px;'}"><span style="font-weight:600;">${a.nombre_zona}</span><span style="color:${esM && !conf ? 'var(--arcade-yellow)' : getColor(a.leTocaA)}; font-weight:700;">${check}${esM ? '¡Te toca!' : getAvatar(a.leTocaA) + ' ' + a.leTocaA}</span></div>`;
        });
        cont.innerHTML += html + `</div>`;
    });
}

document.getElementById('btnToggleCalendario').addEventListener('click', () => {
    window.playRetroSound('blip');
    const c = document.getElementById('calendarioMensual'); const s = document.getElementById('listaLimpieza'); const b = document.getElementById('btnToggleCalendario');
    if (c.classList.contains('hidden')) { c.classList.remove('hidden'); s.classList.add('hidden'); b.innerText = "📅 VER SEMANA"; } else { c.classList.add('hidden'); s.classList.remove('hidden'); b.innerText = "📅 VER MES"; }
});

document.getElementById('btnMesAnterior').addEventListener('click', () => { window.playRetroSound('blip'); fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() - 1, 1); renderCalendarioMensual(); });
document.getElementById('btnMesSiguiente').addEventListener('click', () => { window.playRetroSound('blip'); fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 1); renderCalendarioMensual(); });

// --- MÓDULO TABLÓN (INFO) ---
function cargarTablon(tablon) {
    document.getElementById('displayWifiNombre').innerText = tablon.wifi_nombre || "No configurado";
    document.getElementById('displayWifiPass').innerText = tablon.wifi_pass || "Sin contraseña";
    document.getElementById('displayIban').innerText = tablon.iban || "No configurado";
    document.getElementById('displayNotas').innerText = tablon.notas || "Sin notas adicionales.";
    
    document.getElementById('inputWifiNombre').value = tablon.wifi_nombre || "";
    document.getElementById('inputWifiPass').value = tablon.wifi_pass || "";
    document.getElementById('inputIban').value = tablon.iban || "";
    document.getElementById('inputNotasTablon').value = tablon.notas || "";
    
    const qrContainer = document.getElementById('contenedorQR'); const qrImg = document.getElementById('imgWifiQR');
    if (tablon.wifi_nombre && tablon.wifi_pass) {
        const wifiString = `WIFI:S:${tablon.wifi_nombre};T:WPA;P:${tablon.wifi_pass};;`;
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(wifiString)}`;
        qrContainer.classList.remove('hidden');
    } else { qrContainer.classList.add('hidden'); }
}

document.getElementById('btnEditarTablon').addEventListener('click', () => { window.playRetroSound('blip'); document.getElementById('tablonDisplay').classList.add('hidden'); document.getElementById('tablonForm').classList.remove('hidden'); });
document.getElementById('btnCancelarTablon').addEventListener('click', () => { window.playRetroSound('blip'); document.getElementById('tablonForm').classList.add('hidden'); document.getElementById('tablonDisplay').classList.remove('hidden'); });

document.getElementById('btnGuardarTablon').addEventListener('click', async () => {
    const nTablon = { wifi_nombre: document.getElementById('inputWifiNombre').value.trim(), wifi_pass: document.getElementById('inputWifiPass').value.trim(), iban: document.getElementById('inputIban').value.trim(), notas: document.getElementById('inputNotasTablon').value.trim() };
    try {
        document.getElementById('btnGuardarTablon').innerText = "GUARDANDO...";
        await updateDoc(doc(db, "grupos", idPisoActual), { tablon: nTablon });
        window.playRetroSound('blip');
        cargarTablon(nTablon); document.getElementById('btnCancelarTablon').click();
    } catch (e) { await window.mostrarAlerta("Error", "No se pudo guardar la Info."); } finally { document.getElementById('btnGuardarTablon').innerText = "GUARDAR"; }
});

document.getElementById('btnCopiarIban').addEventListener('click', async () => {
    const iban = document.getElementById('displayIban').innerText; if(iban === "No configurado") return;
    try { await navigator.clipboard.writeText(iban); window.playRetroSound('blip'); await window.mostrarAlerta("Copiado", "IBAN copiado al portapapeles."); } catch (e) { await window.mostrarAlerta("Copia manual", iban); }
});

document.getElementById('btnCopiarWifi').addEventListener('click', async () => {
    const pass = document.getElementById('displayWifiPass').innerText; if(pass === "-" || pass === "Sin contraseña") return;
    try { await navigator.clipboard.writeText(pass); window.playRetroSound('blip'); await window.mostrarAlerta("Copiado", "Contraseña copiada al portapapeles."); } catch (e) { await window.mostrarAlerta("Contraseña", pass); }
});

// --- MÓDULO RANKING + NIVELES RPG (LVL & XP) ---
function generarHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; 
    }
    return Math.abs(hash);
}

function generarRankingGlobal() {
    if (participantesGrupo.length === 0) return;
    const cont = document.getElementById('contenidoRanking');
    
    let stats = {};
    participantesGrupo.forEach(p => {
        stats[p] = {
            nombre: p,
            saldo: ultimosBalances[p] || 0,
            pagado: 0,
            numTickets: 0,
            numBizums: 0,
            gastoOcio: 0,
            gastoFacturas: 0,
            gastoPiso: 0,
            limpiezasATiempo: 0,
            limpiezasTarde: 0,
            strikes: ultimosStrikes[p] || 0,
            xp: 0,
            lvl: 1
        };
    });

    ultimosGastos.forEach(g => {
        if (esGastoBizum(g)) {
            if (stats[g.pagador]) stats[g.pagador].numBizums += 1;
            return;
        }
        if (stats[g.pagador]) {
            stats[g.pagador].pagado += g.importe;
            stats[g.pagador].numTickets += 1;
            let cat = g.categoria || "🏠 Piso";
            if (cat.includes("Ocio")) stats[g.pagador].gastoOcio += g.importe;
            else if (cat.includes("Facturas")) stats[g.pagador].gastoFacturas += g.importe;
            else stats[g.pagador].gastoPiso += g.importe;
        }
    });

    zonasLimpiezaCache.forEach(z => {
        let hechas = z.semanas_hechas || {};
        Object.values(hechas).forEach(val => {
            let strVal = String(val);
            if (strVal.includes('_Tarde')) {
                let nombre = strVal.replace('_Tarde', '');
                if (stats[nombre]) stats[nombre].limpiezasTarde += 1;
            } else if (stats[strVal]) {
                stats[strVal].limpiezasATiempo += 1;
            }
        });
    });

    Object.values(stats).forEach(u => {
        let xpBruto = (u.limpiezasATiempo * 50) + (u.limpiezasTarde * 15) + (u.numTickets * 15) + (u.numBizums * 20) - (u.strikes * 30);
        u.xp = Math.max(0, xpBruto);
        u.lvl = Math.floor(u.xp / 100) + 1;
    });

    let usuarios = Object.values(stats);
    let asignaciones = {};
    let yaAsignados = new Set();

    const asignarTitulo = (userObj, titulo, desc, color, emoji) => {
        asignaciones[userObj.nombre] = { nombre: userObj.nombre, titulo, desc, color, emoji };
        yaAsignados.add(userObj.nombre);
    };

    // 1. TÍTULOS POR DEUDAS Y SALDOS EXTREMOS
    let porSaldo = [...usuarios].sort((a, b) => b.saldo - a.saldo);
    let maxAcreedor = porSaldo.find(u => u.saldo > 0.5 && !yaAsignados.has(u.nombre));
    if (maxAcreedor) {
        if (maxAcreedor.saldo >= 40) {
            asignarTitulo(maxAcreedor, "El FMI del Piso", "Rescatando la economía de esta casa a golpe de talonario.", "#00e5ff", "🏦");
        } else {
            asignarTitulo(maxAcreedor, "El Sugar Daddy", "El banco central del piso. Todos le deben.", "#2ec4b6", "🤑");
        }
    }

    let maxDeudor = [...porSaldo].reverse().find(u => u.saldo < -0.5 && !yaAsignados.has(u.nombre));
    if (maxDeudor) {
        if (maxDeudor.saldo <= -40) {
            asignarTitulo(maxDeudor, "El Agujero Negro", "Absorbe el presupuesto del piso sin devolver nada.", "#ff0055", "🕳️");
        } else {
            asignarTitulo(maxDeudor, "Peligro Financiero", "Cobradores del frac en camino.", "#ff0055", "💸");
        }
    }

    // 2. TÍTULOS POR MÉRITOS DE LIMPIEZA
    let porLimpieza = [...usuarios].sort((a, b) => b.limpiezasATiempo - a.limpiezasATiempo);
    let mejorLimpiador = porLimpieza.find(u => u.limpiezasATiempo >= 2 && u.strikes === 0 && !yaAsignados.has(u.nombre));
    if (mejorLimpiador) {
        asignarTitulo(mejorLimpiador, "Don Limpio", "El terror de las bacterias. Cumple sus misiones sin fallar.", "#00e5ff", "✨");
    }

    // 3. TÍTULOS POR CATEGORÍA DE GASTO
    let porOcio = [...usuarios].sort((a, b) => b.gastoOcio - a.gastoOcio);
    let reyOcio = porOcio.find(u => u.gastoOcio > 10 && !yaAsignados.has(u.nombre));
    if (reyOcio) {
        asignarTitulo(reyOcio, "El Promotor de Fiestas", "Si hay cervezas, cenas o planes, su tarjeta sale primero.", "#bf5af2", "🍻");
    }

    let porFacturas = [...usuarios].sort((a, b) => b.gastoFacturas - a.gastoFacturas);
    let reyFacturas = porFacturas.find(u => u.gastoFacturas > 10 && !yaAsignados.has(u.nombre));
    if (reyFacturas) {
        asignarTitulo(reyFacturas, "Ministro de Energía", "Mantiene la luz, el agua y el Wi-Fi vivos en esta base.", "#ff9f0a", "⚡");
    }

    let porGastoPiso = [...usuarios].sort((a, b) => b.gastoPiso - a.gastoPiso);
    let intendente = porGastoPiso.find(u => u.gastoPiso > 10 && !yaAsignados.has(u.nombre));
    if (intendente) {
        asignarTitulo(intendente, "El Intendente", "Proveedor oficial de suministros y supervivencia del hogar.", "#32d74b", "🧻");
    }

    // 4. TÍTULOS POR VOLUMEN DE PAGOS Y TICKETS
    let porPagado = [...usuarios].sort((a, b) => b.pagado - a.pagado);
    let inversor = porPagado.find(u => u.pagado > 0 && !yaAsignados.has(u.nombre));
    if (inversor) {
        asignarTitulo(inversor, "El Inversor", "Siempre paga primero. Dueño de todo.", "#00e5ff", "📈");
    }

    let porTickets = [...usuarios].sort((a, b) => b.numTickets - a.numTickets);
    let pistolero = porTickets.find(u => u.numTickets >= 2 && !yaAsignados.has(u.nombre));
    if (pistolero) {
        asignarTitulo(pistolero, "Pistolero del Ticket", "El más rápido sacando la cartera en cualquier compra.", "#ffbe0b", "🤠");
    }

    // 5. TÍTULOS POR ESTADO ESPECÍFICO
    usuarios.forEach(u => {
        if (yaAsignados.has(u.nombre)) return;
        if (u.limpiezasTarde > 0) {
            asignarTitulo(u, "El 'Más Vale Tarde'", "Limpia fuera de plazo, pero al menos termina cumpliendo.", "#ffbe0b", "⏳");
        } else if (Math.abs(u.saldo) <= 0.01 && u.pagado > 0) {
            asignarTitulo(u, "El Suizo", "Neutralidad pura. Ni debe ni le deben.", "#86868b", "🇨🇭");
        } else if (u.pagado === 0 && u.limpiezasATiempo === 0 && u.strikes === 0 && ultimosGastos.length > 2) {
            asignarTitulo(u, "El Fantasma", "Cero actividad. ¿Sigue viviendo aquí?", "#86868b", "👻");
        }
    });

    // 6. POOL GENERAL
    let titulosExtra = [
        { t: "El 'Mañana te hago Bizum'", d: "Le cuesta soltar la pasta.", c: '#ff9f0a', e: "🐢" },
        { t: "El Santo Patrón", d: "Cuentas saneadas al 100%. Un ejemplo.", c: '#32d74b', e: "😇" },
        { t: "El Suizo", d: "Neutralidad pura. Ni debe ni le deben.", c: '#86868b', e: "🇨🇭" },
        { t: "El Contable", d: "Calcula todo al céntimo exacto.", c: '#0a84ff', e: "🧑‍💻" },
        { t: "El Sibarita", d: "Se ha gastado su parte en cosas caras.", c: '#bf5af2', e: "🍷" },
        { t: "El Fantasma", d: "Cero actividad. ¿Sigue viviendo aquí?", c: '#86868b', e: "👻" },
        { t: "El Inquilino Estándar", d: "Cumple su función vital sin ruido.", c: '#86868b', e: "🧍" },
        { t: "El Protegido", d: "Siempre hay alguien que le paga las cosas.", c: '#ff453a', e: "🧸" },
        { t: "El Ninja", d: "Entra y sale de casa sin que nadie lo escuche.", c: '#86868b', e: "🥷" },
        { t: "El Okupa del Salón", d: "El sofá ya tiene la forma de su espalda.", c: '#ff9f0a', e: "🛋️" },
        { t: "El DJ de Ducha", d: "Conciertos diarios con el bote de champú.", c: '#0a84ff', e: "🎤" },
        { t: "El Coleccionista", d: "Acumula tazas y vasos de toda la casa en su cuarto.", c: '#ff453a', e: "☕" },
        { t: "El Sommelier", d: "Experto catador de cervezas de marca blanca.", c: '#ffd60a', e: "🍻" },
        { t: "El Nómada", d: "Pasa más tiempo fuera que en su propia casa.", c: '#32d74b', e: "🏕️" },
        { t: "El Búho Nocturno", d: "Su día empieza cuando los demás cenan.", c: '#5e5ce6', e: "🦉" },
        { t: "El Rey del Delivery", d: "El repartidor de Glovo ya es uno más de la familia.", c: '#ff9f0a', e: "🍔" },
        { t: "El Termostato", d: "Tiene frío en verano y calor en invierno.", c: '#64d2ff', e: "🌡️" },
        { t: "El Tetris de Basura", d: "Experto en apilar cosas para no bajar la bolsa.", c: '#ff453a', e: "🗑️" },
        { t: "El Creador de Mitos", d: "Las leyendas dicen que una vez limpió por gusto.", c: '#bf5af2', e: "🦄" },
        { t: "El Manitas", d: "Arregla las cosas con cinta americana y fe.", c: '#86868b', e: "🛠️" },
        { t: "El Ladrón de Cables", d: "Tus cargadores siempre acaban mágicamente en su cuarto.", c: '#ff453a', e: "🔌" },
        { t: "El Reloj Suizo", d: "Sus horarios de comidas no se alteran ni con un meteorito.", c: '#32d74b', e: "⏱️" },
        { t: "El Tupperman", d: "Sobrevive exclusivamente de la comida de su madre.", c: '#ff9f0a', e: "🍱" },
        { t: "El Hacker", d: "El único con el poder y conocimiento para reiniciar el router.", c: '#32d74b', e: "💻" },
        { t: "El Monje Zen", d: "Inmune al drama y a las discusiones del piso.", c: '#bf5af2', e: "🧘" },
        { t: "El Chef de Air Fryer", d: "Hace desde torreznos hasta postres en la freidora de aire.", c: '#ff9f0a', e: "🍟" },
        { t: "El Gamer de Guardia", d: "Su PS5 hace más horas extra que un reloj.", c: '#0a84ff', e: "🎮" },
        { t: "El Superviviente", d: "Se iría de vivac al monte antes que fregar los platos.", c: '#32d74b', e: "🏕️" },
        { t: "El Cerdo del Piso", d: "Sabe que el polvo no pica.", c: '#ff453a', e: "🐷" },
        { t: "Peligro Biológico", d: "Evita la escoba a toda costa.", c: '#ff9f0a', e: "☣️" },
        { t: "El Remolón", d: "Limpiar hoy no, mañana.", c: '#ffd60a', e: "👀" },
        { t: "Cazador de Ofertas", d: "No compra nada si no lleva la pegatina de descuento.", c: '#ffd60a', e: "🏷️" },
        { t: "Alquimista de Nevera", d: "Mezcla tres sobras distintas y lo llama alta cocina.", c: '#2ec4b6', e: "🧪" },
        { t: "Guardián del Mando", d: "Quien controla el mando de la tele, controla el salón.", c: '#00e5ff', e: "📺" },
        { t: "El 'Yo Fregué Ayer'", d: "Su habilidad especial para esquivar el estropajo.", c: '#ff9f0a', e: "🧽" },
        { t: "Maestro del Tupper", d: "Juega al Tetris en la nevera para meter una olla más.", c: '#66d4cf', e: "🧊" },
        { t: "El NPC del Pasillo", d: "Aparece en la cocina justo cuando tú vas a cocinar.", c: '#8b95c9', e: "🚶" },
        { t: "El Final Boss", d: "Nivel máximo de supervivencia en pisos compartidos.", c: '#ff0055', e: "👾" }
    ];

    usuarios.forEach(u => {
        if (!yaAsignados.has(u.nombre)) {
            let semilla = u.nombre + u.saldo.toFixed(2) + u.pagado.toFixed(2) + u.strikes + u.numTickets;
            let indice = generarHash(semilla) % titulosExtra.length;
            
            let extra = titulosExtra.splice(indice, 1)[0] || { t: "Jugador Estándar", d: "Sin datos destacables.", c: '#8b95c9', e: "👾" };
            asignarTitulo(u, extra.t, extra.d, extra.c, extra.e);
        }
    });
    
    let html = "";
    let usuariosOrdenados = [...usuarios].sort((a, b) => b.xp - a.xp);

    usuariosOrdenados.forEach(u => {
        let a = asignaciones[u.nombre];
        if (!a) return;
        let xpProgreso = u.xp % 100;
        let warningBadge = ultimosStrikes[a.nombre] > 0 ? `<span style="font-family: var(--font-pixel); font-size: 0.45em; display: inline-block; background: #ff0055; color: #fff; padding: 3px 6px; border-radius: 2px; vertical-align: middle; margin-left: 4px;">🚨 ${ultimosStrikes[a.nombre]} FALTA${ultimosStrikes[a.nombre]>1?'S':''}</span>` : '';
        let lvlBadge = `<span style="font-family: var(--font-pixel); font-size: 0.48em; display: inline-block; background: #1e2238; color: var(--arcade-yellow); border: 1px solid var(--arcade-yellow); padding: 2px 5px; border-radius: 2px; vertical-align: middle; margin-left: 6px;">LVL ${u.lvl}</span>`;
        
        html += `
            <div style="background: #090a10; border-radius: 4px; padding: 12px 14px; margin-bottom: 10px; display: flex; align-items: center; border: 2px solid #262b44; border-left: 5px solid ${getColor(a.nombre)};">
                <div style="flex: 1; padding-right: 10px;">
                    <div style="font-family: var(--font-pixel); font-size: 0.62em; color: ${a.color}; text-transform: uppercase; margin-bottom: 4px;">${a.titulo}</div>
                    <div style="font-size: 1.15em; font-weight: 700; color: #f0f4ff; margin: 2px 0;">
                        <span style="color:${getColor(a.nombre)}">${getAvatar(a.nombre)}</span> ${a.nombre} ${lvlBadge} ${warningBadge}
                    </div>
                    <div style="font-size: 0.85em; color: var(--text-muted); line-height: 1.3;">${a.desc}</div>
                    <div class="xp-bar-container">
                        <div class="xp-bar-fill" style="width: ${xpProgreso}%;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-family:var(--font-pixel); font-size:0.48em; color:var(--text-muted); margin-top:4px;">
                        <span>XP TOTAL: ${u.xp}</span>
                        <span>${xpProgreso}/100 XP</span>
                    </div>
                </div>
                <div style="font-size: 2.3em; margin-left: auto;">${a.emoji}</div>
            </div>`;
    });
    cont.innerHTML = html;
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(()=>{}); });

document.getElementById('btnVolverMenu').addEventListener('click', () => { 
    window.playRetroSound('blip');
    if(typeof unsubGrupo !== 'undefined' && unsubGrupo) unsubGrupo();
    if(typeof unsubGastos !== 'undefined' && unsubGastos) unsubGastos(); 
    if(typeof unsubCompra !== 'undefined' && unsubCompra) unsubCompra(); 
    if(typeof unsubLimpieza !== 'undefined' && unsubLimpieza) unsubLimpieza();
    if(typeof unsubHistorial !== 'undefined' && unsubHistorial) unsubHistorial();
    localStorage.removeItem('ultimoPisoActivo'); 
    window.location.reload(); 
});

iniciarApp();
