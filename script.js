const CATEGORY_OPTIONS = [
  { id: 0, name: "Mixtas (Todas las categorías)" },
  { id: 18, name: "Ciencia: Computación" },
  { id: 23, name: "Historia" },
  { id: 21, name: "Deportes" },
  { id: 22, name: "Geografía" },
  { id: 17, name: "Ciencia y Naturaleza" }
];

const root = document.getElementById('root');

let state = {
  config: null,
  questions: [],
  currentIndex: 0,
  score: 0,
  correct: 0,
  incorrect: 0,
  timesPerQuestion: [],
  timerInterval: null,
  timerRemaining: 20,
  questionStartTimestamp: null,
  loading: false,
  lastFetchError: null
};

function renderSetup() {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'card grid';
  container.innerHTML = `
    <div>
      <div class="row" style="justify-content:space-between;align-items:flex-end">
        <div>
          <div class="small muted">Jugador</div>
          <input id="playerName" type="text" placeholder="Tu nombre (2-20 caracteres)" />
        </div>
        <div>
          <div class="small muted">Cantidad preguntas</div>
          <input id="amount" type="number" min="5" max="20" value="10" />
        </div>
        <div>
          <div class="small muted">Dificultad</div>
          <select id="difficulty">
            <option value="easy">Fácil</option>
            <option value="medium" selected>Medio</option>
            <option value="hard">Difícil</option>
          </select>
        </div>
        <div>
          <div class="small muted">Categoría</div>
          <select id="category"></select>
        </div>
      </div>
    </div>
    <div class="row" style="justify-content:space-between">
      <div class="small muted">Reglas: 20s por pregunta; +10 puntos por correcta; sin resta por incorrecta.</div>
      <div class="controls">
        <button id="startBtn">Iniciar juego</button>
        <button id="resetConfig" class="ghost">Limpiar</button>
      </div>
    </div>
    <div id="setupError" class="muted small"></div>
  `;
  root.appendChild(container);

  const sel = container.querySelector('#category');
  CATEGORY_OPTIONS.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.name;
    sel.appendChild(o);
  });

  container.querySelector('#startBtn').addEventListener('click', () => {
    const name = container.querySelector('#playerName').value.trim();
    const amount = parseInt(container.querySelector('#amount').value, 10);
    const difficulty = container.querySelector('#difficulty').value;
    const cat = parseInt(container.querySelector('#category').value, 10);
    const errEl = container.querySelector('#setupError');
    if (!name || name.length < 2 || name.length > 20) {
      errEl.textContent = 'Nombre inválido: debe tener entre 2 y 20 caracteres.';
      return;
    }
    if (!Number.isInteger(amount) || amount < 5 || amount > 20) {
      errEl.textContent = 'Cantidad inválida: elige entre 5 y 20 preguntas.';
      return;
    }
    errEl.textContent = '';
    state.config = { name, amount, difficulty, category: cat };
    startGame();
  });

  container.querySelector('#resetConfig').addEventListener('click', () => {
    container.querySelector('#playerName').value = '';
    container.querySelector('#amount').value = 10;
    container.querySelector('#difficulty').value = 'medium';
    container.querySelector('#category').value = 0;
  });
}

function showLoading(message = 'Cargando preguntas...') {
  root.innerHTML = '';
  const c = document.createElement('div');
  c.className = 'center grid';
  c.style.minHeight = '220px';
  c.innerHTML = `
    <div class="center" style="gap:12px;flex-direction:column">
      <div class="loader" aria-hidden="true"></div>
      <div class="muted small">${escapeHtml(message)}</div>
      <div id="fetchError" class="muted small"></div>
    </div>
  `;
  root.appendChild(c);
}

async function fetchQuestions(config) {
  const base = 'https://opentdb.com/api.php';
  const params = new URLSearchParams();
  params.set('amount', String(config.amount));
  params.set('type', 'multiple');
  if (config.difficulty) params.set('difficulty', config.difficulty);
  if (config.category && config.category !== 0) params.set('category', String(config.category));
  const url = base + '?' + params.toString();

  try {
    state.loading = true;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error('Respuesta de red no OK: ' + resp.status);
    const data = await resp.json();
    if (data.response_code !== 0) {
      throw new Error('La API no devolvió suficientes preguntas para los parámetros seleccionados.');
    }
    const qs = data.results.map(q => {
      const decoded = {
        question: decodeHtml(q.question),
        correct: decodeHtml(q.correct_answer),
        incorrect: q.incorrect_answers.map(a => decodeHtml(a))
      };
      const options = [...decoded.incorrect];
      options.push(decoded.correct);
      shuffleArray(options);
      return { question: decoded.question, correct: decoded.correct, options };
    });
    state.loading = false;
    return qs;
  } catch (err) {
    state.loading = false;
    state.lastFetchError = err;
    throw err;
  }
}

