import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

let participantesGrupo = []; 
let idPisoActual = "";
let nombreUsuario = "";
let nombresNuevos = []; 

let idGastoEditando = null;
let idZonaEditando = null;
let zonasLimpiezaCache = []; 
let fechaCalendario = new Date(); 

let misPisos = JSON.parse(localStorage.getItem('misPisos_v2')) || [];
let ultimoPisoActivo = localStorage.getItem('ultimoPisoActivo');

// --- SISTEMA DE MODALES ---
window.mostrarModal = function({ titulo, mensaje, tipo = 'alert', valorInput = '' }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('iosModalOverlay'); const box = document.getElementById('iosModalBox');
        const titleEl = document.getElementById('iosModalTitle'); const msgEl = document.getElementById('iosModalMessage');
        const inputEl = document.getElementById('iosModalInput'); const btnCancel = document.getElementById('iosModalBtnCancel');
        const btnConfirm = document.getElementById('iosModalBtnConfirm');

        titleEl.innerText = titulo; msgEl.innerText = mensaje;
        inputEl.classList.add('hidden'); btnCancel.classList.add('hidden');
        inputEl.value = valorInput; inputEl.type = (titulo.toLowerCase().includes('precio') || titulo.toLowerCase().includes('importe')) ? 'number' : 'text';

        if (tipo === 'confirm' || tipo === 'prompt') btnCancel.classList.remove('hidden');
        if (tipo === 'prompt') inputEl.classList.remove('hidden');

        overlay.classList.add('active');
        const close = () => { overlay.classList.remove('active'); btnConfirm.onclick = null; btnCancel.onclick = null; };

        btnConfirm.onclick = () => { close(); if (tipo === 'prompt') resolve(inputEl.value); else resolve(true); };
        btnCancel.onclick = () => { close(); if (tipo === 'prompt') resolve(null); else resolve(false); };
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
    const urlParams = new URLSearchParams(window.location.search);
    const pisoIdUrl = urlParams.get('id');

    if (pisoIdUrl) { document.body.classList.add('pantalla-centrada'); pantallaUnirse.classList.remove('hidden'); await cargarPantallaUnirse(pisoIdUrl); return; }
    if (ultimoPisoActivo) {
        const pisoGuardado = misPisos.find(p => p.id === ultimoPisoActivo);
        if (pisoGuardado) { document.body.classList.remove('pantalla-centrada'); nombreUsuario = pisoGuardado.nombreUsuario; idPisoActual = pisoGuardado.id; mostrarDashboard(nombreUsuario, idPisoActual); return; }
    }
    if (misPisos.length > 0) { document.body.classList.add('pantalla-centrada'); mostrarPantallaMisPisos(); } 
    else { document.body.classList.add('pantalla-centrada'); pantallaCrear.classList.remove('hidden'); }
}

function mostrarPantallaMisPisos() {
    pantallaMisPisos.classList.remove('hidden'); pantallaCrear.classList.add('hidden');
    document.getElementById('btnCancelarCrear').classList.remove('hidden');
    const div = document.getElementById('listaMisPisos'); div.innerHTML = '';
    misPisos.forEach(piso => {
        const btn = document.createElement('button'); btn.className = 'btn-piso';
        btn.innerHTML = `${piso.nombrePiso} <br><small style="font-weight:600; font-size:0.85em; color: rgba(0,0,0,0.65); display: block; margin-top: 4px;">👤 Entrar como ${piso.nombreUsuario}</small>`;
        btn.onclick = () => {
            document.body.classList.remove('pantalla-centrada'); pantallaMisPisos.classList.add('hidden');
            localStorage.setItem('ultimoPisoActivo', piso.id); nombreUsuario = piso.nombreUsuario; idPisoActual = piso.id; mostrarDashboard(piso.nombreUsuario, piso.id);
        };
        div.appendChild(btn);
    });
}

document.getElementById('btnIrCrearPiso').addEventListener('click', () => { pantallaMisPisos.classList.add('hidden'); pantallaCrear.classList.remove('hidden'); });
document.getElementById('btnCancelarCrear').addEventListener('click', () => { pantallaCrear.classList.add('hidden'); pantallaMisPisos.classList.remove('hidden'); });

document.getElementById('btnAñadirNombre').addEventListener('click', () => {
    const input = document.getElementById('inputNuevoNombre'); const nombre = input.value.trim();
    if (nombre && !nombresNuevos.includes(nombre)) { nombresNuevos.push(nombre); actualizarListaNuevosNombres(); input.value = ''; }
});
function actualizarListaNuevosNombres() {
    const contenedor = document.getElementById('contenedorNuevosNombres'); contenedor.innerHTML = '';
    nombresNuevos.forEach((nombre, index) => { contenedor.innerHTML += `<div class="tag-nombre"><span>👤 ${nombre}</span><span class="tag-eliminar" onclick="quitarNombre(${index})">✕</span></div>`; });
}
window.quitarNombre = function(index) { nombresNuevos.splice(index, 1); actualizarListaNuevosNombres(); };

