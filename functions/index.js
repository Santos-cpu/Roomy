/* eslint-disable */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const WEEK_MS = 604800000; // 7 días en milisegundos

function obtenerLunesMadrid(fecha = new Date()) {
    // Obtenemos año, mes y día en la zona horaria Europe/Madrid
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    const parts = formatter.formatToParts(fecha);
    const y = Number(parts.find(p => p.type === "year").value);
    const m = Number(parts.find(p => p.type === "month").value) - 1;
    const d = Number(parts.find(p => p.type === "day").value);

    // Creamos fecha local a medianoche en horario de Madrid
    const strLocal = new Date(Date.UTC(y, m, d, 12, 0, 0));
    const day = strLocal.getUTCDay();
    const diff = strLocal.getUTCDate() - day + (day === 0 ? -6 : 1);
    const lunesUTC = new Date(Date.UTC(y, m, diff, 0, 0, 0));

    // Ajuste del offset de Europe/Madrid en ese lunes (CET = +1h, CEST = +2h)
    const tzParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        timeZoneName: "shortOffset"
    }).formatToParts(lunesUTC);
    const tzName = (tzParts.find(p => p.type === "timeZoneName") || {}).value || "GMT+1";
    const match = tzName.match(/GMT([+-]\d+)/);
    const offsetHours = match ? Number(match[1]) : 1;

    return lunesUTC.getTime() - (offsetHours * 3600000);
}

function sumarDiasMadrid(ts, dias) {
    return obtenerLunesMadrid(new Date(ts + (dias * 86400000) + 12 * 3600000));
}

const TS_CORTE_NUEVA_ROTACION = obtenerLunesMadrid(new Date("2026-11-16T12:00:00Z"));

function obtenerEnMapaSemana(mapa, tsLunes) {
    if (!mapa) return undefined;
    if (mapa[tsLunes] !== undefined) return mapa[tsLunes];
    if (mapa[tsLunes - 3600000] !== undefined) return mapa[tsLunes - 3600000];
    if (mapa[tsLunes + 3600000] !== undefined) return mapa[tsLunes + 3600000];
    return undefined;
}

function esZonaComunParaTodos(zona, participantesGrupo, todasZonas) {
    if (!zona || !Array.isArray(zona.responsables) || zona.responsables.length === 0) return false;
    if (participantesGrupo.length > 0) {
        return zona.responsables.length >= participantesGrupo.length &&
               participantesGrupo.every(p => zona.responsables.includes(p));
    }
    const maxResp = Math.max(...todasZonas.map(z => (z.responsables || []).length), 0);
    return maxResp > 1 && zona.responsables.length === maxResp;
}

function obtenerListaCanonica(zona, participantesGrupo) {
    if (participantesGrupo.length > 0) {
        const filtrados = participantesGrupo.filter(p => (zona.responsables || []).includes(p));
        if (filtrados.length === (zona.responsables || []).length && filtrados.length > 0) {
            return filtrados;
        }
    }
    return [...(zona.responsables || [])];
}

function calcularTurnosClasicosSemana(zonas, tsLunes) {
    const res = {};
    const asignadosSemana = [];

    for (let i = 0; i < zonas.length; i++) {
        const zona = zonas[i];
        const resp = zona.responsables || [];
        if (resp.length === 0) continue;

        const congelado = obtenerEnMapaSemana(zona.asignaciones_semana, tsLunes);
        if (congelado && resp.includes(congelado)) {
            res[zona.id] = congelado;
            asignadosSemana.push(congelado);
            continue;
        }

        const anclaExacta = obtenerEnMapaSemana(zona.anclas_turno, tsLunes);
        if (anclaExacta && resp.includes(anclaExacta)) {
            res[zona.id] = anclaExacta;
            asignadosSemana.push(anclaExacta);
            continue;
        }

        const freq = zona.frecuencia || 1;
        const tsBase = obtenerLunesMadrid(new Date(zona.fecha_base));
        const semDiff = Math.round((tsLunes - tsBase) / WEEK_MS);
        if (semDiff < 0 || semDiff % freq !== 0) continue;

        let mejorTsAncla = -Infinity;
        let respAncla = null;
        const anclas = zona.anclas_turno || {};
        Object.keys(anclas).forEach(k => {
            const tk = obtenerLunesMadrid(new Date(Number(k)));
            if (tk <= tsLunes && tk >= mejorTsAncla && resp.includes(anclas[k])) {
                mejorTsAncla = tk;
                respAncla = anclas[k];
            }
        });

        let idIdeal;
        if (respAncla !== null && isFinite(mejorTsAncla)) {
            const ciclosDesdeAncla = Math.round((tsLunes - mejorTsAncla) / (WEEK_MS * freq));
            const idxBase = resp.indexOf(respAncla);
            idIdeal = ((idxBase + ciclosDesdeAncla) % resp.length + resp.length) % resp.length;
        } else {
            const periodos = Math.floor(semDiff / freq);
            idIdeal = ((periodos + i) % resp.length + resp.length) % resp.length;
        }

        let toca = resp[idIdeal];
        let libre = false;
        for (let j = 0; j < resp.length; j++) {
            const cand = resp[(idIdeal + j) % resp.length];
            if (!asignadosSemana.includes(cand)) {
                toca = cand;
                asignadosSemana.push(cand);
                libre = true;
                break;
            }
        }
        if (!libre) {
            toca = resp[idIdeal];
            asignadosSemana.push(toca);
        }

        res[zona.id] = toca;
    }

    return res;
}

