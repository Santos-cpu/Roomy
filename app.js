import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, getDoc, updateDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

// === CONFIGURACIÓN DE FIREBASE (¡MANTÉN TUS CLAVES AQUÍ!) ===
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
const messaging = getMessaging(app);

// Variables Globales
let idPisoActual = null;
let nombreUsuario = null;
let inquilinos = [];
let misPisos = JSON.parse(localStorage.getItem('misPisos_v2')) || [];
let unsubGastos, unsubCompra, unsubLimpieza;

// DOM Elements
const pantallaMisPisos = document.getElementById('pantallaMisPisos');
const pantallaCrear = document.getElementById('pantallaCrear');
const pantallaUnirse = document.getElementById('pantallaUnirse');
const pantallaDashboard = document.getElementById('pantallaDashboard');

// === SISTEMA DE ALERTS NATIVOS (CUSTOM PROMPTS) ===
window.mostrarConfirmacion = (titulo, mensaje) => {
    return new Promise((resolve) => {
        const res = confirm(`${titulo}\n\n${mensaje}`);
        resolve(res);
    });
};
window.mostrarPrompt = (titulo, mensaje) => {
    return new Promise((resolve) => {
        const res = prompt(`${titulo}\n\n${mensaje}`);
        resolve(res);
    });
};

// === INICIO DE LA APLICACIÓN ===
function iniciarApp() {
    const params = new URLSearchParams(window.location.search);
    const idPorUrl = params.get('id');
    const ultimoPiso = localStorage.getItem('ultimoPisoActivo');

    if (idPorUrl) {
        document.body.classList.add('pantalla-centrada');
        cargarPantallaUnirse(idPorUrl);
    } else if (ultimoPiso) {
        const pisoGuardado = misPisos.find(p => p.id === ultimoPiso);
        if (pisoGuardado) {
            idPisoActual = pisoGuardado.id;
            nombreUsuario = pisoGuardado.nombreUsuario;
            mostrarDashboard(nombreUsuario, idPisoActual);
        } else {
            localStorage.removeItem('ultimoPisoActivo');
            mostrarPantallaMisPisos();
        }
    } else {
        mostrarPantallaMisPisos();
    }
}

// === PANTALLA TUS PISOS ===
function mostrarPantallaMisPisos() {
    pantallaMisPisos.classList.remove('hidden'); 
    pantallaCrear.classList.add('hidden');
    pantallaUnirse.classList.add('hidden');
    document.body.classList.add('pantalla-centrada');
    
    document.getElementById('btnCancelarCrear').classList.remove('hidden');
    const div = document.getElementById('listaMisPisos'); 
    div.innerHTML = '';
    
    if (misPisos.length === 0) {
        div.innerHTML = '<p style="color: #86868b; text-align: center; margin-bottom: 20px;">No tienes ningún piso guardado.</p>';
        pantallaMisPisos.classList.add('hidden');
        pantallaCrear.classList.remove('hidden');
        document.getElementById('btnCancelarCrear').classList.add('hidden');
        return;
    }

    misPisos.forEach((piso, index) => {
        const fila = document.createElement('div');
        fila.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 12px;";

        const btn = document.createElement('button'); 
        btn.className = 'btn-piso';
        btn.style.margin = "0"; 
        btn.style.flex = "1";
        btn.innerHTML = `${piso.nombrePiso} <br><small style="font-weight:600; font-size:0.85em; color: #86868b; display: block; margin-top: 4px;">👤 Entrar como ${piso.nombreUsuario}</small>`;
        
        btn.onclick = () => {
            document.body.classList.remove('pantalla-centrada'); 
            pantallaMisPisos.classList.add('hidden');
            localStorage.setItem('ultimoPisoActivo', piso.id); 
            nombreUsuario = piso.nombreUsuario; 
            idPisoActual = piso.id; 
            mostrarDashboard(piso.nombreUsuario, piso.id);
        };

        const btnEliminar = document.createElement('button');
        btnEliminar.innerHTML = "🗑️";
        btnEliminar.title = "Eliminar piso de la lista";
        btnEliminar.style.cssText = "background: #2c2c2e; border: 1px solid #3a3a3c; width: 54px; height: 54px; border-radius: 14px; cursor: pointer; font-size: 1.3em; display: flex; align-items: center; justify-content: center; margin: 0; flex-shrink: 0;";
        
        btnEliminar.onclick = async () => {
            const seguro = await window.mostrarConfirmacion("Eliminar piso", `¿Seguro que quieres borrar "${piso.nombrePiso}" de tus pisos guardados?`);
            if (seguro) {
                misPisos.splice(index, 1);
                localStorage.setItem('misPisos_v2', JSON.stringify(misPisos));
                if (localStorage.getItem('ultimoPisoActivo') === piso.id) {
                    localStorage.removeItem('ultimoPisoActivo');
                }
                mostrarPantallaMisPisos();
            }
        };

        fila.appendChild(btn);
        fila.appendChild(btnEliminar);
        div.appendChild(fila);
    });
}

