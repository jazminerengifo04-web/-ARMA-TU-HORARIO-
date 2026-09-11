/* ============================================================
   1. CONSTANTES DEL DOMINIO
   ============================================================ */
 
const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
 
const HORA_INICIO   = 7 * 60;    // 07:00 expresado en minutos
const HORA_FIN      = 22 * 60;   // 22:00 expresado en minutos
const PX_POR_MINUTO = 0.7;       // debe coincidir con --alto-hora del CSS
const PALETA = ["#2E86AB", "#A23B72", "#F18F01", "#3B7A57",
                "#6A4C93", "#C1666B", "#1B998B", "#8D6E63"];
 
const CLAVE_ALMACEN = "horario-fisi";

/* ============================================================
   2. UTILIDADES DE TIEMPO
   Dentro del programa una hora es SIEMPRE un número de minutos
   contados desde la medianoche. El texto solo aparece al mostrar.
   ============================================================ */
 
function aMinutos(texto) {              // "16:30"  ->  990
  const [horas, minutos] = texto.split(":").map(Number);
  return horas * 60 + minutos;
}
 
function aTexto(minutos) {              // 990  ->  "16:30"
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
 
function describir(sesion) {            // -> "Lunes 16:00–18:00"
  return DIAS[sesion.dia] + " " + aTexto(sesion.inicio) + "–" + aTexto(sesion.fin);
}

/* ============================================================
   3. ESTADO
   Única fuente de verdad. Si no está aquí, no existe.
   ============================================================ */
 
let estado = {
  cursos:    [],     // cursos ya registrados en el horario
  borrador:  [],     // sesiones del curso que se está armando
  mensaje:   null,   // { texto, tipo }
  conflicto: null,   // { curso, sesion } para resaltar en la grilla
  editandoId: null   // id del curso que se está editando
};

/* ============================================================
   4. NÚCLEO ALGORÍTMICO
   ============================================================ */
 
/**
 * Dos sesiones se cruzan si ocurren el mismo día, A empieza antes
 * de que B termine y B empieza antes de que A termine.
 * El menor ESTRICTO es lo que permite que dos clases consecutivas
 * (una termina 10:00, la otra empieza 10:00) no se consideren cruce.
 */
function seCruzan(a, b) {
  return a.dia === b.dia && a.inicio < b.fin && b.inicio < a.fin;
}
 
/** Busca la primera colisión entre un grupo de sesiones y los cursos ya registrados. */
function buscarConflicto(sesiones, cursos) {
  for (const curso of cursos) {
    for (const propia of sesiones) {
      for (const ajena of curso.sesiones) {
        if (seCruzan(propia, ajena)) {
          return { curso: curso, sesion: ajena, propia: propia };
        }
      }
    }
  }
  return null;
}
 
/** Verifica que las sesiones de un mismo curso no choquen entre sí. */
function conflictoInterno(sesiones) {
  for (let i = 0; i < sesiones.length; i++) {
    for (let j = i + 1; j < sesiones.length; j++) {
      if (seCruzan(sesiones[i], sesiones[j])) return sesiones[j];
    }
  }
  return null;
}
 
function siguienteId() {
  return estado.cursos.reduce((max, curso) => Math.max(max, curso.id), 0) + 1;
}

/* ============================================================
   5. RENDERIZADO
   render() borra y vuelve a dibujar. Ninguna otra función
   del programa toca el DOM de la grilla.
   ============================================================ */
 
const $ = (selector) => document.querySelector(selector);
 
function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}
 
/** Se ejecuta una sola vez: las marcas de hora no dependen del estado. */
function construirEsqueleto() {
  const contenedor = $("#horas");
  for (let minuto = HORA_INICIO; minuto <= HORA_FIN; minuto += 60) {
    const marca = crear("div", "marca", aTexto(minuto));
    marca.style.top = (minuto - HORA_INICIO) * PX_POR_MINUTO + "px";
    contenedor.appendChild(marca);
  }
}
 
