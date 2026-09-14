import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
// AÑADIDO: updateDoc y deleteDoc para modificar y borrar
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

// Variables Globales
let participantesGrupo = []; 
let idPisoActual = "";
let nombreUsuario = "";
let nombresNuevos = []; 

// Variables para controlar si estamos editando
let idGastoEditando = null;
let idZonaEditando = null;
let zonaEditandoFechaBase = null; // Para no perder la rotación al editar

let misPisos = JSON.parse(localStorage.getItem('misPisos_v2')) || [];

// Referencias HTML
const pantallaCrear = document.getElementById('pantallaCrear');
const pantallaUnirse = document.getElementById('pantallaUnirse');
const pantallaMisPisos = document.getElementById('pantallaMisPisos');
const pantallaDashboard = document.getElementById('pantallaDashboard');

async function iniciarApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const pisoIdUrl = urlParams.get('id');

    if (pisoIdUrl) {
        document.body.classList.add('pantalla-centrada');
        pantallaUnirse.classList.remove('hidden');
        await cargarPantallaUnirse(pisoIdUrl);
        return;
    }

    if (misPisos.length > 0) {
        document.body.classList.add('pantalla-centrada');
        mostrarPantallaMisPisos();
    } else {
        document.body.classList.add('pantalla-centrada');
        pantallaCrear.classList.remove('hidden');
    }
}

// --- PANTALLAS DE INICIO ---

function mostrarPantallaMisPisos() {
    pantallaMisPisos.classList.remove('hidden');
    pantallaCrear.classList.add('hidden');
    document.getElementById('btnCancelarCrear').classList.remove('hidden');
    
    const div = document.getElementById('listaMisPisos');
    div.innerHTML = '';
    
    misPisos.forEach(piso => {
        const btn = document.createElement('button');
        btn.className = 'btn-name';
        btn.innerHTML = `${piso.nombrePiso} <br><small style="font-weight:normal; font-size:0.85em;">Entrar como ${piso.nombreUsuario}</small>`;
        btn.onclick = () => {
            document.body.classList.remove('pantalla-centrada');
            pantallaMisPisos.classList.add('hidden');
            nombreUsuario = piso.nombreUsuario;
            idPisoActual = piso.id;
            mostrarDashboard(piso.nombreUsuario, piso.id);
        };
        div.appendChild(btn);
    });
}

document.getElementById('btnIrCrearPiso').addEventListener('click', () => {
    pantallaMisPisos.classList.add('hidden'); pantallaCrear.classList.remove('hidden');
});
document.getElementById('btnCancelarCrear').addEventListener('click', () => {
    pantallaCrear.classList.add('hidden'); pantallaMisPisos.classList.remove('hidden');
});

document.getElementById('btnAñadirNombre').addEventListener('click', () => {
    const input = document.getElementById('inputNuevoNombre');
    const nombre = input.value.trim();
    if (nombre && !nombresNuevos.includes(nombre)) {
        nombresNuevos.push(nombre);
        actualizarListaNuevosNombres();
        input.value = '';
    }
});

function actualizarListaNuevosNombres() {
    const contenedor = document.getElementById('contenedorNuevosNombres');
    contenedor.innerHTML = '';
    nombresNuevos.forEach((nombre, index) => {
        contenedor.innerHTML += `<div class="tag-nombre"><span>👤 ${nombre}</span><span class="tag-eliminar" onclick="quitarNombre(${index})">✕</span></div>`;
    });
}
window.quitarNombre = function(index) {
    nombresNuevos.splice(index, 1); actualizarListaNuevosNombres();
};