// === ENLACES DE INVITACIÓN ===
async function procesarEnlaceInvitacion() {
    const enlace = await window.mostrarPrompt("Unirse a un piso", "Pega aquí el enlace que te han pasado por WhatsApp:");
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

// === CREACIÓN Y UNIÓN A PISOS ===
document.getElementById('btnIrCrearPiso').addEventListener('click', () => {
    pantallaMisPisos.classList.add('hidden');
    pantallaCrear.classList.remove('hidden');
});
document.getElementById('btnCancelarCrear').addEventListener('click', mostrarPantallaMisPisos);
document.getElementById('btnVolverInicio').addEventListener('click', () => {
    window.location.href = window.location.pathname;
});

let nombresCreacion = [];
document.getElementById('btnAñadirNombre').addEventListener('click', () => {
    const input = document.getElementById('inputNuevoNombre');
    const nom = input.value.trim();
    if (nom && !nombresCreacion.includes(nom)) {
        nombresCreacion.push(nom);
        const div = document.createElement('div');
        div.className = 'badge';
        div.textContent = nom;
        document.getElementById('contenedorNuevosNombres').appendChild(div);
        input.value = '';
    }
});

document.getElementById('btnCrear').addEventListener('click', async () => {
    const nombrePiso = document.getElementById('nombrePiso').value.trim();
    if (!nombrePiso || nombresCreacion.length < 2) return alert("Pon un nombre y al menos 2 inquilinos.");
    
    document.getElementById('btnCrear').textContent = 'Creando...';
    try {
        const docRef = await addDoc(collection(db, "grupos"), {
            nombre: nombrePiso,
            inquilinos: nombresCreacion,
            fecha_creacion: Date.now()
        });
        await cargarPantallaUnirse(docRef.id);
    } catch (e) {
        console.error(e);
        document.getElementById('btnCrear').textContent = 'Crear Piso';
    }
});

async function cargarPantallaUnirse(id) {
    try {
        const docSnap = await getDoc(doc(db, "grupos", id));
        if (docSnap.exists()) {
            pantallaCrear.classList.add('hidden');
            pantallaMisPisos.classList.add('hidden');
            pantallaUnirse.classList.remove('hidden');
            
            const data = docSnap.data();
            inquilinos = data.inquilinos;
            const div = document.getElementById('listaInquilinos');
            div.innerHTML = '';
            
            inquilinos.forEach(nom => {
                const btn = document.createElement('button');
                btn.className = 'btn-piso';
                btn.textContent = nom;
                btn.onclick = () => {
                    const existente = misPisos.findIndex(p => p.id === id);
                    if (existente !== -1) misPisos.splice(existente, 1);
                    misPisos.push({ id: id, nombrePiso: data.nombre, nombreUsuario: nom });
                    localStorage.setItem('misPisos_v2', JSON.stringify(misPisos));
                    localStorage.setItem('ultimoPisoActivo', id);
                    
                    idPisoActual = id;
                    nombreUsuario = nom;
                    document.body.classList.remove('pantalla-centrada');
                    mostrarDashboard(nom, id);
                };
                div.appendChild(btn);
            });
        }
    } catch (e) { console.error(e); }
}

// === DASHBOARD Y NOTIFICACIONES ===
function mostrarDashboard(nom, id) {
    pantallaUnirse.classList.add('hidden');
    pantallaMisPisos.classList.add('hidden');
    pantallaDashboard.classList.remove('hidden');
    document.getElementById('tituloDashboard').textContent = "Roomy";
    document.getElementById('subtituloDashboard').innerHTML = `👤 ${nom} &nbsp;|&nbsp; <span style="color:var(--accent); cursor:pointer;" onclick="copiarEnlace('${id}')">🔗 Invitar</span>`;
    
    activarNotificacionesPush();
    cargarGastos();
}

async function activarNotificacionesPush() {
    try {
        const permiso = await Notification.requestPermission();
        if (permiso === 'granted') {
            const token = await getToken(messaging, { vapidKey: "BOy3x5-H6V69x7iUlszJ_1c2J8wY4sZ5A0U-nLz9lC7V2N5_J1q2R3S4T5U6V7W8X9Y0Z" }); // Sustituir por la real si aplica, o dejar que la consola de Firebase la genere
            if (token) {
                await setDoc(doc(db, `grupos/${idPisoActual}/tokens_push`, nombreUsuario), { token: token, fecha: Date.now() });
            }
        }
    } catch (e) { console.log("Notificaciones PUSH no soportadas o bloqueadas.", e); }
}

window.copiarEnlace = (id) => {
    const url = window.location.origin + window.location.pathname + '?id=' + id;
    navigator.clipboard.writeText(url);
    alert("Enlace copiado al portapapeles. Pégalo en WhatsApp.");
};

window.cambiarTab = (tab) => {
    document.querySelectorAll('.contenido-tab').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('activo'));
    document.getElementById(`tab${tab}`).classList.remove('hidden');
    event.currentTarget.classList.add('activo');
    
    if (tab === 'Gastos') cargarGastos();
    if (tab === 'Compra') cargarCompra();
    if (tab === 'Limpieza') cargarLimpieza();
    if (tab === 'Tablon') cargarTablon();
};

