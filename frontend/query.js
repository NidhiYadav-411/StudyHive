document.getElementById('queryForm').addEventListener('submit', function (event) {
    event.preventDefault();

    const studentName = document.getElementById('studentName').value.trim();
    const questionText = document.getElementById('question').value.trim();

    if (studentName && questionText) {
        const questionsContainer = document.getElementById('questionsContainer');

        const questionElement = document.createElement('div');
        questionElement.classList.add('question');
        questionElement.innerHTML = `<strong>${studentName} asks:</strong> ${questionText}`;

        const answerInput = document.createElement('textarea');
        answerInput.placeholder = 'Write your answer here...';
        answerInput.rows = 2;

        const submitAnswerButton = document.createElement('button');
        submitAnswerButton.textContent = 'Submit Answer';
        submitAnswerButton.addEventListener('click', function () {
            if (answerInput.value.trim()) {
                const answerElement = document.createElement('div');
                answerElement.classList.add('answer');
                answerElement.innerHTML = `
                    ${answerInput.value.trim()}
                    <button class=\"remove-answer\">Remove</button>
                `;
                questionElement.appendChild(answerElement);

                answerElement.querySelector('.remove-answer').addEventListener('click', function () {
                    answerElement.remove();
                });

                answerInput.value = ''; 
            }
        });

        questionElement.appendChild(answerInput);
        questionElement.appendChild(submitAnswerButton);

        questionsContainer.appendChild(questionElement);

        document.getElementById('queryForm').reset();
    }
});