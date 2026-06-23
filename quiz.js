const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://your-render-app.onrender.com/api'; // Replace with your Render URL

let quizData = [];
let currentQuestion = 0;
let score = 0;
let quizTitleText = "Quiz";

// Get quiz ID from URL e.g. quiz.html?id=pump
const urlParams = new URLSearchParams(window.location.search);
const quizId = urlParams.get('id') || '2stroke'; // fallback to 2stroke

const titles = {
  '2stroke': '2-Stroke & 4-Stroke Engine Quiz',
  'bjt': 'BJT and FET Quiz',
  'hydrolic': 'Hydraulic Lift Quiz',
  'pump': 'Pump Quiz',
  'refridgerator': 'Refrigerator Quiz',
  'turbine': 'Turbine Quiz',
  'zener': 'Zener Diode Quiz'
};

// Fisher-Yates shuffle
function shuffleQuizzes(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function initQuiz() {
    try {
        const res = await fetch('quizzes.json?t=' + new Date().getTime());
        const data = await res.json();

        if (data[quizId]) {
            quizData = data[quizId];
            shuffleQuizzes(quizData);
            
            // Limit to 5 questions if there is a larger pool of questions
            if (quizData.length > 5) {
                quizData = quizData.slice(0, 5);
            }
            
            quizTitleText = titles[quizId] || "AI Custom Quiz";
            if (quizId.startsWith('auto_')) {
                quizTitleText = "AI Generated Quiz";
            }
            
            document.getElementById('quiz-title').innerText = `🛠️ ${quizTitleText}`;
            document.title = `${quizTitleText} - StudyHive`;
            loadQuestion();
        } else {
            document.getElementById('quiz-title').innerText = "Quiz not found.";
            document.getElementById('question-box').classList.add('hidden');
        }
    } catch (err) {
        console.error("Error loading quizzes:", err);
        document.getElementById('quiz-title').innerText = "Error loading quiz data.";
    }
}

function loadQuestion() {
    const q = quizData[currentQuestion];
    document.getElementById("question-text").innerText = `Q${currentQuestion + 1}: ${q.question}`;

    const optionsContainer = document.getElementById("options");
    optionsContainer.innerHTML = "";
    document.getElementById("nextBtn").classList.add("hidden");

    // Shuffle the options as well
    let currentOptions = [...q.options];
    shuffleQuizzes(currentOptions);

    currentOptions.forEach(option => {
        const btn = document.createElement("button");
        btn.classList.add("option-btn");
        btn.textContent = option;
        btn.onclick = () => checkAnswer(btn, q.answer);
        optionsContainer.appendChild(btn);
    });
}

function checkAnswer(selectedBtn, correctAnswer) {
    const allButtons = document.querySelectorAll(".option-btn");
    
    allButtons.forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === correctAnswer) {
            btn.classList.add("correct");
        } else if (btn === selectedBtn) {
            btn.classList.add("wrong");
        }
    });

    if (selectedBtn.textContent === correctAnswer) {
        score++;
    }

    document.getElementById("nextBtn").classList.remove("hidden");
}

function nextQuestion() {
    currentQuestion++;
    if (currentQuestion < quizData.length) {
        loadQuestion();
    } else {
        const total = quizData.length;
        const percentage = ((score / total) * 100).toFixed(0);

        document.getElementById("question-box").classList.add("hidden");
        document.getElementById("result").classList.remove("hidden");
        document.getElementById("result").innerHTML = `
            <h2>🎉 Quiz Completed!</h2>
            <p>Your Score: <strong>${score} / ${total}</strong></p>
            <p>Percentage: <strong>${percentage}%</strong></p>
            <br>
            <button class="btn-secondary" onclick="location.reload()">Retry Quiz</button>
            <a href="user_dashboard.html" class="btn-primary" style="display:inline-block; margin-top:15px; text-decoration:none;">Back to Dashboard</a>
        `;
        
        // Log to database
        const userStr = localStorage.getItem("loggedInUser");
        if (userStr) {
            const user = JSON.parse(userStr);
            fetch(`${API_BASE}/submit_quiz`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    quiz_id: quizId,
                    score: score,
                    total: total
                })
            }).catch(e => console.error("Could not save score: ", e));
        }
    }
}

window.onload = initQuiz;