function calcularAsignacionesSemanaActualServidor(participantesGrupo, zonas, tsHoy) {
    if (zonas.length === 0) return {};

    let minTime = Infinity;
    zonas.forEach(z => {
        const tb = obtenerLunesMadrid(new Date(z.fecha_base));
        if (isFinite(tb) && tb < minTime) minTime = tb;
        Object.keys(z.anclas_turno || {}).forEach(k => {
            const tk = obtenerLunesMadrid(new Date(Number(k)));
            if (isFinite(tk) && tk < minTime) minTime = tk;
        });
    });
    if (!isFinite(minTime)) minTime = tsHoy;

    const estadoZonas = {};
    const ordenComunes = [];
    const ordenParciales = [];

    zonas.forEach(z => {
        const lista = obtenerListaCanonica(z, participantesGrupo);
        const esComun = esZonaComunParaTodos(z, participantesGrupo, zonas);
        if (esComun) ordenComunes.push(z);
        else ordenParciales.push(z);

        const conteos = {};
        const ultimaSem = {};
        lista.forEach((p, idxP) => {
            conteos[p] = 0;
            ultimaSem[p] = -1000 + idxP;
        });

        estadoZonas[z.id] = { zona: z, lista, esComun, conteos, ultimaSem };
    });

    const porSemana = {};
    let t = minTime;
    let numSemanaGlobal = 0;

    while (t <= tsHoy) {
        if (t < TS_CORTE_NUEVA_ROTACION) {
            porSemana[t] = calcularTurnosClasicosSemana(zonas, t);
            t = sumarDiasMadrid(t, 7);
            continue;
        }

        porSemana[t] = {};
        const ocupadosEnComunes = new Set();
        const cargaTotalSemana = {};
        participantesGrupo.forEach(p => cargaTotalSemana[p] = 0);

        const estaActivaEnSemana = (zona) => {
            const freq = zona.frecuencia || 1;
            const tsBase = obtenerLunesMadrid(new Date(zona.fecha_base));
            const semDiff = Math.round((t - tsBase) / WEEK_MS);
            const anclaEx = obtenerEnMapaSemana(zona.anclas_turno, t);
            if (anclaEx && (zona.responsables || []).includes(anclaEx)) return true;
            const congeladoEx = obtenerEnMapaSemana(zona.asignaciones_semana, t);
            if (congeladoEx && (zona.responsables || []).includes(congeladoEx)) return true;
            if (semDiff < 0 || semDiff % freq !== 0) return false;
            return (zona.responsables || []).length > 0;
        };

        const comunesActivas = ordenComunes.filter(estaActivaEnSemana);
        const comunesPendientes = [];

        comunesActivas.forEach(z => {
            const st = estadoZonas[z.id];
            const forzado = obtenerEnMapaSemana(z.anclas_turno, t);
            const congelado = !forzado && t <= tsHoy ? obtenerEnMapaSemana(z.asignaciones_semana, t) : undefined;

            if (forzado && st.lista.includes(forzado)) {
                const minC = Math.min(...st.lista.map(p => st.conteos[p]));
                st.lista.forEach(p => { st.conteos[p] = minC; });
                st.conteos[forzado] = minC + 1;
                st.ultimaSem[forzado] = numSemanaGlobal;
                porSemana[t][z.id] = forzado;
                ocupadosEnComunes.add(forzado);
                cargaTotalSemana[forzado] = (cargaTotalSemana[forzado] || 0) + 1;
            } else if (congelado && st.lista.includes(congelado)) {
                st.conteos[congelado]++;
                st.ultimaSem[congelado] = numSemanaGlobal;
                porSemana[t][z.id] = congelado;
                ocupadosEnComunes.add(congelado);
                cargaTotalSemana[congelado] = (cargaTotalSemana[congelado] || 0) + 1;
            } else {
                comunesPendientes.push(z);
            }
        });

        comunesPendientes.forEach((z, idxZ) => {
            const st = estadoZonas[z.id];
            const minCount = Math.min(...st.lista.map(p => st.conteos[p]));
            let elegibles = st.lista.filter(p => st.conteos[p] === minCount);
            let sinComun = elegibles.filter(p => !ocupadosEnComunes.has(p));
            if (sinComun.length === 0) {
                sinComun = st.lista.filter(p => !ocupadosEnComunes.has(p) && st.conteos[p] <= minCount + 1);
            }
            const pool = sinComun.length > 0 ? sinComun : elegibles;

            pool.sort((a, b) => {
                if (st.conteos[a] !== st.conteos[b]) return st.conteos[a] - st.conteos[b];
                if (st.ultimaSem[a] !== st.ultimaSem[b]) return st.ultimaSem[a] - st.ultimaSem[b];
                const idxA = (st.lista.indexOf(a) - idxZ + st.lista.length) % st.lista.length;
                const idxB = (st.lista.indexOf(b) - idxZ + st.lista.length) % st.lista.length;
                return idxA - idxB;
            });

            const elegido = pool[0];
            st.conteos[elegido]++;
            st.ultimaSem[elegido] = numSemanaGlobal;
            porSemana[t][z.id] = elegido;
            ocupadosEnComunes.add(elegido);
            cargaTotalSemana[elegido] = (cargaTotalSemana[elegido] || 0) + 1;
        });

        const parcialesActivas = ordenParciales.filter(estaActivaEnSemana);
        parcialesActivas.forEach((z, idxP) => {
            const st = estadoZonas[z.id];
            const forzado = obtenerEnMapaSemana(z.anclas_turno, t);
            const congelado = !forzado && t <= tsHoy ? obtenerEnMapaSemana(z.asignaciones_semana, t) : undefined;

            if (forzado && st.lista.includes(forzado)) {
                const minC = Math.min(...st.lista.map(p => st.conteos[p]));
                st.lista.forEach(p => { st.conteos[p] = minC; });
                st.conteos[forzado] = minC + 1;
                st.ultimaSem[forzado] = numSemanaGlobal;
                porSemana[t][z.id] = forzado;
                cargaTotalSemana[forzado] = (cargaTotalSemana[forzado] || 0) + 1;
                return;
            }

            if (congelado && st.lista.includes(congelado)) {
                st.conteos[congelado]++;
                st.ultimaSem[congelado] = numSemanaGlobal;
                porSemana[t][z.id] = congelado;
                cargaTotalSemana[congelado] = (cargaTotalSemana[congelado] || 0) + 1;
                return;
            }

            const minCount = Math.min(...st.lista.map(p => st.conteos[p]));
            const elegiblesCiclo = st.lista.filter(p => st.conteos[p] === minCount);

            elegiblesCiclo.sort((a, b) => {
                const cargaA = cargaTotalSemana[a] || 0;
                const cargaB = cargaTotalSemana[b] || 0;
                if (cargaA !== cargaB) return cargaA - cargaB;
                if (st.ultimaSem[a] !== st.ultimaSem[b]) return st.ultimaSem[a] - st.ultimaSem[b];
                const idxA = (st.lista.indexOf(a) + idxP) % st.lista.length;
                const idxB = (st.lista.indexOf(b) + idxP) % st.lista.length;
                return idxA - idxB;
            });

            const elegido = elegiblesCiclo[0];
            st.conteos[elegido]++;
            st.ultimaSem[elegido] = numSemanaGlobal;
            porSemana[t][z.id] = elegido;
            cargaTotalSemana[elegido] = (cargaTotalSemana[elegido] || 0) + 1;
        });

        t = sumarDiasMadrid(t, 7);
        numSemanaGlobal++;
    }

    return porSemana[tsHoy] || {};
}