document.getElementById('btnCrear').addEventListener('click', async () => {
    const nombrePiso = document.getElementById('nombrePiso').value; const boton = document.getElementById('btnCrear');
    if (!nombrePiso || nombresNuevos.length === 0) return await window.mostrarAlerta("Datos incompletos", "Escribe el nombre del piso y añade al menos a un inquilino.");
    boton.innerText = "Creando..."; boton.disabled = true;
    const idUnico = 'piso-' + Math.random().toString(36).substring(2, 8);
    const tablonInicial = { wifi_nombre: "", wifi_pass: "", iban: "", notas: "" };
    try {
        await setDoc(doc(db, "grupos", idUnico), { id: idUnico, nombre_piso: nombrePiso, creador: nombresNuevos[0], participantes: nombresNuevos, tablon: tablonInicial, fecha_creacion: new Date().toISOString() });
        pantallaCrear.classList.add('hidden'); pantallaUnirse.classList.remove('hidden');
        document.getElementById('nombrePiso').value = ""; nombresNuevos = []; actualizarListaNuevosNombres();
        await cargarPantallaUnirse(idUnico);
    } catch (error) { await window.mostrarAlerta("Error", "No se pudo guardar."); } finally { boton.innerText = "Crear Piso"; boton.disabled = false; }
});

async function cargarPantallaUnirse(id) {
    try {
        const docSnap = await getDoc(doc(db, "grupos", id));
        if (docSnap.exists()) {
            const datosPiso = docSnap.data(); document.getElementById('tituloUnirse').innerText = `🏡 ${datosPiso.nombre_piso}`;
            const listaNombres = document.getElementById('listaNombres'); listaNombres.innerHTML = ''; 
            datosPiso.participantes.forEach(nombre => {
                const btn = document.createElement('button'); btn.innerText = nombre; btn.className = 'btn-name';
                btn.onclick = () => unirseYGuardar(nombre, id, datosPiso.nombre_piso); listaNombres.appendChild(btn);
            });
        } else { document.getElementById('tituloUnirse').innerText = "❌ Piso no existe"; }
    } catch (error) { document.getElementById('tituloUnirse').innerText = "Error de conexión"; }
}

function unirseYGuardar(nombre, id, nombrePiso) {
    misPisos = misPisos.filter(piso => piso.id !== id);
    misPisos.push({ id: id, nombrePiso: nombrePiso, nombreUsuario: nombre });
    localStorage.setItem('misPisos_v2', JSON.stringify(misPisos)); localStorage.setItem('ultimoPisoActivo', id);
    nombreUsuario = nombre; idPisoActual = id;
    pantallaUnirse.classList.add('hidden'); document.body.classList.remove('pantalla-centrada');
    window.history.pushState({}, document.title, window.location.pathname);
    mostrarDashboard(nombre, id);
}

async function mostrarDashboard(nombre, id) {
    pantallaDashboard.classList.remove('hidden');
    const docSnap = await getDoc(doc(db, "grupos", id));
    if (docSnap.exists()) {
        const datos = docSnap.data();
        document.getElementById('tituloDashboard').innerText = datos.nombre_piso;
        document.getElementById('nombreUsuarioActual').innerText = nombre;
        participantesGrupo = datos.participantes;
        
        cargarTablon(datos.tablon || { wifi_nombre: "", wifi_pass: "", iban: "", notas: "" });
        await cargarListaGastos();
        await cargarListaLimpieza();
        cargarListaCompra();
    }
}

// NUEVO: CAMBIAR DE USUARIO EN EL GRUPO ACTUAL
document.getElementById('btnCambiarUsuario').addEventListener('click', async () => {
    const seguro = await window.mostrarConfirmacion("Cambiar de perfil", "¿Te has equivocado de nombre? Volverás a la pantalla de selección.");
    if (seguro) {
        misPisos = misPisos.filter(p => p.id !== idPisoActual);
        localStorage.setItem('misPisos_v2', JSON.stringify(misPisos));
        localStorage.removeItem('ultimoPisoActivo');
        
        document.getElementById('pantallaDashboard').classList.add('hidden');
        document.body.classList.add('pantalla-centrada');
        document.getElementById('pantallaUnirse').classList.remove('hidden');
        await cargarPantallaUnirse(idPisoActual);
    }
});

document.getElementById('btnEditarNombrePiso').addEventListener('click', async () => {
    const n = document.getElementById('tituloDashboard').innerText;
    const nn = await window.mostrarPrompt("Editar Grupo", "Escribe un nuevo nombre para este grupo:", n);
    if (nn && nn.trim() !== "" && nn.trim() !== n) {
        await updateDoc(doc(db, "grupos", idPisoActual), { nombre_piso: nn.trim() });
        document.getElementById('tituloDashboard').innerText = nn.trim();
        let p = misPisos.find(p => p.id === idPisoActual);
        if (p) { p.nombrePiso = nn.trim(); localStorage.setItem('misPisos_v2', JSON.stringify(misPisos)); }
    }
});

document.getElementById('btnCopiarEnlace').addEventListener('click', async () => {
    const enlace = `${window.location.origin}${window.location.pathname}?id=${idPisoActual}`;
    try { await navigator.clipboard.writeText(enlace); await window.mostrarAlerta("Enlace copiado", "¡Pásalo por WhatsApp a tus compañeros!"); } 
    catch (e) { await window.mostrarAlerta("Error al copiar", "Cópialo manualmente: \n\n" + enlace); }
});