async function startGame() {
  showLoading();
  try {
    const qs = await fetchQuestions(state.config);
    state.questions = qs;
    state.currentIndex = 0;
    state.score = 0;
    state.correct = 0;
    state.incorrect = 0;
    state.timesPerQuestion = [];
    state.lastFetchError = null;
    renderGame();
    startQuestionTimer();
  } catch (err) {
    root.innerHTML = '';
    const c = document.createElement('div');
    c.className = 'card grid';
    c.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <div class="error">Error al obtener preguntas</div>
          <div class="muted small" id="errMsg">${escapeHtml(err.message)}</div>
        </div>
        <div class="controls">
          <button id="retry">Reintentar</button>
          <button id="back" class="ghost">Cambiar configuración</button>
        </div>
      </div>
    `;
    root.appendChild(c);
    c.querySelector('#retry').addEventListener('click', startGame);
    c.querySelector('#back').addEventListener('click', () => {
      state.config = null;
      renderSetup();
    });
  }
}

function renderGame() {
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'game';
  container.innerHTML = `
    <div class="main card">
      <div class="progress small" id="progressText"></div>
      <div class="question" id="questionText"></div>
      <div class="answers" id="answersList"></div>
      <div class="timer" id="timerBarWrap"><div class="timer-bar" id="timerBar"></div></div>
      <div class="timer-text small" id="timerText"></div>
    </div>
    <div class="side">
      <div class="card stats">
        <div class="stat"><div class="small muted">Jugador</div><div id="playerName" class="small"></div></div>
        <div class="stat"><div class="small muted">Puntuación</div><div id="score" class="big">0</div></div>
        <div class="stat"><div class="small muted">Correctas</div><div id="correct">0</div></div>
        <div class="stat"><div class="small muted">Incorrectas</div><div id="incorrect">0</div></div>
        <div class="stat"><div class="small muted">Tiempo medio</div><div id="avgTime" class="small">-</div></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="quit" class="ghost">Finalizar</button>
        </div>
      </div>
    </div>
  `;
  root.appendChild(container);

  container.querySelector('#playerName').textContent = state.config.name;
  updateQuestionUI();
  container.querySelector('#quit').addEventListener('click', () => {
    stopTimer();
    showFinalScreen();
  });
}

function updateQuestionUI() {
  const idx = state.currentIndex;
  const total = state.questions.length;
  const q = state.questions[idx];
  const progressText = document.getElementById('progressText');
  const questionText = document.getElementById('questionText');
  const answersList = document.getElementById('answersList');
  const scoreEl = document.getElementById('score');
  const corrEl = document.getElementById('correct');
  const incorrEl = document.getElementById('incorrect');
  const avgTimeEl = document.getElementById('avgTime');

  progressText.textContent = `Pregunta ${idx + 1} de ${total}`;
  questionText.textContent = q.question;
  answersList.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => onSelectAnswer(btn, opt));
    answersList.appendChild(btn);
  });

  scoreEl.textContent = String(state.score);
  corrEl.textContent = String(state.correct);
  incorrEl.textContent = String(state.incorrect);
  avgTimeEl.textContent = state.timesPerQuestion.length ? ( (state.timesPerQuestion.reduce((a,b)=>a+b,0) / state.timesPerQuestion.length).toFixed(1) + 's' ) : '-';
  updateTimerUI();
}

function startQuestionTimer() {
  stopTimer();
  state.timerRemaining = 20;
  state.questionStartTimestamp = Date.now();
  updateTimerUI();
  state.timerInterval = setInterval(() => {
    state.timerRemaining -= 1;
    updateTimerUI();
    if (state.timerRemaining <= 0) {
      stopTimer();
      markTimeExpired();
    }
  }, 1000);
}

function pauseTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}
function stopTimer() {
  pauseTimer();
}

function updateTimerUI() {
  const bar = document.getElementById('timerBar');
  const wrap = document.getElementById('timerBarWrap');
  const timerText = document.getElementById('timerText');
  if (!bar || !wrap || !timerText) return;
  const remaining = state.timerRemaining;
  const pct = Math.max(0, Math.min(100, (remaining / 20) * 100));
  bar.style.width = pct + '%';
  if (remaining <= 5) wrap.classList.add('timer-warning'); else wrap.classList.remove('timer-warning');
  timerText.textContent = `Tiempo restante: ${remaining}s`;
}

function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function decodeHtml(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

renderSetup();