document.getElementById('btnCrear').addEventListener('click', async () => {
    const nombrePiso = document.getElementById('nombrePiso').value;
    const boton = document.getElementById('btnCrear');
    if (!nombrePiso || nombresNuevos.length === 0) { alert("Escribe el nombre del piso y añade al menos a un inquilino."); return; }
    
    boton.innerText = "Creando..."; boton.disabled = true;
    const idUnico = 'piso-' + Math.random().toString(36).substring(2, 8);
    
    try {
        await setDoc(doc(db, "grupos", idUnico), {
            id: idUnico, nombre_piso: nombrePiso, creador: nombresNuevos[0],
            participantes: nombresNuevos, fecha_creacion: new Date().toISOString()
        });
        const enlaceLocal = `${window.location.origin}${window.location.pathname}?id=${idUnico}`;
        document.getElementById('resultado').innerHTML = `<span style="color: green; font-weight: bold;">¡Piso creado!</span><br><br>Copia este enlace o pincha para entrar:<br><a href="${enlaceLocal}"><b>${enlaceLocal}</b></a>`;
        document.getElementById('nombrePiso').value = ""; nombresNuevos = []; actualizarListaNuevosNombres();
    } catch (error) { alert("Error al guardar."); } finally { boton.innerText = "Crear Piso"; boton.disabled = false; }
});

async function cargarPantallaUnirse(id) {
    try {
        const docRef = doc(db, "grupos", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const datosPiso = docSnap.data();
            document.getElementById('tituloUnirse').innerText = `🏡 ${datosPiso.nombre_piso}`;
            const listaNombres = document.getElementById('listaNombres');
            listaNombres.innerHTML = ''; 
            datosPiso.participantes.forEach(nombre => {
                const btn = document.createElement('button'); btn.innerText = nombre; btn.className = 'btn-name';
                btn.onclick = () => unirseYGuardar(nombre, id, datosPiso.nombre_piso);
                listaNombres.appendChild(btn);
            });
        } else { document.getElementById('tituloUnirse').innerText = "❌ El piso no existe"; }
    } catch (error) { document.getElementById('tituloUnirse').innerText = "Error de conexión"; }
}

function unirseYGuardar(nombre, id, nombrePiso) {
    misPisos = misPisos.filter(piso => piso.id !== id);
    misPisos.push({ id: id, nombrePiso: nombrePiso, nombreUsuario: nombre });
    localStorage.setItem('misPisos_v2', JSON.stringify(misPisos));
    nombreUsuario = nombre; idPisoActual = id;
    pantallaUnirse.classList.add('hidden'); document.body.classList.remove('pantalla-centrada');
    window.history.pushState({}, document.title, window.location.pathname);
    mostrarDashboard(nombre, id);
}

async function mostrarDashboard(nombre, id) {
    pantallaDashboard.classList.remove('hidden');
    const docRef = doc(db, "grupos", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const datos = docSnap.data();
        document.getElementById('tituloDashboard').innerText = datos.nombre_piso;
        document.getElementById('nombreUsuarioActual').innerText = nombre;
        participantesGrupo = datos.participantes;
        
        await cargarListaGastos();
        await cargarListaLimpieza();
    }
}

// PESTAÑAS
document.getElementById('tabGastos').addEventListener('click', () => {
    document.getElementById('tabGastos').classList.add('active'); document.getElementById('tabLimpieza').classList.remove('active');
    document.getElementById('vistaGastos').classList.remove('hidden'); document.getElementById('vistaLimpieza').classList.add('hidden');
});
document.getElementById('tabLimpieza').addEventListener('click', () => {
    document.getElementById('tabLimpieza').classList.add('active'); document.getElementById('tabGastos').classList.remove('active');
    document.getElementById('vistaLimpieza').classList.remove('hidden'); document.getElementById('vistaGastos').classList.add('hidden');
});

// --- MÓDULO GASTOS ---

function resetFormGasto() {
    idGastoEditando = null;
    document.getElementById('tituloFormGasto').innerText = 'Nuevo Gasto';
    document.getElementById('conceptoGasto').value = '';
    document.getElementById('importeGasto').value = '';
    document.getElementById('btnGuardarGasto').innerText = 'Guardar Gasto';
    document.getElementById('btnEliminarGasto').classList.add('hidden');
    prepararFormularioGastos(); // Resetea checks y select
}

document.getElementById('btnMostrarFormGasto').addEventListener('click', () => {
    resetFormGasto();
    document.getElementById('formGasto').classList.remove('hidden');
    document.getElementById('btnMostrarFormGasto').classList.add('hidden');
});