// PESTAÑAS Y TABLÓN
function activarPestaña(idTab, idVista) {
    ['tabGastos', 'tabCompra', 'tabLimpieza', 'tabRanking'].forEach(t => document.getElementById(t).classList.remove('active'));
    ['vistaGastos', 'vistaCompra', 'vistaLimpieza', 'vistaRanking'].forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById(idTab).classList.add('active'); document.getElementById(idVista).classList.remove('hidden');
}
document.getElementById('tabGastos').addEventListener('click', () => activarPestaña('tabGastos', 'vistaGastos'));
document.getElementById('tabCompra').addEventListener('click', () => activarPestaña('tabCompra', 'vistaCompra'));
document.getElementById('tabLimpieza').addEventListener('click', () => activarPestaña('tabLimpieza', 'vistaLimpieza'));
document.getElementById('tabRanking').addEventListener('click', () => activarPestaña('tabRanking', 'vistaRanking'));

document.getElementById('btnAbrirTablon').addEventListener('click', () => {
    window.scrollTo(0, 0); document.body.style.overflow = 'hidden'; // Evita scroll de fondo
    document.getElementById('vistaTablon').classList.remove('hidden');
});
document.getElementById('btnCerrarTablon').addEventListener('click', () => {
    document.body.style.overflow = 'auto';
    document.getElementById('vistaTablon').classList.add('hidden');
});

// --- MÓDULO GASTOS ---
function resetFormGasto() {
    idGastoEditando = null; document.getElementById('tituloFormGasto').innerText = 'Nuevo Gasto';
    document.getElementById('conceptoGasto').value = ''; document.getElementById('importeGasto').value = '';
    document.getElementById('btnGuardarGasto').innerText = 'Guardar'; document.getElementById('btnEliminarGasto').classList.add('hidden');
    document.getElementById('tipoDivisionGasto').value = 'iguales'; prepararFormularioGastos();
}

document.getElementById('btnMostrarFormGasto').addEventListener('click', () => { resetFormGasto(); document.getElementById('formGasto').classList.remove('hidden'); document.getElementById('btnMostrarFormGasto').classList.add('hidden'); });
document.getElementById('btnCancelarGasto').addEventListener('click', () => { document.getElementById('formGasto').classList.add('hidden'); document.getElementById('btnMostrarFormGasto').classList.remove('hidden'); });
document.getElementById('tipoDivisionGasto').addEventListener('change', prepararFormularioGastos);