function dibujarGrilla() {
  document.querySelectorAll(".columna").forEach(col => (col.innerHTML = ""));
 
  for (const curso of estado.cursos) {
    for (const sesion of curso.sesiones) {
      const columna = document.querySelector('.columna[data-dia="' + sesion.dia + '"]');
      if (!columna) continue;
 
      const bloque = crear("div", "bloque");
      bloque.dataset.cursoId = curso.id;
      bloque.style.top       = (sesion.inicio - HORA_INICIO) * PX_POR_MINUTO + "px";
      bloque.style.height    = (sesion.fin - sesion.inicio) * PX_POR_MINUTO - 2 + "px";
      bloque.style.backgroundColor = curso.color;
 
      const horario = crear("small", null, aTexto(sesion.inicio) + "–" + aTexto(sesion.fin));
      const ajusteInicio = crear("span", "control-ajuste superior", "");
      ajusteInicio.title = "Ajustar hora de inicio";
      ajusteInicio.addEventListener("pointerdown", evento => {
        evento.stopPropagation();
        iniciarAjusteInicio(evento, curso, sesion, bloque, horario);
      });
      bloque.appendChild(ajusteInicio);
      bloque.appendChild(crear("strong", null, curso.nombre));
      bloque.appendChild(horario);

      const ajuste = crear("span", "control-ajuste", "");
      ajuste.title = "Ajustar hora de finalización";
      ajuste.addEventListener("pointerdown", evento => {
        evento.stopPropagation();
        iniciarAjuste(evento, curso, sesion, bloque, horario);
      });
      bloque.appendChild(ajuste);
      bloque.addEventListener("pointerdown", evento => {
        if (!evento.target.closest(".control-ajuste")) {
          iniciarMovimiento(evento, curso, sesion, bloque, horario);
        }
      });
 
      if (estado.conflicto &&
          estado.conflicto.curso.id === curso.id &&
          estado.conflicto.sesion === sesion) {
        bloque.classList.add("conflicto");
      }
 
      columna.appendChild(bloque);
    }
  }
}

function redondearCuarto(minutos) {
  return Math.round(minutos / 15) * 15;
}

function columnaEn(x) {
  return [...document.querySelectorAll(".columna")].find(columna => {
    const rect = columna.getBoundingClientRect();
    return x >= rect.left && x <= rect.right;
  });
}

function sesionEnConflicto(cursoActual, sesionOriginal, candidata) {
  for (const curso of estado.cursos) {
    for (const sesion of curso.sesiones) {
      if (curso === cursoActual && sesion === sesionOriginal) continue;
      if (seCruzan(candidata, sesion)) return curso;
    }
  }
  return null;
}

function finalizarCambio(evento, curso, sesion, candidata, bloque) {
  const cambio = candidata.dia !== sesion.dia ||
    candidata.inicio !== sesion.inicio || candidata.fin !== sesion.fin;

  bloque.releasePointerCapture(evento.pointerId);
  bloque.classList.remove("moviendose");

  if (!cambio) {
    render();
    return;
  }

  const cursoEnConflicto = sesionEnConflicto(curso, sesion, candidata);
  if (cursoEnConflicto) {
    avisar("No se puede cambiar: el horario choca con " + cursoEnConflicto.nombre + ".", "error");
    render();
    return;
  }

  if (!confirm("Quiere cambiar el horario?")) {
    render();
    return;
  }

  sesion.dia = candidata.dia;
  sesion.inicio = candidata.inicio;
  sesion.fin = candidata.fin;
  estado.conflicto = null;
  avisar("El horario fue actualizado.", "exito");
  guardar();
  render();
}

function iniciarMovimiento(evento, curso, sesion, bloque, horario) {
  if (evento.button !== 0) return;
  evento.preventDefault();

  const inicioX = evento.clientX;
  const inicioY = evento.clientY;
  const duracion = sesion.fin - sesion.inicio;
  const candidata = { ...sesion };
  bloque.classList.add("moviendose");
  bloque.setPointerCapture(evento.pointerId);

  const mover = movimiento => {
    const columna = columnaEn(movimiento.clientX);
    const dia = columna ? Number(columna.dataset.dia) : candidata.dia;
    const inicio = Math.max(
      HORA_INICIO,
      Math.min(HORA_FIN - duracion,
        redondearCuarto(sesion.inicio + (movimiento.clientY - inicioY) / PX_POR_MINUTO))
    );

    candidata.dia = dia;
    candidata.inicio = inicio;
    candidata.fin = inicio + duracion;
    bloque.style.top = (inicio - HORA_INICIO) * PX_POR_MINUTO + "px";
    bloque.style.height = duracion * PX_POR_MINUTO - 2 + "px";
    horario.textContent = aTexto(inicio) + "–" + aTexto(candidata.fin);
  };

  const terminar = movimiento => {
    bloque.removeEventListener("pointermove", mover);
    bloque.removeEventListener("pointerup", terminar);
    bloque.removeEventListener("pointercancel", terminar);
    finalizarCambio(movimiento, curso, sesion, candidata, bloque);
  };

  bloque.addEventListener("pointermove", mover);
  bloque.addEventListener("pointerup", terminar);
  bloque.addEventListener("pointercancel", terminar);
}