document.getElementById('btnCancelarGasto').addEventListener('click', () => {
    document.getElementById('formGasto').classList.add('hidden');
    document.getElementById('btnMostrarFormGasto').classList.remove('hidden');
});

function prepararFormularioGastos() {
    const selectPagador = document.getElementById('pagadorGasto');
    const divInvolucrados = document.getElementById('involucradosGasto');
    selectPagador.innerHTML = ''; divInvolucrados.innerHTML = '';
    participantesGrupo.forEach(participante => {
        const option = document.createElement('option'); option.value = participante; option.innerText = participante;
        if (participante === nombreUsuario) option.selected = true;
        selectPagador.appendChild(option);
        const label = document.createElement('label'); label.innerHTML = `<input type="checkbox" value="${participante}" checked> ${participante}`;
        divInvolucrados.appendChild(label);
    });
}

// Función para abrir form en modo Edición
window.abrirEditarGasto = function(gastoObj) {
    idGastoEditando = gastoObj.id;
    prepararFormularioGastos(); // Generar combos
    
    document.getElementById('tituloFormGasto').innerText = 'Editar Gasto';
    document.getElementById('conceptoGasto').value = gastoObj.concepto;
    document.getElementById('importeGasto').value = gastoObj.importe;
    document.getElementById('pagadorGasto').value = gastoObj.pagador;
    
    // Marcar checks correspondientes
    const checkboxes = document.querySelectorAll('#involucradosGasto input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = gastoObj.involucrados.includes(cb.value);
    });

    document.getElementById('btnGuardarGasto').innerText = 'Actualizar Gasto';
    document.getElementById('btnEliminarGasto').classList.remove('hidden');
    
    document.getElementById('formGasto').classList.remove('hidden');
    document.getElementById('btnMostrarFormGasto').classList.add('hidden');
    document.getElementById('formGasto').scrollIntoView({ behavior: 'smooth' });
};

// Eliminar Gasto
document.getElementById('btnEliminarGasto').addEventListener('click', async () => {
    if (!confirm("¿Seguro que quieres eliminar este gasto? Esto recalculará las deudas.")) return;
    
    const boton = document.getElementById('btnEliminarGasto');
    boton.innerText = "Borrando..."; boton.disabled = true;
    
    try {
        await deleteDoc(doc(db, "grupos", idPisoActual, "gastos", idGastoEditando));
        document.getElementById('btnCancelarGasto').click(); // Cierra formulario
        await cargarListaGastos();
    } catch (error) { 
        alert("Error al eliminar."); 
    } finally { 
        boton.innerText = "Eliminar"; boton.disabled = false; 
    }
});

// Guardar o Actualizar Gasto
document.getElementById('btnGuardarGasto').addEventListener('click', async () => {
    const concepto = document.getElementById('conceptoGasto').value; 
    const importeStr = document.getElementById('importeGasto').value;
    const pagador = document.getElementById('pagadorGasto').value; 
    const boton = document.getElementById('btnGuardarGasto');
    
    const checkboxes = document.querySelectorAll('#involucradosGasto input[type="checkbox"]:checked');
    const involucrados = Array.from(checkboxes).map(cb => cb.value);
    
    if (!concepto || !importeStr || involucrados.length === 0) { alert("Faltan datos."); return; }
    
    boton.innerText = idGastoEditando ? "Actualizando..." : "Guardando..."; 
    boton.disabled = true;
    
    const datosGasto = {
        concepto: concepto, 
        importe: parseFloat(importeStr), 
        pagador: pagador, 
        involucrados: involucrados
    };

    try {
        if (idGastoEditando) {
            // ACTUALIZAR
            await updateDoc(doc(db, "grupos", idPisoActual, "gastos", idGastoEditando), datosGasto);
        } else {
            // CREAR NUEVO (añadimos fecha solo al crear)
            datosGasto.fecha = new Date().toISOString();
            await addDoc(collection(db, "grupos", idPisoActual, "gastos"), datosGasto);
        }
        document.getElementById('btnCancelarGasto').click(); 
        await cargarListaGastos();
    } catch (error) { 
        alert("Error al guardar."); 
    } finally { 
        boton.disabled = false; 
    }
});