function prepararFormularioGastos(gastoObj = null) {
    const selectPagador = document.getElementById('pagadorGasto'); const divInvolucrados = document.getElementById('involucradosGasto');
    const tipoDiv = document.getElementById('tipoDivisionGasto').value; const infoManual = document.getElementById('infoDivisionManual');
    
    if(!gastoObj) {
        selectPagador.innerHTML = '';
        participantesGrupo.forEach(p => {
            const opt = document.createElement('option'); opt.value = p; opt.innerText = p;
            if (p === nombreUsuario) opt.selected = true; selectPagador.appendChild(opt);
        });
    }
    divInvolucrados.innerHTML = '';
    
    if (tipoDiv === 'iguales') {
        infoManual.classList.add('hidden');
        participantesGrupo.forEach(p => {
            let checked = true;
            if (gastoObj && Array.isArray(gastoObj.involucrados)) checked = typeof gastoObj.involucrados[0] === 'string' ? gastoObj.involucrados.includes(p) : gastoObj.involucrados.some(i => i.nombre === p);
            divInvolucrados.innerHTML += `<label><input type="checkbox" value="${p}" class="gasto-cb" ${checked ? 'checked' : ''}> ${p}</label>`;
        });
    } else {
        infoManual.classList.remove('hidden');
        participantesGrupo.forEach(p => {
            let val = '';
            if (gastoObj && Array.isArray(gastoObj.involucrados) && typeof gastoObj.involucrados[0] === 'object') {
                const found = gastoObj.involucrados.find(i => i.nombre === p); if (found) val = found.importe;
            }
            divInvolucrados.innerHTML += `<div class="manual-split-row"><span>${p}</span><input type="number" class="manual-importe" data-nombre="${p}" step="0.01" min="0" placeholder="0.00" value="${val}"></div>`;
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
    else if (dif < -0.001) info.innerHTML = `<span style="color:#ff453a;">Has asignado <b>${Math.abs(dif).toFixed(2)}€</b> de más.</span>`;
    else info.innerHTML = `<span style="color:#32d74b;">Cuadrado perfecto ✔️</span>`;
}

window.abrirEditarGasto = function(gastoObj) {
    idGastoEditando = gastoObj.id; document.getElementById('tituloFormGasto').innerText = 'Editar Gasto';
    document.getElementById('conceptoGasto').value = gastoObj.concepto; document.getElementById('importeGasto').value = gastoObj.importe;
    if (gastoObj.involucrados.length > 0 && typeof gastoObj.involucrados[0] === 'object') { document.getElementById('tipoDivisionGasto').value = 'manual'; } else { document.getElementById('tipoDivisionGasto').value = 'iguales'; }
    
    prepararFormularioGastos(gastoObj); document.getElementById('pagadorGasto').value = gastoObj.pagador;
    document.getElementById('btnGuardarGasto').innerText = 'Actualizar'; document.getElementById('btnEliminarGasto').classList.remove('hidden');
    document.getElementById('formGasto').classList.remove('hidden'); document.getElementById('btnMostrarFormGasto').classList.add('hidden');
    document.getElementById('formGasto').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('btnEliminarGasto').addEventListener('click', async () => {
    const seguro = await window.mostrarConfirmacion("Eliminar Gasto", "¿Seguro que quieres eliminar este gasto? Afectará a las cuentas.");
    if (!seguro) return;
    const boton = document.getElementById('btnEliminarGasto'); boton.disabled = true;
    try { await deleteDoc(doc(db, "grupos", idPisoActual, "gastos", idGastoEditando)); document.getElementById('btnCancelarGasto').click(); await cargarListaGastos(); } 
    catch (error) { await window.mostrarAlerta("Error", "No se pudo eliminar."); } finally { boton.disabled = false; }
});

document.getElementById('btnGuardarGasto').addEventListener('click', async () => {
    const concepto = document.getElementById('conceptoGasto').value; const importe = parseFloat(document.getElementById('importeGasto').value);
    const pagador = document.getElementById('pagadorGasto').value; const tipo = document.getElementById('tipoDivisionGasto').value;
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
    
    const boton = document.getElementById('btnGuardarGasto'); boton.innerText = "Guardando..."; boton.disabled = true;
    const datosGasto = { concepto: concepto, importe: importe, pagador: pagador, involucrados: involucradosData };
    try {
        if (idGastoEditando) await updateDoc(doc(db, "grupos", idPisoActual, "gastos", idGastoEditando), datosGasto);
        else { datosGasto.fecha = new Date().toISOString(); await addDoc(collection(db, "grupos", idPisoActual, "gastos"), datosGasto); }
        document.getElementById('btnCancelarGasto').click(); await cargarListaGastos();
    } catch (error) { await window.mostrarAlerta("Error", "Fallo al guardar."); } finally { boton.disabled = false; }
});

async function cargarListaGastos() {
    const listaHtml = document.getElementById('listaGastos');
    try {
        const q = query(collection(db, "grupos", idPisoActual, "gastos"), orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);
        let gastosTotales = [];
        if (querySnapshot.empty) {
            listaHtml.innerHTML = '<p style="color:#86868b;">No hay gastos.</p>';
            document.getElementById('listaBalances').innerHTML = '<p style="color:#86868b;">Sin actividad</p>';
            document.getElementById('listaDeudas').innerHTML = ''; 
            generarRanking([], {}); 
            return;
        }
        listaHtml.innerHTML = '';
        querySnapshot.forEach((docSnap) => {
            const gasto = docSnap.data(); gasto.id = docSnap.id; gastosTotales.push(gasto); 
            const divGasto = document.createElement('div'); divGasto.className = 'item-lista';
            const extraDetalle = typeof gasto.involucrados[0] === 'object' ? ' (Manual)' : '';
            divGasto.innerHTML = `<div class="item-info"><span class="item-titulo">${gasto.concepto}</span><span class="item-detalle">${gasto.pagador} pagó para ${gasto.involucrados.length}${extraDetalle} • ${new Date(gasto.fecha).toLocaleDateString()}</span></div><div style="display: flex; align-items: center; gap: 12px;"><span class="gasto-importe">${gasto.importe.toFixed(2)}€</span><button style="background:none; border:none; padding:0; cursor:pointer; font-size:1.4em;" onclick='window.abrirEditarGasto(${JSON.stringify(gasto).replace(/'/g, "\\'")})'>✏️</button></div>`;
            listaHtml.appendChild(divGasto);
        });
        calcularBalancesYDeudas(gastosTotales);
    } catch (error) { listaHtml.innerHTML = 'Error al cargar.'; }
}

function calcularBalancesYDeudas(gastos) {
    let balances = {}; participantesGrupo.forEach(p => balances[p] = 0);
    gastos.forEach(gasto => {
        if (balances[gasto.pagador] !== undefined) balances[gasto.pagador] += gasto.importe;
        gasto.involucrados.forEach(inv => {
            if (typeof inv === 'string') { const costePP = gasto.importe / gasto.involucrados.length; if (balances[inv] !== undefined) balances[inv] -= costePP; } 
            else { if (balances[inv.nombre] !== undefined) balances[inv.nombre] -= inv.importe; }
        });
    });
    
    let htmlBalances = ''; let deudores = []; let acreedores = [];
    for (let persona in balances) {
        let saldo = balances[persona]; let color = saldo >= -0.01 && saldo <= 0.01 ? '#f5f5f7' : (saldo > 0 ? '#32d74b' : '#ff453a');
        htmlBalances += `<div class="balance-item"><span>${persona}</span><span style="color: ${color}; font-weight: bold;">${saldo.toFixed(2)}€</span></div>`;
        if (saldo < -0.01) deudores.push({ nombre: persona, cantidad: Math.abs(saldo) });
        if (saldo > 0.01) acreedores.push({ nombre: persona, cantidad: saldo });
    }
    document.getElementById('listaBalances').innerHTML = htmlBalances;
    deudores.sort((a, b) => b.cantidad - a.cantidad); acreedores.sort((a, b) => b.cantidad - a.cantidad);
    
    let htmlDeudas = ''; let i = 0; let j = 0;
    if (deudores.length === 0) { htmlDeudas = '<p style="color:#32d74b; font-weight:bold;">✅ Cuentas saldadas</p>'; } 
    else {
        while (i < deudores.length && j < acreedores.length) {
            let deudor = deudores[i]; let acreedor = acreedores[j]; let transfer = Math.min(deudor.cantidad, acreedor.cantidad);
            htmlDeudas += `<div class="deuda-item"><span>💸 <b style="color:#f5f5f7;">${deudor.nombre}</b> debe a <b style="color:#f5f5f7;">${acreedor.nombre}</b>: <br><b style="color:#0a84ff; font-size:1.1em;">${transfer.toFixed(2)}€</b></span><button class="btn-bizum" onclick="registrarBizum('${deudor.nombre}', '${acreedor.nombre}', ${transfer})">Bizum hecho</button></div>`;
            deudor.cantidad -= transfer; acreedor.cantidad -= transfer;
            if (deudor.cantidad < 0.01) i++; if (acreedor.cantidad < 0.01) j++;
        }
    }
    document.getElementById('listaDeudas').innerHTML = htmlDeudas;
    
    generarRanking(gastos, balances);
}

window.registrarBizum = async function(deudor, acreedor, cantidad) {
    const seguro = await window.mostrarConfirmacion("Confirmar Pago", `¿Confirmas que ${deudor} ha hecho un Bizum de ${cantidad.toFixed(2)}€ a ${acreedor}?`);
    if (!seguro) return;
    try {
        await addDoc(collection(db, "grupos", idPisoActual, "gastos"), {
            concepto: `💸 Bizum de ${deudor}`, importe: parseFloat(cantidad), pagador: deudor,
            involucrados: [{ nombre: acreedor, importe: parseFloat(cantidad) }], fecha: new Date().toISOString()
        });
        await cargarListaGastos();
    } catch(e) { await window.mostrarAlerta("Error", "No se pudo registrar el pago."); }
};

// --- MÓDULO LISTA COMPRA ---
document.getElementById('btnAñadirArticulo').addEventListener('click', async () => {
    const input = document.getElementById('inputNuevoArticulo'); const articulo = input.value.trim();
    if (!articulo) return; input.value = '';
    await addDoc(collection(db, "grupos", idPisoActual, "compra"), { articulo: articulo, añadidoPor: nombreUsuario, fecha: new Date().toISOString() });
    cargarListaCompra(); 
});

async function cargarListaCompra() {
    const listaHtml = document.getElementById('listaArticulos');
    const q = query(collection(db, "grupos", idPisoActual, "compra"), orderBy("fecha", "asc")); const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) { listaHtml.innerHTML = '<p style="color:#86868b; text-align:center;">Lista vacía.</p>'; document.getElementById('btnComprarSeleccionados').disabled = true; return; }
    document.getElementById('btnComprarSeleccionados').disabled = false; listaHtml.innerHTML = '';
    querySnapshot.forEach(docSnap => {
        const item = docSnap.data();
        listaHtml.innerHTML += `<div class="manual-split-row" style="margin-bottom: 8px;"><label style="flex:1; display:flex; align-items:center; gap:10px; cursor:pointer;"><input type="checkbox" class="cb-articulo" value="${docSnap.id}" data-nombre="${item.articulo}"><span>${item.articulo} <small style="color:#86868b; display:block; font-size:0.8em;">Por ${item.añadidoPor}</small></span></label><button onclick="borrarArticulo('${docSnap.id}')" style="background:none; width:auto; margin:0; padding:5px; color:#ff453a; font-size:1.2em;">🗑️</button></div>`;
    });
}
window.borrarArticulo = async function(id) { await deleteDoc(doc(db, "grupos", idPisoActual, "compra", id)); cargarListaCompra(); };

document.getElementById('btnComprarSeleccionados').addEventListener('click', async () => {
    const seleccionados = Array.from(document.querySelectorAll('.cb-articulo:checked'));
    if (seleccionados.length === 0) return await window.mostrarAlerta("Atención", "Selecciona al menos un producto.");
    const precioStr = await window.mostrarPrompt("Precio de la compra", "Introduce lo que te ha costado en total:");
    if (precioStr === null) return;
    const precio = parseFloat(precioStr);
    if (isNaN(precio) || precio <= 0) return await window.mostrarAlerta("Error", "El precio introducido no es válido.");
    const nombresArticulos = seleccionados.map(cb => cb.getAttribute('data-nombre')).join(', ');
    const concepto = nombresArticulos.length > 40 ? nombresArticulos.substring(0, 37) + '...' : nombresArticulos;
    try {
        await addDoc(collection(db, "grupos", idPisoActual, "gastos"), { concepto: "🛒 Compra: " + concepto, importe: precio, pagador: nombreUsuario, involucrados: participantesGrupo, fecha: new Date().toISOString() });
        for (let cb of seleccionados) { await deleteDoc(doc(db, "grupos", idPisoActual, "compra", cb.value)); }
        cargarListaCompra(); cargarListaGastos(); await window.mostrarAlerta("¡Hecho!", "La compra se ha convertido en un Gasto."); activarPestaña('tabGastos', 'vistaGastos');
    } catch(e) { await window.mostrarAlerta("Error", "Fallo al procesar."); }
});

// --- MÓDULO LIMPIEZA & CALENDARIO ---
function resetFormZona() {
    idZonaEditando = null; document.getElementById('tituloFormZona').innerText = 'Nueva Zona';
    document.getElementById('nombreZona').value = ''; document.getElementById('btnGuardarZona').innerText = 'Guardar Zona';
    document.getElementById('btnEliminarZona').classList.add('hidden');
    const div = document.getElementById('responsablesZona'); div.innerHTML = '';
    participantesGrupo.forEach(p => div.innerHTML += `<label><input type="checkbox" value="${p}" checked> ${p}</label>`);
}

document.getElementById('btnMostrarFormZona').addEventListener('click', () => { resetFormZona(); document.getElementById('formZona').classList.remove('hidden'); document.getElementById('btnMostrarFormZona').classList.add('hidden'); });
document.getElementById('btnCancelarZona').addEventListener('click', () => { document.getElementById('formZona').classList.add('hidden'); document.getElementById('btnMostrarFormZona').classList.remove('hidden'); });

window.abrirEditarZona = function(idZona) {
    const zonaObj = zonasLimpiezaCache.find(z => z.id === idZona); if(!zonaObj) return;
    idZonaEditando = zonaObj.id; resetFormZona();
    document.getElementById('tituloFormZona').innerText = 'Editar Zona'; document.getElementById('nombreZona').value = zonaObj.nombre_zona;
    document.querySelectorAll('#responsablesZona input[type="checkbox"]').forEach(cb => { cb.checked = zonaObj.responsables.includes(cb.value); });
    document.getElementById('btnGuardarZona').innerText = 'Actualizar'; document.getElementById('btnEliminarZona').classList.remove('hidden');
    document.getElementById('formZona').classList.remove('hidden'); document.getElementById('btnMostrarFormZona').classList.add('hidden');
    document.getElementById('formZona').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('btnEliminarZona').addEventListener('click', async () => {
    const seguro = await window.mostrarConfirmacion("Eliminar Zona", "¿Borrar esta zona de limpieza definitivamente?");
    if (!seguro) return;
    try { await deleteDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZonaEditando)); document.getElementById('btnCancelarZona').click(); await cargarListaLimpieza(); } catch (e) { await window.mostrarAlerta("Error", "No se pudo borrar."); }
});

function obtenerLunes(fecha) { let d = new Date(fecha); let day = d.getDay(); let diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)).setHours(0,0,0,0); }