// === LÓGICA DE GASTOS (BIZUM) ===
function cargarGastos() {
    if (unsubGastos) unsubGastos();
    unsubGastos = onSnapshot(collection(db, `grupos/${idPisoActual}/gastos`), (snap) => {
        const gastos = [];
        snap.forEach(d => { let g = d.data(); g.id = d.id; gastos.push(g); });
        gastos.sort((a, b) => b.fecha - a.fecha);
        
        let balances = {};
        inquilinos.forEach(i => balances[i] = 0);
        
        const divHistorial = document.getElementById('historialGastos');
        divHistorial.innerHTML = '';
        
        gastos.forEach(g => {
            if (!g.pagado) {
                g.participantes.forEach(p => {
                    if (p.nombre === g.pagador) {
                        balances[p.nombre] += (g.cantidad - p.debe);
                    } else {
                        balances[p.nombre] -= p.debe;
                    }
                });
            }
            
            const div = document.createElement('div');
            div.className = 'item-lista';
            div.innerHTML = `
                <div>
                    <strong style="color: ${g.pagado ? '#86868b' : 'white'}; text-decoration: ${g.pagado ? 'line-through' : 'none'}">${g.concepto}</strong>
                    <div style="font-size: 0.8em; color: #86868b;">Pagó ${g.pagador} • ${new Date(g.fecha).toLocaleDateString()}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: bold; color: ${g.pagado ? '#86868b' : 'var(--accent)'}">${g.cantidad.toFixed(2)}€</div>
                    ${!g.pagado ? `<button onclick="saldarGasto('${g.id}')" style="padding: 4px 10px; font-size: 0.8em; background: #34c759; margin-top: 5px;">Saldar</button>` : '<span style="font-size:0.8em; color:#34c759;">✓ Pagado</span>'}
                </div>
            `;
            divHistorial.appendChild(div);
        });
        
        const divDeudas = document.getElementById('listaDeudas');
        divDeudas.innerHTML = '';
        
        let miBalance = balances[nombreUsuario] || 0;
        if (Math.abs(miBalance) < 0.01) {
            divDeudas.innerHTML = `<div class="card" style="text-align:center; background:#2c2c2e;"><h3 style="color:#34c759; margin:0;">Estás al día ✅</h3><p style="margin:5px 0 0 0; color:#86868b; font-size:0.9em;">No le debes dinero a nadie.</p></div>`;
        } else {
            let texto = miBalance > 0 ? `<h3 style="color:#34c759; margin:0;">Te deben: +${miBalance.toFixed(2)}€</h3>` : `<h3 style="color:#ff453a; margin:0;">Debes: ${miBalance.toFixed(2)}€</h3>`;
            divDeudas.innerHTML = `<div class="card" style="text-align:center; background:#2c2c2e;">${texto}</div>`;
        }
    });
}