async function cargarListaGastos() {
    const listaHtml = document.getElementById('listaGastos'); listaHtml.innerHTML = 'Cargando...';
    try {
        const q = query(collection(db, "grupos", idPisoActual, "gastos"), orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);
        let gastosTotales = [];
        
        if (querySnapshot.empty) {
            listaHtml.innerHTML = '<p style="color:#666; text-align:center;">No hay gastos todavía.</p>';
            document.getElementById('listaBalances').innerHTML = '<p style="color:#666;">Sin actividad</p>';
            document.getElementById('listaDeudas').innerHTML = ''; return;
        }
        
        listaHtml.innerHTML = '';
        querySnapshot.forEach((docSnap) => {
            const gasto = docSnap.data(); 
            gasto.id = docSnap.id; // ¡Importante guardar el ID!
            gastosTotales.push(gasto); 
            
            const divGasto = document.createElement('div'); 
            divGasto.className = 'item-lista';
            
            // Construcción del HTML dinámico para inyectar el botón correctamente
            const divInfo = document.createElement('div');
            divInfo.className = 'item-info';
            divInfo.innerHTML = `<span class="item-titulo">${gasto.concepto}</span><span class="item-detalle">${gasto.pagador} pagó para ${gasto.involucrados.length} • ${new Date(gasto.fecha).toLocaleDateString('es-ES')}</span>`;
            
            const divDerecha = document.createElement('div');
            divDerecha.style.cssText = 'display: flex; align-items: center; gap: 10px;';
            divDerecha.innerHTML = `<span class="gasto-importe">${gasto.importe.toFixed(2)}€</span>`;
            
            const btnEditar = document.createElement('button');
            btnEditar.innerHTML = '✏️';
            btnEditar.style.cssText = 'background:none; border:none; padding:0; cursor:pointer; font-size:1.4em; width:auto; margin:0;';
            btnEditar.onclick = () => window.abrirEditarGasto(gasto);
            
            divDerecha.appendChild(btnEditar);
            divGasto.appendChild(divInfo);
            divGasto.appendChild(divDerecha);
            
            listaHtml.appendChild(divGasto);
        });
        calcularBalancesYDeudas(gastosTotales);
    } catch (error) { listaHtml.innerHTML = 'Error al cargar los gastos.'; }
}

function calcularBalancesYDeudas(gastos) {
    let balances = {}; participantesGrupo.forEach(p => balances[p] = 0);
    gastos.forEach(gasto => {
        const costePorPersona = gasto.importe / gasto.involucrados.length;
        if (balances[gasto.pagador] !== undefined) balances[gasto.pagador] += gasto.importe;
        gasto.involucrados.forEach(involucrado => { if (balances[involucrado] !== undefined) balances[involucrado] -= costePorPersona; });
    });
    let htmlBalances = ''; let deudores = []; let acreedores = [];
    for (let persona in balances) {
        let saldo = balances[persona];
        let color = saldo >= -0.01 && saldo <= 0.01 ? 'black' : (saldo > 0 ? 'green' : 'red');
        htmlBalances += `<div class="balance-item"><span>${persona}</span><span style="color: ${color}; font-weight: bold;">${saldo.toFixed(2)}€</span></div>`;
        if (saldo < -0.01) deudores.push({ nombre: persona, cantidad: Math.abs(saldo) });
        if (saldo > 0.01) acreedores.push({ nombre: persona, cantidad: saldo });
    }
    document.getElementById('listaBalances').innerHTML = htmlBalances;
    deudores.sort((a, b) => b.cantidad - a.cantidad); acreedores.sort((a, b) => b.cantidad - a.cantidad);
    let htmlDeudas = ''; let i = 0; let j = 0;
    if (deudores.length === 0) { htmlDeudas = '<p style="color:green; font-weight:bold;">✅ Cuentas saldadas</p>'; } else {
        htmlDeudas = '<h5 style="margin: 0 0 10px 0;">Cómo saldar deudas:</h5>';
        while (i < deudores.length && j < acreedores.length) {
            let deudor = deudores[i]; let acreedor = acreedores[j];
            let cantidadATransferir = Math.min(deudor.cantidad, acreedor.cantidad);
            htmlDeudas += `<div class="deuda-item">💸 <b>${deudor.nombre}</b> debe pagar <b>${cantidadATransferir.toFixed(2)}€</b> a <b>${acreedor.nombre}</b></div>`;
            deudor.cantidad -= cantidadATransferir; acreedor.cantidad -= cantidadATransferir;
            if (deudor.cantidad < 0.01) i++; if (acreedor.cantidad < 0.01) j++;
        }
    }
    document.getElementById('listaDeudas').innerHTML = htmlDeudas;
}