document.getElementById('btnGuardarZona').addEventListener('click', async () => {
    const nombreZona = document.getElementById('nombreZona').value; const btn = document.getElementById('btnGuardarZona');
    const cbs = document.querySelectorAll('#responsablesZona input[type="checkbox"]:checked'); const resp = Array.from(cbs).map(cb => cb.value);
    if (!nombreZona || resp.length === 0) return await window.mostrarAlerta("Faltan datos", "Indica el nombre y quién limpia.");
    btn.disabled = true; const datos = { nombre_zona: nombreZona, responsables: resp };
    try {
        if (idZonaEditando) await updateDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZonaEditando), datos);
        else { datos.fecha_base = new Date(obtenerLunes(new Date())).toISOString(); await addDoc(collection(db, "grupos", idPisoActual, "zonas_limpieza"), datos); }
        document.getElementById('btnCancelarZona').click(); await cargarListaLimpieza();
    } catch (e) { await window.mostrarAlerta("Error", "Fallo al guardar."); } finally { btn.disabled = false; }
});

async function cargarListaLimpieza() {
    try {
        const q = query(collection(db, "grupos", idPisoActual, "zonas_limpieza")); const snap = await getDocs(q);
        zonasLimpiezaCache = [];
        if (!snap.empty) { snap.forEach(d => { const z = d.data(); z.id = d.id; zonasLimpiezaCache.push(z); }); zonasLimpiezaCache.sort((a, b) => a.nombre_zona.localeCompare(b.nombre_zona)); }
        renderVistaSemanaActual(); renderCalendarioMensual();
    } catch (e) { console.error(e); }
}