// 1. Robot del Lunes (Se ejecuta todos los lunes a las 09:00 hora española)
exports.robotLunes = onSchedule({
  schedule: "0 9 * * 1",
  timeZone: "Europe/Madrid"
}, async (event) => {
    await procesarNotificaciones(false);
});

// 2. Robot del Domingo (Se ejecuta todos los domingos a las 20:00 hora española)
exports.robotDomingo = onSchedule({
  schedule: "0 20 * * 0",
  timeZone: "Europe/Madrid"
}, async (event) => {
    await procesarNotificaciones(true);
});

// El Motor Matemático del Servidor (Sincronizado con app.js)
async function procesarNotificaciones(esDomingo) {
    const tsHoy = obtenerLunesMadrid(new Date());
    const gruposSnap = await db.collection("grupos").get();
    
    for (const grupoDoc of gruposSnap.docs) {
        const grupoId = grupoDoc.id;
        const datosGrupo = grupoDoc.data() || {};
        const participantesGrupo = datosGrupo.participantes || [];
        const zonasSnap = await db.collection(`grupos/${grupoId}/zonas_limpieza`).get();
        
        let zonas = [];
        zonasSnap.forEach(doc => {
            let z = doc.data(); z.id = doc.id; zonas.push(z);
        });
        zonas.sort((a, b) => a.nombre_zona.localeCompare(b.nombre_zona));

        const asignadosBaseSemana = calcularAsignacionesSemanaActualServidor(participantesGrupo, zonas, tsHoy);
        
        for (let i = 0; i < zonas.length; i++) {
            let zona = zonas[i];
            let toca = asignadosBaseSemana[zona.id];
            if (!toca) continue;

            // Respetamos permutas aisladas aceptadas para esta semana
            const permutado = obtenerEnMapaSemana(zona.permutas_semana, tsHoy);
            if (permutado && participantesGrupo.includes(permutado)) {
                toca = permutado;
            }

            // Si estamos en o después de la fecha de corte y aún no estaba congelado el turno base en Firestore, lo guardamos
            if (tsHoy >= TS_CORTE_NUEVA_ROTACION && !obtenerEnMapaSemana(zona.asignaciones_semana, tsHoy) && asignadosBaseSemana[zona.id]) {
                try {
                    await db.collection(`grupos/${grupoId}/zonas_limpieza`).doc(zona.id).update({
                        [`asignaciones_semana.${tsHoy}`]: asignadosBaseSemana[zona.id]
                    });
                } catch (e) {}
            }
            
            // Verificamos si ya se confirmó esta semana exacta
            const hechaEstaSemana = !!obtenerEnMapaSemana(zona.semanas_hechas, tsHoy);
            
            // Enviar notificaciones
            if (!esDomingo) {
                // Lunes: Avisar de lo que toca
                await enviarPush(grupoId, toca, `🧹 Tu turno de limpiar`, `Esta semana te toca limpiar: ${zona.nombre_zona}`);
            } else {
                // Domingo: Avisar SOLO si no le han dado a confirmar
                if (!hechaEstaSemana) {
                    await enviarPush(grupoId, toca, `🚨 Último aviso: ${zona.nombre_zona}`, `Aún no has confirmado tu limpieza. ¡Que no te llamen El Cerdo del Piso! 🐷`);
                }
            }
        }
    }
}

// Función que manda el mensaje al móvil del usuario
async function enviarPush(grupoId, nombreUsuario, titulo, mensaje) {
    const tokenDoc = await db.collection(`grupos/${grupoId}/tokens_push`).doc(nombreUsuario).get();
    if (!tokenDoc.exists) return; // Si no aceptó notificaciones, lo saltamos
    
    const token = tokenDoc.data().token;
    if (!token) return;

    const payload = {
        notification: { title: titulo, body: mensaje },
        token: token
    };

    try {
        await admin.messaging().send(payload);
    } catch (error) {
        console.error("Error enviando push a", nombreUsuario);
    }
}