// --- MÓDULO LIMPIEZA ---

function resetFormZona() {
    idZonaEditando = null;
    zonaEditandoFechaBase = null;
    document.getElementById('tituloFormZona').innerText = 'Nueva Zona';
    document.getElementById('nombreZona').value = '';
    document.getElementById('btnGuardarZona').innerText = 'Guardar Zona';
    document.getElementById('btnEliminarZona').classList.add('hidden');
    prepararFormularioLimpieza();
}

document.getElementById('btnMostrarFormZona').addEventListener('click', () => {
    resetFormZona();
    document.getElementById('formZona').classList.remove('hidden'); 
    document.getElementById('btnMostrarFormZona').classList.add('hidden');
});

document.getElementById('btnCancelarZona').addEventListener('click', () => {
    document.getElementById('formZona').classList.add('hidden'); 
    document.getElementById('btnMostrarFormZona').classList.remove('hidden');
});

function prepararFormularioLimpieza() {
    const divResponsables = document.getElementById('responsablesZona');
    divResponsables.innerHTML = '';
    participantesGrupo.forEach(participante => {
        const label = document.createElement('label'); 
        label.innerHTML = `<input type="checkbox" value="${participante}" checked> ${participante}`;
        divResponsables.appendChild(label);
    });
}

// Abrir form de zona en edición
window.abrirEditarZona = function(zonaObj) {
    idZonaEditando = zonaObj.id;
    zonaEditandoFechaBase = zonaObj.fecha_base; // Conservamos la fecha para no romper la rotación
    prepararFormularioLimpieza();
    
    document.getElementById('tituloFormZona').innerText = 'Editar Zona';
    document.getElementById('nombreZona').value = zonaObj.nombre_zona;
    
    const checkboxes = document.querySelectorAll('#responsablesZona input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = zonaObj.responsables.includes(cb.value);
    });

    document.getElementById('btnGuardarZona').innerText = 'Actualizar Zona';
    document.getElementById('btnEliminarZona').classList.remove('hidden');
    
    document.getElementById('formZona').classList.remove('hidden');
    document.getElementById('btnMostrarFormZona').classList.add('hidden');
    document.getElementById('formZona').scrollIntoView({ behavior: 'smooth' });
};

// Eliminar Zona
document.getElementById('btnEliminarZona').addEventListener('click', async () => {
    if (!confirm("¿Seguro que quieres eliminar esta zona de limpieza?")) return;
    const boton = document.getElementById('btnEliminarZona');
    boton.innerText = "Borrando..."; boton.disabled = true;
    try {
        await deleteDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZonaEditando));
        document.getElementById('btnCancelarZona').click();
        await cargarListaLimpieza();
    } catch (error) { 
        alert("Error al eliminar."); 
    } finally { 
        boton.innerText = "Eliminar"; boton.disabled = false; 
    }
});

function obtenerLunes(fecha) {
    let d = new Date(fecha);
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).setHours(0,0,0,0);
}