function calcularAsignacionesParaSemana(fechaLunes) {
    let asignaciones = []; let asignados = []; 
    zonasLimpiezaCache.forEach((zona, i) => {
        let sem = Math.floor((fechaLunes.getTime() - new Date(zona.fecha_base).getTime()) / 604800000); if (sem < 0) sem = 0;
        let idIdeal = (sem + i) % zona.responsables.length; let toca = zona.responsables[idIdeal]; let libre = false;
        for (let j = 0; j < zona.responsables.length; j++) {
            let cand = zona.responsables[(idIdeal + j) % zona.responsables.length];
            if (!asignados.includes(cand)) { toca = cand; asignados.push(cand); libre = true; break; }
        }
        if (!libre) toca = zona.responsables[idIdeal];
        asignaciones.push({ idZona: zona.id, nombre_zona: zona.nombre_zona, responsables: zona.responsables, leTocaA: toca });
    });
    return asignaciones;
}

function renderVistaSemanaActual() {
    const list = document.getElementById('listaLimpieza');
    if (zonasLimpiezaCache.length === 0) return list.innerHTML = '<p style="color:#86868b; text-align:center;">No hay zonas.</p>';
    const asigs = calcularAsignacionesParaSemana(new Date(obtenerLunes(new Date()))); list.innerHTML = '';
    asigs.forEach(a => {
        const esMi = a.leTocaA === nombreUsuario;
        list.innerHTML += `<div class="item-lista ${esMi ? 'mi-turno' : ''}"><div class="item-info"><span class="item-titulo">${a.nombre_zona}</span><span class="item-detalle">Rotación: ${a.responsables.join(' ➔ ')}</span></div><div style="display: flex; align-items: center; gap: 15px;"><div style="font-weight: 600; font-size: 1.1em; color: ${esMi ? '#32d74b' : '#f5f5f7'}">${esMi ? '¡Te toca!' : a.leTocaA}</div><button style="background:none; border:none; padding:0; cursor:pointer; font-size:1.4em;" onclick='window.abrirEditarZona("${a.idZona}")'>✏️</button></div></div>`;
    });
}

