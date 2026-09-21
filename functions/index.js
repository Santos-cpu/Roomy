/* eslint-disable */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const WEEK_MS = 604800000; // 7 días en milisegundos

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

// El Motor Matemático del Servidor
async function procesarNotificaciones(esDomingo) {
    const ahora = Date.now();
    const gruposSnap = await db.collection("grupos").get();
    
    for (const grupoDoc of gruposSnap.docs) {
        const grupoId = grupoDoc.id;
        const zonasSnap = await db.collection(`grupos/${grupoId}/zonas_limpieza`).get();
        
        let zonas = [];
        zonasSnap.forEach(doc => {
            let z = doc.data(); z.id = doc.id; zonas.push(z);
        });
        zonas.sort((a, b) => a.nombre_zona.localeCompare(b.nombre_zona));
        
        let asignados = [];
        
        for (let i = 0; i < zonas.length; i++) {
            let zona = zonas[i];
            let freq = zona.frecuencia || 1;
            
            // Calculamos a quién le toca usando la misma matemática del Frontend
            let sem = Math.floor((ahora - new Date(zona.fecha_base).getTime()) / WEEK_MS);
            if (sem < 0 || sem % freq !== 0) continue; // No toca limpiar esto esta semana
            
            let periodos = Math.floor(sem / freq);
            let idIdeal = (periodos + i) % zona.responsables.length;
            let toca = zona.responsables[idIdeal];
            let libre = false;
            
            for (let j = 0; j < zona.responsables.length; j++) {
                let cand = zona.responsables[(idIdeal + j) % zona.responsables.length];
                if (!asignados.includes(cand)) { toca = cand; asignados.push(cand); libre = true; break; }
            }
            if (!libre) toca = zona.responsables[idIdeal];
            
            // Verificamos si alguien ya ha pulsado el botón "Confirmar" en los últimos 6 días
            let hechaEstaSemana = false;
            if (zona.semanas_hechas) {
                const timestamps = Object.keys(zona.semanas_hechas).map(Number);
                if (timestamps.length > 0) {
                    const maxTs = Math.max(...timestamps);
                    if ((ahora - maxTs) < 518400000) { // 518400000 ms = 6 días
                        hechaEstaSemana = true;
                    }
                }
            }
            
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