// Guardar o Actualizar Zona
document.getElementById('btnGuardarZona').addEventListener('click', async () => {
    const nombreZona = document.getElementById('nombreZona').value;
    const boton = document.getElementById('btnGuardarZona');
    const checkboxes = document.querySelectorAll('#responsablesZona input[type="checkbox"]:checked');
    const responsables = Array.from(checkboxes).map(cb => cb.value);

    if (!nombreZona || responsables.length === 0) { alert("Rellena la zona y selecciona responsables."); return; }

    boton.innerText = idZonaEditando ? "Actualizando..." : "Guardando..."; 
    boton.disabled = true;
    
    const datosZona = {
        nombre_zona: nombreZona,
        responsables: responsables
    };

    try {
        if (idZonaEditando) {
            // Actualizar (Mantenemos la fecha base intacta en Firestore)
            await updateDoc(doc(db, "grupos", idPisoActual, "zonas_limpieza", idZonaEditando), datosZona);
        } else {
            // Crear nueva
            datosZona.fecha_base = new Date(obtenerLunes(new Date())).toISOString();
            await addDoc(collection(db, "grupos", idPisoActual, "zonas_limpieza"), datosZona);
        }
        document.getElementById('btnCancelarZona').click(); 
        await cargarListaLimpieza();
    } catch (error) { 
        alert("Error al guardar."); 
    } finally { 
        boton.disabled = false; 
    }
});

async function cargarListaLimpieza() {
    const listaHtml = document.getElementById('listaLimpieza'); listaHtml.innerHTML = 'Cargando...';
    try {
        const q = query(collection(db, "grupos", idPisoActual, "zonas_limpieza"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            listaHtml.innerHTML = '<p style="color:#666; text-align:center;">Aún no hay zonas de limpieza creadas.</p>'; return;
        }

        let zonas = [];
        querySnapshot.forEach((docSnap) => {
            const z = docSnap.data();
            z.id = docSnap.id; // ¡Importante!
            zonas.push(z);
        });
        
        zonas.sort((a, b) => a.nombre_zona.localeCompare(b.nombre_zona));
        listaHtml.innerHTML = '';
        const lunesActual = obtenerLunes(new Date());

        zonas.forEach((zona, index) => {
            const lunesBase = new Date(zona.fecha_base).getTime();
            let semanasTranscurridas = Math.floor((lunesActual - lunesBase) / 604800000);
            if (semanasTranscurridas < 0) semanasTranscurridas = 0;

            const indiceLeToca = (semanasTranscurridas + index) % zona.responsables.length;
            const leTocaA = zona.responsables[indiceLeToca];
            
            const divZona = document.createElement('div');
            divZona.className = 'item-lista ' + (leTocaA === nombreUsuario ? 'mi-turno' : '');
            
            const rotacionVisual = zona.responsables.join(' ➔ ');

            const divInfo = document.createElement('div');
            divInfo.className = 'item-info';
            divInfo.innerHTML = `<span class="item-titulo">${zona.nombre_zona}</span><span class="item-detalle">Rotación: ${rotacionVisual}</span>`;
            
            const divDerecha = document.createElement('div');
            divDerecha.style.cssText = 'display: flex; align-items: center; gap: 15px;';
            divDerecha.innerHTML = `<div style="font-weight: bold; font-size: 1.1em; color: ${leTocaA === nombreUsuario ? '#155724' : '#333'}">${leTocaA === nombreUsuario ? '¡Te toca!' : leTocaA}</div>`;
            
            const btnEditar = document.createElement('button');
            btnEditar.innerHTML = '✏️';
            btnEditar.style.cssText = 'background:none; border:none; padding:0; cursor:pointer; font-size:1.4em; width:auto; margin:0;';
            btnEditar.onclick = () => window.abrirEditarZona(zona);
            
            divDerecha.appendChild(btnEditar);
            divZona.appendChild(divInfo);
            divZona.appendChild(divDerecha);
            
            listaHtml.appendChild(divZona);
        });
    } catch (error) { console.error(error); listaHtml.innerHTML = 'Error al cargar las tareas.'; }
}

document.getElementById('btnVolverMenu').addEventListener('click', () => {
    window.location.href = window.location.pathname; 
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('Fallo SW: ', err));
    });
}

iniciarApp();
