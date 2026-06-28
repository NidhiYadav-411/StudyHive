// Load index.js to get API_BASE
// Since index.js is loaded first in query.html, API_BASE is available globally.

window.addEventListener('DOMContentLoaded', () => {
    fetchQueries();
});

// Fetch and render existing community queries
async function fetchQueries() {
    try {
        const response = await fetch(`${API_BASE}/queries`);
        const data = await response.json();
        
        const container = document.getElementById('questionsContainer');
        if (!container) return;
        container.innerHTML = '';
        
        if (data.queries && data.queries.length > 0) {
            // Render oldest first so prepending aligns them newest-at-the-top
            data.queries.reverse().forEach(q => {
                renderQuery(q);
            });
        } else {
            container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 20px;">No questions asked yet. Be the first to ask!</div>`;
        }
    } catch (e) {
        console.error("Failed to load queries:", e);
    }
}

// Helper to escape HTML to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Simple regex-based markdown parser to render AI responses nicely
function parseMarkdown(text) {
    if (!text) return '';
    let html = escapeHTML(text);

    // Headings (###, ##, #)
    html = html.replace(/^### (.*$)/gim, '<h4 style="margin-top: 16px; margin-bottom: 8px; color: var(--accent); font-family: \'Outfit\';">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 style="margin-top: 20px; margin-bottom: 10px; color: var(--accent); font-family: \'Outfit\';">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 style="margin-top: 24px; margin-bottom: 12px; color: var(--accent); font-family: \'Outfit\';">$1</h2>');

    // Bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #ffffff; font-weight: 700;">$1</strong>');

    // Lists (* item or - item)
    html = html.replace(/^\s*[\*\-]\s+(.*$)/gim, '<li style="margin-left: 20px; margin-bottom: 6px; list-style-type: disc;">$1</li>');

    // Horizontal Rule (---)
    html = html.replace(/^---$/gim, '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;">');

    return html;
}

// Render a query and its AI response
function renderQuery(q) {
    const container = document.getElementById('questionsContainer');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'question';
    card.style.background = 'rgba(255,255,255,0.02)';
    card.style.border = '1px solid var(--glass-border)';
    card.style.borderRadius = '12px';
    card.style.padding = '20px';
    card.style.marginBottom = '20px';
    card.style.textAlign = 'left';

    const safeName = escapeHTML(q.student_name);
    const safeQuestion = escapeHTML(q.question);
    const parsedAnswer = parseMarkdown(q.ai_answer);

    card.innerHTML = `
        <div style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 12px;">
            <strong style="color: var(--accent); font-family: 'Outfit';">${safeName}</strong> asks:
            <p style="margin-top: 5px; color: var(--text-main);">${safeQuestion}</p>
        </div>
        <div style="background: rgba(106, 90, 205, 0.08); border-left: 4px solid var(--accent); border-radius: 8px; padding: 15px; margin-top: 15px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--accent); margin-bottom: 8px;">
                <span>🤖 StudyHive AI Assistant</span>
            </div>
            <div style="color: var(--text-main); line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap; font-family: sans-serif;">
                ${parsedAnswer || "No response generated."}
            </div>
        </div>
    `;

    // Prepend to show newest at the top
    container.prepend(card);
}

// Handle query submission
document.getElementById('queryForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    const nameInput = document.getElementById('studentName');
    const questionInput = document.getElementById('question');
    const submitBtn = this.querySelector('button[type="submit"]');

    const name = nameInput.value.trim();
    const question = questionInput.value.trim();

    if (!name || !question) return;

    // Loading State
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "AI is thinking...";

    try {
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, question })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Remove "No questions asked yet" placeholder if it exists
            const container = document.getElementById('questionsContainer');
            if (container && container.innerText.includes("No questions asked yet")) {
                container.innerHTML = '';
            }
            
            // Render the new query at the top
            renderQuery(data);
            questionInput.value = '';
        } else {
            alert(data.error || "Failed to submit question");
        }
    } catch (e) {
        console.error(e);
        alert("Connection error to server");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});