function iniciarAjuste(evento, curso, sesion, bloque, horario) {
  if (evento.button !== 0) return;
  evento.preventDefault();

  const inicioY = evento.clientY;
  const candidata = { ...sesion };
  bloque.classList.add("ajustando");
  bloque.setPointerCapture(evento.pointerId);

  const mover = movimiento => {
    const fin = Math.max(
      sesion.inicio + 15,
      Math.min(HORA_FIN,
        redondearCuarto(sesion.fin + (movimiento.clientY - inicioY) / PX_POR_MINUTO))
    );
    candidata.fin = fin;
    bloque.style.height = (fin - sesion.inicio) * PX_POR_MINUTO - 2 + "px";
    horario.textContent = aTexto(sesion.inicio) + "–" + aTexto(fin);
  };

  const terminar = movimiento => {
    bloque.classList.remove("ajustando");
    bloque.removeEventListener("pointermove", mover);
    bloque.removeEventListener("pointerup", terminar);
    bloque.removeEventListener("pointercancel", terminar);
    finalizarCambio(movimiento, curso, sesion, candidata, bloque);
  };

  bloque.addEventListener("pointermove", mover);
  bloque.addEventListener("pointerup", terminar);
  bloque.addEventListener("pointercancel", terminar);
}

function iniciarAjusteInicio(evento, curso, sesion, bloque, horario) {
  if (evento.button !== 0) return;
  evento.preventDefault();

  const inicioY = evento.clientY;
  const candidata = { ...sesion };
  bloque.classList.add("ajustando");
  bloque.setPointerCapture(evento.pointerId);

  const mover = movimiento => {
    const inicio = Math.max(
      HORA_INICIO,
      Math.min(sesion.fin - 15,
        redondearCuarto(sesion.inicio + (movimiento.clientY - inicioY) / PX_POR_MINUTO))
    );
    candidata.inicio = inicio;
    bloque.style.top = (inicio - HORA_INICIO) * PX_POR_MINUTO + "px";
    bloque.style.height = (sesion.fin - inicio) * PX_POR_MINUTO - 2 + "px";
    horario.textContent = aTexto(inicio) + "–" + aTexto(sesion.fin);
  };

  const terminar = movimiento => {
    bloque.classList.remove("ajustando");
    bloque.removeEventListener("pointermove", mover);
    bloque.removeEventListener("pointerup", terminar);
    bloque.removeEventListener("pointercancel", terminar);
    finalizarCambio(movimiento, curso, sesion, candidata, bloque);
  };

  bloque.addEventListener("pointermove", mover);
  bloque.addEventListener("pointerup", terminar);
  bloque.addEventListener("pointercancel", terminar);
}
 
function dibujarBorrador() {
  const lista = $("#lista-borrador");
  lista.innerHTML = "";
 
  estado.borrador.forEach((sesion, indice) => {
    const item = crear("li");
    item.appendChild(crear("span", null, describir(sesion)));
 
    const boton = crear("button", "quitar", "×");
    boton.onclick = () => quitarSesionDelBorrador(indice);
    item.appendChild(boton);
 
    lista.appendChild(item);
  });
}
 