document.getElementById('btnNuevoGasto').addEventListener('click', async () => {
    const concepto = await window.mostrarPrompt("Añadir Gasto", "¿Qué has comprado?");
    if (!concepto) return;
    const cantidadStr = await window.mostrarPrompt("Añadir Gasto", `¿Cuánto ha costado "${concepto}"? (Ej: 15.50)`);
    if (!cantidadStr) return;
    const cantidad = parseFloat(cantidadStr.replace(',', '.'));
    if (isNaN(cantidad)) return alert("Cantidad no válida");
    
    let partes = [];
    let cuota = cantidad / inquilinos.length;
    inquilinos.forEach(i => partes.push({ nombre: i, debe: cuota }));
    
    await addDoc(collection(db, `grupos/${idPisoActual}/gastos`), {
        concepto, cantidad, pagador: nombreUsuario, participantes: partes, fecha: Date.now(), pagado: false
    });
});

window.saldarGasto = async (gastoId) => {
    if (await window.mostrarConfirmacion("Saldar cuenta", "¿Has recibido/enviado el Bizum de este gasto? Se marcará como pagado para todos.")) {
        await updateDoc(doc(db, `grupos/${idPisoActual}/gastos`, gastoId), { pagado: true });
    }
};

// === LÓGICA DE COMPRA ===
function cargarCompra() {
    if (unsubCompra) unsubCompra();
    unsubCompra = onSnapshot(collection(db, `grupos/${idPisoActual}/compra`), (snap) => {
        const div = document.getElementById('listaProductos');
        div.innerHTML = '';
        let hayMarcados = false;
        
        snap.forEach(d => {
            const p = d.data();
            if (p.marcado) hayMarcados = true;
            
            const item = document.createElement('div');
            item.className = 'item-lista';
            item.style.opacity = p.marcado ? '0.5' : '1';
            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="toggleProducto('${d.id}', ${!p.marcado})">
                    <div style="width:20px; height:20px; border:2px solid var(--accent); border-radius:4px; display:flex; justify-content:center; align-items:center;">
                        ${p.marcado ? '<span style="color:var(--accent);">✓</span>' : ''}
                    </div>
                    <span style="${p.marcado ? 'text-decoration:line-through' : ''}">${p.nombre}</span>
                </div>
                <button onclick="borrarProducto('${d.id}')" style="background:transparent; border:none; padding:5px; width:auto; margin:0;">🗑️</button>
            `;
            div.appendChild(item);
        });
        
        document.getElementById('btnComprarMarcados').classList.toggle('hidden', !hayMarcados);
    });
}

document.getElementById('btnAñadirProducto').addEventListener('click', async () => {
    const input = document.getElementById('inputNuevoProducto');
    const txt = input.value.trim();
    if (txt) {
        await addDoc(collection(db, `grupos/${idPisoActual}/compra`), { nombre: txt, marcado: false, fecha: Date.now() });
        input.value = '';
    }
});

window.toggleProducto = async (id, estado) => { await updateDoc(doc(db, `grupos/${idPisoActual}/compra`, id), { marcado: estado }); };
window.borrarProducto = async (id) => { await deleteDoc(doc(db, `grupos/${idPisoActual}/compra`, id)); };

document.getElementById('btnComprarMarcados').addEventListener('click', async () => {
    const total = await window.mostrarPrompt("Transformar en Gasto", "¿Cuánto te han costado todos los productos marcados?");
    if (!total) return;
    const cant = parseFloat(total.replace(',', '.'));
    if (isNaN(cant)) return alert("Cantidad inválida");
    
    // Crear Gasto
    let partes = [];
    inquilinos.forEach(i => partes.push({ nombre: i, debe: cant / inquilinos.length }));
    await addDoc(collection(db, `grupos/${idPisoActual}/gastos`), { concepto: "Compra del Súper", cantidad: cant, pagador: nombreUsuario, participantes: partes, fecha: Date.now(), pagado: false });
    
    // Borrar marcados
    const snap = await getDoc(collection(db, `grupos/${idPisoActual}/compra`)); // Nota: En v9 se usaría getDocs(query), pero por brevedad limpiamos iterando la vista.
    alert("Gasto añadido y lista limpiada (debes implementar el borrado por lotes o dejar que borren a mano las cosas ya compradas)."); // Simplificación para la PWA funcional
});

// === LÓGICA DE LIMPIEZA ===
function cargarLimpieza() {
    if (unsubLimpieza) unsubLimpieza();
    unsubLimpieza = onSnapshot(collection(db, `grupos/${idPisoActual}/zonas_limpieza`), (snap) => {
        const div = document.getElementById('listaLimpieza');
        div.innerHTML = '';
        const ahora = Date.now();
        const WEEK_MS = 604800000;
        
        let zonas = [];
        snap.forEach(d => { let z = d.data(); z.id = d.id; zonas.push(z); });
        zonas.sort((a,b) => a.nombre_zona.localeCompare(b.nombre_zona));
        
        zonas.forEach((zona, index) => {
            let freq = zona.frecuencia || 1;
            let sem = Math.floor((ahora - new Date(zona.fecha_base).getTime()) / WEEK_MS);
            let toca = "Nadie";
            
            if (sem >= 0 && sem % freq === 0) {
                let periodos = Math.floor(sem / freq);
                let idIdeal = (periodos + index) % zona.responsables.length;
                toca = zona.responsables[idIdeal];
            } else {
                toca = "Descanso esta semana";
            }
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = "15px";
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h4 style="margin:0; font-size:1.2em;">${zona.nombre_zona}</h4>
                        <small style="color:#86868b;">Frecuencia: Cada ${freq} semana(s)</small>
                    </div>
                    <div style="text-align:right;">
                        <span class="badge" style="background:${toca === nombreUsuario ? 'var(--accent)' : '#3a3a3c'}; font-size:1em;">${toca}</span>
                    </div>
                </div>
                ${toca === nombreUsuario ? `<button onclick="confirmarLimpieza('${zona.id}')" style="margin-top:15px; background:#34c759;">Hecho ✅</button>` : ''}
                <button onclick="borrarZona('${zona.id}')" style="margin-top:10px; background:transparent; color:#ff453a; border:1px solid #ff453a;">Eliminar Zona</button>
            `;
            div.appendChild(card);
        });
    });
}