function renderCalendarioMensual() {
    const cont = document.getElementById('contenedorSemanasMes');
    if (zonasLimpiezaCache.length === 0) return cont.innerHTML = '<p style="color:#86868b;">No hay zonas.</p>';
    const mes = fechaCalendario.getMonth(); const anio = fechaCalendario.getFullYear();
    const nombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    document.getElementById('textoMesAnio').innerText = `${nombres[mes]} ${anio}`; cont.innerHTML = '';
    let sem = []; let pivot = new Date(obtenerLunes(new Date(anio, mes, 1)));
    while (pivot.getMonth() === mes || (new Date(pivot.getTime() + 6*86400000)).getMonth() === mes) { sem.push(new Date(pivot)); pivot = new Date(pivot.getTime() + 7 * 86400000); }
    const hoy = new Date(obtenerLunes(new Date())).getTime();
    sem.forEach(l => {
        const dom = new Date(l.getTime() + 6*86400000); const esHoy = l.getTime() === hoy;
        let html = `<div style="background:#1c1c1e; border:${esHoy ? '2px solid #32d74b' : '1px solid #2c2c2e'}; border-radius:12px; padding:14px; margin-bottom:15px;"><h5 style="color:#0a84ff; border-bottom:1px solid #2c2c2e; padding-bottom:8px; font-size:1em;">📅 Del ${l.getDate()} ${nombres[l.getMonth()].substring(0,3)} al ${dom.getDate()} ${nombres[dom.getMonth()].substring(0,3)} ${esHoy ? '<span style="background:#32d74b; color:#000; padding:2px 6px; border-radius:10px; font-size:0.7em; margin-left:5px;">Actual</span>' : ''}</h5>`;
        calcularAsignacionesParaSemana(l).forEach(a => {
            const esM = a.leTocaA === nombreUsuario;
            html += `<div style="display:flex; justify-content:space-between; margin-bottom:8px; ${esM ? 'background: rgba(50, 215, 75, 0.15); padding: 6px 10px; border-radius: 8px; border-left: 3px solid #32d74b;' : 'padding: 6px 10px;'}"><span style="font-weight:600;">${a.nombre_zona}</span><span style="color:${esM ? '#32d74b' : '#86868b'}; font-weight:${esM ? 'bold' : 'normal'};">${esM ? '¡Te toca!' : a.leTocaA}</span></div>`;
        });
        cont.innerHTML += html + `</div>`;
    });
}
document.getElementById('btnToggleCalendario').addEventListener('click', () => {
    const c = document.getElementById('calendarioMensual'); const s = document.getElementById('listaLimpieza'); const b = document.getElementById('btnToggleCalendario');
    if (c.classList.contains('hidden')) { c.classList.remove('hidden'); s.classList.add('hidden'); b.innerText = "Ver Semana"; } else { c.classList.add('hidden'); s.classList.remove('hidden'); b.innerText = "📅 Ver Mes"; }
});
document.getElementById('btnMesAnterior').addEventListener('click', () => { fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() - 1, 1); renderCalendarioMensual(); });
document.getElementById('btnMesSiguiente').addEventListener('click', () => { fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 1); renderCalendarioMensual(); });


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

    const qrContainer = document.getElementById('contenedorQR');
    const qrImg = document.getElementById('imgWifiQR');
    if (tablon.wifi_nombre && tablon.wifi_pass) {
        const wifiString = `WIFI:S:${tablon.wifi_nombre};T:WPA;P:${tablon.wifi_pass};;`;
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(wifiString)}`;
        qrContainer.classList.remove('hidden');
    } else {
        qrContainer.classList.add('hidden');
    }
}

document.getElementById('btnEditarTablon').addEventListener('click', () => { document.getElementById('tablonDisplay').classList.add('hidden'); document.getElementById('tablonForm').classList.remove('hidden'); });
document.getElementById('btnCancelarTablon').addEventListener('click', () => { document.getElementById('tablonForm').classList.add('hidden'); document.getElementById('tablonDisplay').classList.remove('hidden'); });

document.getElementById('btnGuardarTablon').addEventListener('click', async () => {
    const nTablon = { wifi_nombre: document.getElementById('inputWifiNombre').value.trim(), wifi_pass: document.getElementById('inputWifiPass').value.trim(), iban: document.getElementById('inputIban').value.trim(), notas: document.getElementById('inputNotasTablon').value.trim() };
    try {
        document.getElementById('btnGuardarTablon').innerText = "Guardando...";
        await updateDoc(doc(db, "grupos", idPisoActual), { tablon: nTablon });
        cargarTablon(nTablon); document.getElementById('btnCancelarTablon').click();
    } catch (e) { await window.mostrarAlerta("Error", "No se pudo guardar la Info."); } finally { document.getElementById('btnGuardarTablon').innerText = "Guardar"; }
});

document.getElementById('btnCopiarIban').addEventListener('click', async () => {
    const iban = document.getElementById('displayIban').innerText; if(iban === "No configurado") return;
    try { await navigator.clipboard.writeText(iban); await window.mostrarAlerta("Copiado", "IBAN copiado. Abre la app de tu banco."); } catch (e) { await window.mostrarAlerta("Copia manual", iban); }
});

document.getElementById('btnCopiarWifi').addEventListener('click', async () => {
    const pass = document.getElementById('displayWifiPass').innerText; if(pass === "-" || pass === "Sin contraseña") return;
    try { await navigator.clipboard.writeText(pass); await window.mostrarAlerta("Copiado", "Contraseña copiada al portapapeles."); } catch (e) { await window.mostrarAlerta("Contraseña", pass); }
});

// --- MÓDULO RANKING: TÍTULOS ÚNICOS PARA TODOS ---
function generarRanking(gastos, balances) {
    const cont = document.getElementById('contenidoRanking');
    if (participantesGrupo.length === 0) return;
    
    let totalPagado = {}; participantesGrupo.forEach(p => totalPagado[p] = 0);
    gastos.forEach(g => { if(totalPagado[g.pagador] !== undefined) totalPagado[g.pagador] += g.importe; });
    
    let usuarios = participantesGrupo.map(p => ({ nombre: p, saldo: balances[p], pagado: totalPagado[p] }));
    let porSaldo = [...usuarios].sort((a,b) => b.saldo - a.saldo);
    let porPagado = [...usuarios].sort((a,b) => b.pagado - a.pagado);
    
    let asignaciones = [];
    let yaAsignados = new Set();

    let sugar = porSaldo.find(u => u.saldo > 0.01 && !yaAsignados.has(u.nombre));
    if (sugar) { asignaciones.push({ nombre: sugar.nombre, titulo: "El Sugar Daddy", desc: "El banco central del piso. Todos le deben dinero.", color: '#32d74b', emoji: "😎" }); yaAsignados.add(sugar.nombre); }

    let moroso = [...porSaldo].reverse().find(u => u.saldo < -0.01 && !yaAsignados.has(u.nombre));
    if (moroso) { asignaciones.push({ nombre: moroso.nombre, titulo: "El Peligro Financiero", desc: "Suena el teléfono y son los cobradores del frac.", color: '#ff453a', emoji: "🤡" }); yaAsignados.add(moroso.nombre); }

    let inversor = porPagado.find(u => u.pagado > 0 && !yaAsignados.has(u.nombre));
    if (inversor) { asignaciones.push({ nombre: inversor.nombre, titulo: "El Inversor", desc: "Siempre saca la tarjeta primero. Es el dueño de todo.", color: '#0a84ff', emoji: "👑" }); yaAsignados.add(inversor.nombre); }

    let titulosExtra = [
        { t: "El 'Mañana te hago Bizum'", d: "Debe dinero, pero le cuesta soltarlo de la cuenta.", c: '#ff9f0a', e: "🐌" },
        { t: "El Santo Patrón", d: "Cuentas saneadas al máximo. Un ejemplo de convivencia.", c: '#32d74b', e: "😇" },
        { t: "El Suizo", d: "Neutralidad pura. Ni debe ni le deben. Vive en paz.", c: '#86868b', e: "🧘" },
        { t: "El Contable", d: "Calcula todo al céntimo para que le devuelvan lo suyo.", c: '#0a84ff', e: "🕵️" },
        { t: "El Sibarita", d: "Se ha gastado su parte en cosas caras.", c: '#bf5af2', e: "🍷" },
        { t: "El Fantasma", d: "Cero euros movidos. ¿Seguro que sigue viviendo aquí?", c: '#86868b', e: "👻" },
        { t: "Manos Agujereadas", d: "El dinero se le escapa. Tiene deudas pendientes.", c: '#ff9f0a', e: "💸" },
        { t: "El Inquilino Estándar", d: "Cumple su función vital sin hacer ruido.", c: '#86868b', e: "🏠" },
        { t: "El Protegido", d: "Siempre hay alguien que le acaba pagando las cosas.", c: '#bf5af2', e: "🧸" }
    ];

    usuarios.forEach(u => {
        if (!yaAsignados.has(u.nombre)) {
            let extra = titulosExtra.shift() || { t: "El Misterioso", d: "Nadie sabe de dónde saca el dinero.", c: '#86868b', e: "👤" };
            asignaciones.push({ nombre: u.nombre, titulo: extra.t, desc: extra.d, color: extra.c, emoji: extra.e });
            yaAsignados.add(u.nombre);
        }
    });

    let html = "";
    asignaciones.forEach(a => {
        html += `
            <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 15px; margin-bottom: 12px; display: flex; align-items: center; border: 1px solid #2c2c2e; border-left: 4px solid ${a.color};">
                <div style="flex: 1; padding-right: 10px;">
                    <div style="font-size: 0.85em; color: ${a.color}; font-weight: 700; text-transform: uppercase;">${a.titulo}</div>
                    <div style="font-size: 1.25em; font-weight: bold; color: #f5f5f7; margin: 2px 0;">${a.nombre}</div>
                    <div style="font-size: 0.8em; color: #86868b; line-height: 1.3;">${a.desc}</div>
                </div>
                <div style="font-size: 2.8em; margin-left: auto; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">${a.emoji}</div>
            </div>`;
    });
    cont.innerHTML = html;
}

document.getElementById('btnVolverMenu').addEventListener('click', () => { localStorage.removeItem('ultimoPisoActivo'); window.location.href = window.location.pathname; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(()=>{}); });

iniciarApp();
