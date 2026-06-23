const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://your-render-app.onrender.com/api'; // Replace with your Render URL

window.addEventListener('DOMContentLoaded', () => {
    fetchAdminNotes();
});

async function fetchAdminNotes() {
    try {
        const response = await fetch(`${API_BASE}/notes`);
        const data = await response.json();
        
        const container = document.getElementById('dynamicNotesContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (data.notes && data.notes.length > 0) {
            // Group by subject
            const grouped = {};
            data.notes.forEach(note => {
                const subject = note.subject || "General";
                if (!grouped[subject]) grouped[subject] = [];
                grouped[subject].push(note);
            });
            
            for (const [subject, notes] of Object.entries(grouped)) {
                // Add sub-headers directly in the grid container or we can create blocks
                const subjectHeader = document.createElement('h3');
                subjectHeader.style.gridColumn = '1 / -1';
                subjectHeader.style.color = 'var(--text-main)';
                subjectHeader.style.marginTop = '20px';
                subjectHeader.style.borderBottom = '1px solid var(--glass-border)';
                subjectHeader.style.paddingBottom = '10px';
                subjectHeader.innerText = subject;
                
                container.appendChild(subjectHeader);
                
                notes.forEach(note => {
                    const quiz_id = "auto_" + note.id;
                    const safePath = note.filepath.replace(/\\/g, '/');
                    
                    const card = document.createElement('div');
                    card.className = 'note-card';
                    card.innerHTML = `
                        <div class="note-title">${note.topic} <span style="font-size:0.8rem; color:var(--text-muted); display:block; font-weight:normal;">(${note.original_name})</span></div>
                        <div class="note-actions">
                            <a href="${safePath}" target="_blank" class="btn-view">Read Note</a>
                            <a href="quiz.html?id=${quiz_id}" class="btn-quiz">Take AI Quiz</a>
                        </div>
                    `;
                    container.appendChild(card);
                });
            }
        } else {
            container.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No notes uploaded by Admin yet.</p>';
        }
    } catch (e) {
        console.error("Failed to fetch admin notes:", e);
    }
}