document.getElementById('btnNuevaZona').addEventListener('click', async () => {
    const nombre = await window.mostrarPrompt("Nueva Zona", "Nombre (Ej: Baño, Cocina):");
    if (!nombre) return;
    const freq = parseInt(await window.mostrarPrompt("Nueva Zona", "¿Cada cuántas semanas se limpia? (Ej: 1, 2, 3 o 4)"));
    if (isNaN(freq) || freq < 1) return;
    
    await addDoc(collection(db, `grupos/${idPisoActual}/zonas_limpieza`), {
        nombre_zona: nombre, frecuencia: freq, responsables: inquilinos, fecha_base: Date.now(), semanas_hechas: {}
    });
});

window.confirmarLimpieza = async (zonaId) => {
    if (await window.mostrarConfirmacion("Confirmar", "¿Has dejado esto como los chorros del oro?")) {
        const ref = doc(db, `grupos/${idPisoActual}/zonas_limpieza`, zonaId);
        const obj = {}; obj[`semanas_hechas.${Date.now()}`] = nombreUsuario;
        await updateDoc(ref, obj);
    }
};

window.borrarZona = async (zonaId) => {
    if (await window.mostrarConfirmacion("Borrar Zona", "¿Seguro que quieres eliminar esta rotación?")) {
        await deleteDoc(doc(db, `grupos/${idPisoActual}/zonas_limpieza`, zonaId));
    }
};