function dibujarListaDeCursos() {
  const lista = $("#lista-cursos");
  lista.innerHTML = "";
 
  if (estado.cursos.length === 0) {
    lista.appendChild(crear("li", null, "Todavía no hay cursos registrados."));
    return;
  }
 
  for (const curso of estado.cursos) {
    const item = crear("li");
    item.style.borderLeftColor = curso.color;
 
    const info = crear("div", "info");
    info.appendChild(crear("strong", null, curso.nombre));
    info.appendChild(crear("span", null,
      "Docente: " + (curso.docente || "No indicado") + " · " +
      curso.sesiones.map(describir).join(" | ")));
    item.appendChild(info);
 
    const acciones = crear("div", "acciones-curso");

    const boton = crear("button", "quitar", "×");
    boton.onclick = () => eliminarCurso(curso.id);
    acciones.appendChild(boton);

    const editar = crear("button", "editar", "✎ Editar");
    editar.onclick = () => iniciarEdicion(curso.id);
    acciones.appendChild(editar);
    item.appendChild(acciones);
 
    lista.appendChild(item);
  }
}
 
function dibujarResumen() {
  const resumen = $("#resumen");
  resumen.textContent = "Cursos registrados: " + estado.cursos.length;
  resumen.className = "resumen";
}
 
function dibujarMensaje() {
  const caja = $("#mensaje");
  caja.textContent = estado.mensaje ? estado.mensaje.texto : "";
  caja.className = estado.mensaje ? "mensaje " + estado.mensaje.tipo : "mensaje";
}
 
function render() {
  dibujarGrilla();
  dibujarBorrador();
  dibujarListaDeCursos();
  dibujarResumen();
  dibujarMensaje();
}

/* ============================================================
   6. ACCIONES
   Cada acción modifica el estado y llama a render() una sola vez.
   ============================================================ */
 
function avisar(texto, tipo) {
  estado.mensaje = { texto: texto, tipo: tipo };
}
 
function agregarSesionAlBorrador() {
  const sesion = {
    dia:    Number($("#dia").value),
    inicio: aMinutos($("#inicio").value),
    fin:    aMinutos($("#fin").value)
  };
 
  if (sesion.fin <= sesion.inicio) {
        avisar("La hora de fin debe ser posterior a la de inicio.", "error");
  } else if (sesion.inicio < HORA_INICIO || sesion.fin > HORA_FIN) {
    avisar("El horario permitido va de " + aTexto(HORA_INICIO) +
           " a " + aTexto(HORA_FIN) + ".", "error");
  } else if (conflictoInterno(estado.borrador.concat([sesion]))) {
    avisar("Esa sesión choca con otra sesión del mismo curso.", "error");
  } else {
    estado.borrador.push(sesion);
    estado.mensaje = null;
  }
 
  render();
}
 
function quitarSesionDelBorrador(indice) {
  estado.borrador.splice(indice, 1);
  render();
}
 
function agregarCurso() {
  const nombre   = $("#nombre").value.trim();
  const docente  = $("#docente").value.trim();
 
  estado.conflicto = null;
 
  if (nombre === "") {
    avisar("El curso necesita un nombre.", "error");
  } else if (docente === "") {
    avisar("El curso necesita un docente.", "error");
  } else if (estado.borrador.length === 0) {
    avisar("Agrega al menos una sesión con el botón +.", "error");
  } else {
    const cursosParaComparar = estado.cursos.filter(curso => curso.id !== estado.editandoId);
    const choque = buscarConflicto(estado.borrador, cursosParaComparar);
 
    if (choque) {
      estado.conflicto = { curso: choque.curso, sesion: choque.sesion };
      avisar("Choca con " + choque.curso.nombre + " el " + describir(choque.sesion) +
             ". Tu sesión sería " + describir(choque.propia) + ".", "error");
    } else {
      const cursoActualizado = {
        id:       estado.editandoId === null ? siguienteId() : estado.editandoId,
        nombre:   nombre,
        docente:  docente,
        color:    estado.editandoId === null
          ? PALETA[estado.cursos.length % PALETA.length]
          : estado.cursos.find(curso => curso.id === estado.editandoId).color,
        sesiones: estado.borrador
      };
      if (estado.editandoId === null) {
        estado.cursos.push(cursoActualizado);
      } else {
        estado.cursos = estado.cursos.map(curso =>
          curso.id === estado.editandoId ? cursoActualizado : curso
        );
      }
      estado.borrador = [];
      estado.editandoId = null;
      $("#nombre").value = "";
      $("#docente").value = "";
      $("#btn-agregar").textContent = "Registrar nuevo curso";
      $("#btn-cancelar-edicion").hidden = true;
      avisar(nombre + " se agregó al horario.", "exito");
      guardar();
    }
  }
 
  render();
}
 