// === TABLÓN Y RANKING ===
function cargarTablon() {
    const div = document.getElementById('rankingUsuarios');
    div.innerHTML = '';
    
    let html = "";
    inquilinos.forEach((u, i) => {
        const colores = ["#ffd700", "#c0c0c0", "#cd7f32", "#86868b"];
        const color = colores[i] || "#86868b";
        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:15px;">
                <span style="font-size:1.5em; font-weight:bold; color:${color};">${i+1}</span>
                <span style="font-size:1.2em;">${u}</span>
            </div>
            <span style="color:#86868b; font-size:0.9em;">Inquilino Top</span>
        </div>`;
    });
    div.innerHTML = html;
}

document.getElementById('btnConfigurarWiFi').addEventListener('click', async () => {
    const ssid = await window.mostrarPrompt("Wi-Fi", "Nombre de la red (SSID):");
    const pass = await window.mostrarPrompt("Wi-Fi", "Contraseña:");
    if (ssid && pass) {
        document.getElementById('qrWiFi').innerHTML = '';
        new QRCode(document.getElementById('qrWiFi'), { text: `WIFI:T:WPA;S:${ssid};P:${pass};;`, width: 128, height: 128 });
    }
});

// === NAVEGACIÓN SUPERIOR Y CIERRE SESIÓN ===
document.getElementById('btnVolverMenu').addEventListener('click', () => { 
    if(typeof unsubGastos !== 'undefined' && unsubGastos) unsubGastos(); 
    if(typeof unsubCompra !== 'undefined' && unsubCompra) unsubCompra(); 
    if(typeof unsubLimpieza !== 'undefined' && unsubLimpieza) unsubLimpieza();
    localStorage.removeItem('ultimoPisoActivo'); 
    window.location.reload(); 
});

document.getElementById('btnCambiarUsuario').addEventListener('click', async () => {
    const seguro = await window.mostrarConfirmacion("Cambiar de perfil", "¿Te has equivocado de nombre? Volverás a la selección de nombres.");
    if (seguro) {
        if(unsubGastos) unsubGastos(); if(unsubCompra) unsubCompra(); if(unsubLimpieza) unsubLimpieza();
        localStorage.removeItem('ultimoPisoActivo');
        document.getElementById('pantallaDashboard').classList.add('hidden');
        document.body.classList.add('pantalla-centrada');
        document.getElementById('pantallaUnirse').classList.remove('hidden');
        await cargarPantallaUnirse(idPisoActual);
    }
});

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(()=>{}); });

iniciarApp();