function eliminarCurso(id) {
  estado.cursos  = estado.cursos.filter(curso => curso.id !== id);
  estado.conflicto = null;
  estado.mensaje   = null;
  guardar();
  render();
}

function iniciarEdicion(id) {
  const curso = estado.cursos.find(item => item.id === id);
  if (!curso) return;

  estado.editandoId = id;
  estado.borrador = curso.sesiones.map(sesion => ({ ...sesion }));
  estado.conflicto = null;
  estado.mensaje = null;
  $("#nombre").value = curso.nombre;
  $("#docente").value = curso.docente || "";
  $("#btn-agregar").textContent = "Actualizar curso";
  $("#btn-cancelar-edicion").hidden = false;
  render();
}

function cancelarEdicion() {
  estado.editandoId = null;
  estado.borrador = [];
  estado.conflicto = null;
  estado.mensaje = null;
  $("#nombre").value = "";
  $("#docente").value = "";
  $("#btn-agregar").textContent = "Registrar nuevo curso";
  $("#btn-cancelar-edicion").hidden = true;
  render();
}

function eliminarTodosLosCursos() {
  if (estado.cursos.length === 0) {
    avisar("No hay cursos registrados para eliminar.", "error");
    render();
    return;
  }

  if (!confirm("¿Seguro que deseas eliminar todos los cursos?")) return;

  estado.cursos = [];
  estado.borrador = [];
  estado.editandoId = null;
  estado.conflicto = null;
  $("#nombre").value = "";
  $("#docente").value = "";
  $("#btn-agregar").textContent = "Registrar nuevo curso";
  $("#btn-cancelar-edicion").hidden = true;
  avisar("Todos los cursos fueron eliminados.", "exito");
  guardar();
  render();
}

/* ============================================================
   7. PERSISTENCIA
   ============================================================ */
 
function guardar() {
  try {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(estado.cursos));
  } catch (error) {
    console.warn("No se pudo guardar el horario:", error);
  }
}
 
function cargar() {
  try {
    const guardado = localStorage.getItem(CLAVE_ALMACEN);
    if (guardado) {
      estado.cursos = JSON.parse(guardado).map(curso => ({
        ...curso,
        docente: curso.docente || ""
      }));
    }
  } catch (error) {
    console.warn("No se pudo leer el horario guardado:", error);
    estado.cursos = [];
  }
}

/* ============================================================
   8. ARRANQUE
   ============================================================ */
 
construirEsqueleto();
cargar();
render();
 
$("#btn-sesion").onclick  = agregarSesionAlBorrador;
$("#btn-agregar").onclick = agregarCurso;
$("#btn-cancelar-edicion").onclick = cancelarEdicion;
$("#btn-eliminar-todos").onclick = eliminarTodosLosCursos;

const casos = [
  ["Días distintos",          {dia:1,inicio:480,fin:600}, {dia:2,inicio:480,fin:600}, false],
  ["B empieza al terminar A", {dia:1,inicio:480,fin:600}, {dia:1,inicio:600,fin:720}, false],
  ["Superposición parcial",   {dia:1,inicio:480,fin:600}, {dia:1,inicio:540,fin:660}, true ],
  ["A contiene a B",          {dia:1,inicio:480,fin:720}, {dia:1,inicio:540,fin:600}, true ],
  ["B contiene a A",          {dia:1,inicio:540,fin:600}, {dia:1,inicio:480,fin:720}, true ],
  ["Horarios idénticos",      {dia:1,inicio:480,fin:600}, {dia:1,inicio:480,fin:600}, true ],
  ["B termina al empezar A",  {dia:1,inicio:600,fin:720}, {dia:1,inicio:480,fin:600}, false]
];
 
casos.forEach(([nombre, a, b, esperado]) => {
  const obtenido = seCruzan(a, b);
  console.log(obtenido === esperado ? "OK  " : "FALLA", nombre);
});





