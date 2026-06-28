const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Database configuration
const dbHost = process.env.MYSQL_HOST || 'localhost';
const dbPort = parseInt(process.env.MYSQL_PORT || '3307', 10);
const dbUser = process.env.MYSQL_USER || 'root';
const dbPassword = process.env.MYSQL_PASSWORD || '@Nidhi21346';
const dbName = process.env.MYSQL_DB || 'studyhive';

// Set up upload folder
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_FOLDER)) {
    fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}
app.use('/assets/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer storage engine
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_FOLDER);
    },
    filename: (req, file, cb) => {
        // Clean original filename to prevent directory traversal / command injection
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, cleanName);
    }
});
const upload = multer({ storage: storage });

let pool;

async function initializeDatabase() {
    try {
        console.log(`Connecting to MySQL on ${dbHost}:${dbPort} as user "${dbUser}"...`);
        // 1. Connect without database name first to create the database if not exists
        try {
            const connection = await mysql.createConnection({
                host: dbHost,
                port: dbPort,
                user: dbUser,
                password: dbPassword
            });
            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
            await connection.end();
        } catch (dbCreateErr) {
            console.warn('Skipping CREATE DATABASE query (could be a permission restriction on Cloud DB host):', dbCreateErr.message);
        }

        // 2. Create the connection pool with the database specified
        pool = mysql.createPool({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword,
            database: dbName,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // 3. Create tables if they don't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'student',
                points INT DEFAULT 0
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS Notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subject VARCHAR(255) NOT NULL,
                topic VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                filepath VARCHAR(512) NOT NULL,
                uploaded_by INT NULL,
                status VARCHAR(50) DEFAULT 'approved',
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (uploaded_by) REFERENCES Users(id) ON DELETE SET NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS QuizScores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                quiz_id VARCHAR(255) NOT NULL,
                score INT NOT NULL,
                total INT NOT NULL,
                taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS Tutorials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                video_url VARCHAR(512) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS Queries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_name VARCHAR(255) NOT NULL,
                question TEXT NOT NULL,
                ai_answer TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS Assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                filepath VARCHAR(512) NOT NULL,
                uploaded_by INT NULL,
                status VARCHAR(50) DEFAULT 'approved',
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (uploaded_by) REFERENCES Users(id) ON DELETE SET NULL
            )
        `);

        // Check if video_url column is missing (due to pre-existing table using 'url')
        try {
            const [columns] = await pool.query('SHOW COLUMNS FROM Tutorials LIKE "video_url"');
            if (columns.length === 0) {
                console.log('Adding video_url column to existing Tutorials table...');
                await pool.query('ALTER TABLE Tutorials ADD COLUMN video_url VARCHAR(512) NULL');
                // Attempt to migrate data if 'url' column exists
                try {
                    await pool.query('UPDATE Tutorials SET video_url = url WHERE video_url IS NULL AND url IS NOT NULL');
                } catch (migErr) {
                    // url column might not exist either, which is fine
                }
            }
        } catch (colErr) {
            console.error('Error migrating column video_url:', colErr.message);
        }

        // Check if uploaded_by and status columns are missing in Assignments table
        try {
            const [columns] = await pool.query('SHOW COLUMNS FROM Assignments LIKE "status"');
            if (columns.length === 0) {
                console.log('Migrating Assignments table schema: adding uploaded_by and status columns...');
                await pool.query('ALTER TABLE Assignments ADD COLUMN uploaded_by INT NULL');
                await pool.query('ALTER TABLE Assignments ADD COLUMN status VARCHAR(50) DEFAULT "approved"');
                await pool.query('ALTER TABLE Assignments ADD CONSTRAINT fk_assignments_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES Users(id) ON DELETE SET NULL');
            }
        } catch (colErr) {
            console.error('Error migrating columns for Assignments:', colErr.message);
        }

        // Seed default tutorials if empty
        const [tutorials] = await pool.query('SELECT * FROM Tutorials');
        if (tutorials.length === 0) {
            const defaultTutorials = [
                ['Numerical One Shot Revision', 'https://www.youtube.com/embed/ajdRvxDWH4w?si=KifbPqu38c5r1HnP'],
                ['Java Tutorial for Beginners', 'https://www.youtube.com/embed/UmnCZ7-9yDY?si=ifUrtXtKA4T-uX8X'],
                ['PPS Unit-1 One Shot', 'https://www.youtube.com/embed/oaaEwxxnGuo?si=ILvbQ_-xr6etdLVI'],
                ['Python Full Course for Beginners', 'https://www.youtube.com/embed/_uQrJ0TkZlc?si=juVWZTNNWyB6TA9-'],
                ['C++ Programming Course', 'https://www.youtube.com/embed/8jLOx1hD3_o?si=rOiPX0GAO8Qb9ZPF'],
                ['JavaScript Full Course', 'https://www.youtube.com/embed/lfmg-EJ8gm4?si=uWjU6uBYTP1Am57i']
            ];
            for (const [title, url] of defaultTutorials) {
                await pool.query('INSERT INTO Tutorials (title, video_url) VALUES (?, ?)', [title, url]);
            }
            console.log('Seeded default tutorials into the database');
        }

        // Seed default assignments if empty
        const [assignments] = await pool.query('SELECT * FROM Assignments');
        if (assignments.length === 0) {
            const defaultAssignments = [
                { title: 'Math 2 : Unit 1', filename: 'B.Tech.First year 23-24 (Assignment - I) (4).pdf' },
                { title: 'Math 2 : Unit 3', filename: 'B.Tech.First year 23-24 (Assignment - III) (1).pdf' },
                { title: 'Electrical 2 Marks Questions', filename: 'EE All Unit 2 mrks que. PUT & semester.pdf' },
                { title: 'PPS Question Bank 1', filename: 'PPS IMPORTANT QUESTIONS 2024 even sem.docx' },
                { title: 'PPS Question Bank 2', filename: 'PPS IMPORTANT QUESTIONS and solution pinki.docx' },
                { title: 'PPS Question Bank 3', filename: 'PPS IMPORTANT QUESTIONS G2.docx' }
            ];

            const frontendAssignmentsDir = path.join(__dirname, '..', 'frontend', 'assignments');
            const uploadsDir = path.join(__dirname, 'uploads');

            for (const item of defaultAssignments) {
                const srcPath = path.join(frontendAssignmentsDir, item.filename);
                const destPath = path.join(uploadsDir, item.filename);
                if (fs.existsSync(srcPath)) {
                    if (!fs.existsSync(destPath)) {
                        fs.copyFileSync(srcPath, destPath);
                        console.log(`Copied assignment ${item.filename} to uploads`);
                    }
                    const filepath = `assets/uploads/${item.filename}`;
                    await pool.query(
                        'INSERT INTO Assignments (title, filename, filepath) VALUES (?, ?, ?)',
                        [item.title, item.filename, filepath]
                    );
                } else {
                    console.warn(`Source assignment file not found: ${srcPath}`);
                }
            }
            console.log('Seeded default assignments into the database');
        }

        // 4. Ensure at least one admin exists
        const [admins] = await pool.query('SELECT * FROM Users WHERE role = ?', ['admin']);
        if (admins.length === 0) {
            const adminPasswordHash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO Users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                ['Admin', 'admin@studyhive.com', adminPasswordHash, 'admin']
            );
            console.log('Seeded default admin user (admin@studyhive.com / admin123)');
        }

        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Database initialization failed:', err);
        // Do not crash the application immediately, but log the error
    }
}

// PDF Text Extraction Helper
async function extractTextFromPdf(pdfPath) {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdf(dataBuffer);
        return data.text || '';
    } catch (err) {
        console.error('Error reading PDF:', err);
        return '';
    }
}

// --- Auth Routes ---
app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO Users (name, email, password_hash) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );
        return res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email already exists' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    try {
        const [users] = await pool.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        return res.status(200).json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                points: user.points || 0
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/user/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const [users] = await pool.query(
            'SELECT id, name, email, role, points FROM Users WHERE id = ?',
            [user_id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.status(200).json({ user: users[0] });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// --- Admin / Notes Upload Routes ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
    }
    const { subject = 'General', topic = 'General', user_id } = req.body;
    const status = user_id ? 'pending' : 'approved';
    const originalName = req.file.originalname;
    const filename = req.file.filename;
    
    // Save relative path inside backend so it can be served or read
    const relativeFilepath = `assets/uploads/${filename}`;

    try {
        const [result] = await pool.query(
            'INSERT INTO Notes (subject, topic, original_name, filename, filepath, uploaded_by, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [subject, topic, originalName, filename, relativeFilepath, user_id || null, status]
        );
        return res.status(200).json({ message: 'File uploaded successfully', note_id: result.insertId });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/notes', async (req, res) => {
    try {
        const [notes] = await pool.query(
            "SELECT * FROM Notes WHERE status = 'approved' ORDER BY uploaded_at DESC"
        );
        return res.status(200).json({ notes });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/pending', async (req, res) => {
    try {
        const [notes] = await pool.query(
            "SELECT * FROM Notes WHERE status = 'pending' ORDER BY uploaded_at DESC"
        );
        return res.status(200).json({ notes });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/admin/moderate', async (req, res) => {
    const { note_id, action } = req.body; // 'approve' or 'reject'
    if (!note_id || !action) {
        return res.status(400).json({ error: 'Missing note_id or action' });
    }
    
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        if (action === 'approve') {
            await conn.query("UPDATE Notes SET status = 'approved' WHERE id = ?", [note_id]);
            const [rows] = await conn.query("SELECT uploaded_by FROM Notes WHERE id = ?", [note_id]);
            if (rows.length > 0 && rows[0].uploaded_by) {
                await conn.query("UPDATE Users SET points = points + 10 WHERE id = ?", [rows[0].uploaded_by]);
            }
        } else if (action === 'reject') {
            await conn.query("UPDATE Notes SET status = 'rejected' WHERE id = ?", [note_id]);
        }

        await conn.commit();
        return res.status(200).json({ message: `Note ${action}d successfully` });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    } finally {
        conn.release();
    }
});

// --- User Analytics Routes ---
app.post('/api/submit_quiz', async (req, res) => {
    const { user_id, quiz_id, score, total } = req.body;
    if (user_id === undefined || quiz_id === undefined || score === undefined || total === undefined) {
        return res.status(400).json({ error: 'Missing data' });
    }
    try {
        await pool.query(
            'INSERT INTO QuizScores (user_id, quiz_id, score, total) VALUES (?, ?, ?, ?)',
            [user_id, quiz_id, score, total]
        );
        return res.status(200).json({ message: 'Score saved successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/analytics/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const [scores] = await pool.query(
            'SELECT * FROM QuizScores WHERE user_id = ? ORDER BY taken_at ASC',
            [user_id]
        );
        return res.status(200).json({ scores });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/quizzes', (req, res) => {
    const quizzesFile = path.join(__dirname, 'quizzes.json');
    if (fs.existsSync(quizzesFile)) {
        try {
            const data = fs.readFileSync(quizzesFile, 'utf8');
            return res.json(JSON.parse(data));
        } catch (err) {
            console.error('Error reading quizzes.json:', err);
            return res.status(500).json({ error: 'Failed to read quizzes' });
        }
    }
    return res.json({});
});

// Resilient AI generation with fallback models
async function generateQuizWithGemini(prompt) {
    const modelsToTry = [
        'gemini-1.5-flash',
        'gemini-flash-latest',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-8b',
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-1.5-pro',
        'gemini-pro'
    ];

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            console.log(`Attempting to generate quiz using model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            if (responseText) {
                console.log(`Successfully generated quiz with model: ${modelName}`);
                return responseText;
            }
        } catch (err) {
            console.warn(`Model ${modelName} failed:`, err.message || err);
            lastError = err;
        }
    }

    throw lastError || new Error('All models failed to generate content');
}

// Resilient fallback quiz pool generator if AI API fails or is rate-limited
function getFallbackQuiz(subject, topic) {
    console.log(`Generating fallback offline quiz for Subject: "${subject}", Topic: "${topic}"`);
    const generalQuestions = [
        {
            "question": `Which of the following best describes the core concept of "${topic}" in the context of "${subject}"?`,
            "options": [
                "A localized resource optimization pattern",
                "A foundational protocol for system interaction",
                "An abstraction layer for resource management and coordination",
                "A methodology for synchronous data replication"
            ],
            "answer": "An abstraction layer for resource management and coordination"
        },
        {
            "question": `When analyzing key properties in "${subject}", what is the primary bottleneck typically encountered?`,
            "options": [
                "Network latency during socket initialization",
                "I/O operations and memory mapping overhead",
                "CPU register allocation limits",
                "Thread synchronization deadlock potential"
            ],
            "answer": "I/O operations and memory mapping overhead"
        },
        {
            "question": `What is the main advantage of using structured modular design rather than a monolithic approach when working with "${topic}"?`,
            "options": [
                "Reduced instruction set execution time",
                "Improved maintenance, easier debugging, and decoupled testing",
                "Automatic garbage collection efficiency",
                "Inherent security against buffer overflows"
            ],
            "answer": "Improved maintenance, easier debugging, and decoupled testing"
        },
        {
            "question": `Which algorithmic complexity class is generally targetted for optimization in processes related to "${topic}"?`,
            "options": [
                "O(1) constant time",
                "O(log n) logarithmic time",
                "O(n) linear time",
                "O(n log n) linearithmic time"
            ],
            "answer": "O(log n) logarithmic time"
        },
        {
            "question": "How does scaling vertically differ from scaling horizontally when deploying systems of this type?",
            "options": [
                "Vertical scaling adds more nodes, horizontal scaling increases capacity of a single node",
                "Vertical scaling increases the capacity of a single node, horizontal scaling adds more nodes",
                "Vertical scaling is always stateless, horizontal scaling is stateful",
                "There is no difference in resource distribution"
            ],
            "answer": "Vertical scaling increases the capacity of a single node, horizontal scaling adds more nodes"
        }
    ];

    // Create a pool of 15 questions by multiplying and variations to satisfy 15 questions pool
    const pool = [];
    for (let i = 0; i < 3; i++) {
        generalQuestions.forEach((q, idx) => {
            pool.push({
                question: `[Set ${i + 1}] ${q.question}`,
                options: [...q.options].reverse(), // swap options slightly for variety
                answer: q.answer
            });
        });
    }
    return pool;
}

// --- AI Quiz Generation Route ---
app.post('/api/generate_quiz', async (req, res) => {
    const { note_id } = req.body;
    if (!note_id) {
        return res.status(400).json({ error: 'Note ID is required' });
    }

    try {
        const [notes] = await pool.query('SELECT * FROM Notes WHERE id = ?', [note_id]);
        if (notes.length === 0) {
            return res.status(404).json({ error: 'Note not found' });
        }
        const note = notes[0];

        // Resolve filepath relative to repository root
        const absolutePath = path.join(__dirname, '..', note.filepath);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: `PDF file not found on disk at ${absolutePath}` });
        }

        const text = await extractTextFromPdf(absolutePath);
        if (!text) {
            return res.status(500).json({ error: 'Could not extract text from the file.' });
        }

        const truncatedText = text.substring(0, 15000);

        const prompt = `You are an expert university professor. Carefully read the following educational text and generate an extremely tough, in-depth, and highly conceptual 15-question multiple choice quiz. 
DO NOT ask surface-level questions like "What is the heading?" or "What is the title?". 
Instead, ask applied questions, deep technical specifications, mathematical/theoretical properties, scenario-based insights, or complex correlations derived strictly from the core material in the text.

Return ONLY a raw JSON array of objects without any markdown formatting like \`\`\`json.
Each object must strictly match this format:
{
  "question": "Deep conceptual question text here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "answer": "Exact Correct Option Here"
}

TEXT:
${truncatedText}`;

        let quizArray;

        if (!process.env.GEMINI_API_KEY) {
            console.warn('GEMINI_API_KEY is not set. Generating fallback quiz.');
            quizArray = getFallbackQuiz(note.subject, note.topic);
        } else {
            try {
                const responseText = await generateQuizWithGemini(prompt);
                // Clean markdown block wrappers if returned
                const quizJsonString = responseText
                    .replace(/```json/g, '')
                    .replace(/```/g, '')
                    .trim();
                quizArray = JSON.parse(quizJsonString);
            } catch (genErr) {
                console.warn('Gemini AI Generation failed or key rate-limited. Falling back to offline quiz pool. Error:', genErr.message || genErr);
                quizArray = getFallbackQuiz(note.subject, note.topic);
            }
        }

        // Save to quizzes.json
        const quizzesFile = path.join(__dirname, 'quizzes.json');
        let quizzesData = {};
        if (fs.existsSync(quizzesFile)) {
            try {
                const existingData = fs.readFileSync(quizzesFile, 'utf8');
                quizzesData = JSON.parse(existingData);
            } catch (err) {
                console.error('Error reading existing quizzes.json:', err);
            }
        }

        const newQuizId = `auto_${note_id}`;
        quizzesData[newQuizId] = quizArray;

        fs.writeFileSync(quizzesFile, JSON.stringify(quizzesData, null, 2), 'utf8');

        return res.status(200).json({ message: 'Quiz generated successfully', quiz_id: newQuizId });
    } catch (err) {
        console.error('Error generating quiz:', err);
        return res.status(500).json({ error: 'Failed to generate quiz' });
    }
});

// Helper to extract YouTube video ID and format as embed URL
function getYoutubeEmbedUrl(url) {
    if (!url) return '';
    if (url.includes('youtube.com/embed/')) return url;
    
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    
    if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.trim().length === 11) {
        return `https://www.youtube.com/embed/${url.trim()}`;
    }
    return url;
}

// --- Video Tutorials Routes ---
app.get('/api/tutorials', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Tutorials ORDER BY uploaded_at DESC');
        return res.status(200).json({ tutorials: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/tutorials', async (req, res) => {
    const { title, video_url } = req.body;
    if (!title || !video_url) {
        return res.status(400).json({ error: 'Missing title or video_url' });
    }
    try {
        const embedUrl = getYoutubeEmbedUrl(video_url);
        const [result] = await pool.query(
            'INSERT INTO Tutorials (title, video_url) VALUES (?, ?)',
            [title, embedUrl]
        );
        return res.status(201).json({ message: 'Tutorial added successfully', tutorial_id: result.insertId });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/tutorials/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM Tutorials WHERE id = ?', [id]);
        return res.status(200).json({ message: 'Tutorial deleted successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// Helper to generate AI response with fallback models
async function generateAIResponse(prompt) {
    const modelsToTry = [
        'gemini-1.5-flash',
        'gemini-flash-latest',
        'gemini-1.5-flash-latest',
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-pro'
    ];

    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            if (responseText) {
                return responseText;
            }
        } catch (err) {
            console.warn(`AI model ${modelName} failed:`, err.message || err);
            lastError = err;
        }
    }

    throw lastError || new Error('All models failed to generate content');
}

// --- Student AI Queries Routes ---
app.get('/api/queries', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Queries ORDER BY created_at DESC');
        return res.status(200).json({ queries: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/query', async (req, res) => {
    const { name, question } = req.body;
    if (!name || !question) {
        return res.status(400).json({ error: 'Missing name or question' });
    }

    try {
        // 1. Fetch approved Notes and Tutorials as context
        const [notes] = await pool.query("SELECT * FROM Notes WHERE status = 'approved'");
        const [tutorials] = await pool.query("SELECT * FROM Tutorials");

        // 2. Keyword matching to find relevant notes
        const questionWords = question.toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3);

        let relevantNotes = [];
        for (const note of notes) {
            const subjectLower = note.subject.toLowerCase();
            const topicLower = note.topic.toLowerCase();
            
            const isMatch = questionWords.some(word => 
                subjectLower.includes(word) || topicLower.includes(word)
            );
            
            if (isMatch) {
                relevantNotes.push(note);
            }
        }

        // Limit to top 2 notes
        relevantNotes = relevantNotes.slice(0, 2);

        // 3. Extract text from relevant notes
        let pdfTextContext = '';
        for (const note of relevantNotes) {
            const filename = note.filename;
            const fullPath = path.join(__dirname, 'uploads', filename);
            if (fs.existsSync(fullPath)) {
                console.log(`Extracting text from relevant PDF note: ${filename}...`);
                const text = await extractTextFromPdf(fullPath);
                if (text) {
                    pdfTextContext += `--- CONTENT OF NOTE: "${note.subject} - ${note.topic}" ---\n${text.substring(0, 8000)}\n\n`;
                }
            }
        }

        // 4. Construct lists of available resources
        const availableNotesList = notes.map(n => `- Subject: "${n.subject}", Topic: "${n.topic}", Filename: "${n.original_name}"`).join('\n');
        const availableVideosList = tutorials.map(t => `- Title: "${t.title}", Embed URL: "${t.video_url}"`).join('\n');

        // 5. Construct RAG prompt
        const prompt = `
You are "StudyHive AI", a helpful educational assistant for the StudyHive EdTech platform.
A student named ${name} asked this question: "${question}"

Answer their question comprehensively, using the following context from StudyHive's study materials:

--- START CONTEXT ---
${pdfTextContext || 'No directly matching PDF notes text found on disk.'}

--- ADDITIONAL STUDY MATERIALS AVAILABLE ON STUDYHIVE ---
(Suggest these notes/videos to the student as further learning resources if they relate to their query!)
Available Notes:
${availableNotesList || '- No notes available.'}

Available Videos:
${availableVideosList || '- No video tutorials available.'}
--- END CONTEXT ---

Instructions:
1. Answer the student's question directly, clearly, and thoroughly.
2. If matching PDF notes content was found in the context above, use it to personalize the answer.
3. If the context does not have the full answer, use your general knowledge, but keep it relevant.
4. At the end of your response under a "Recommended Study Resources" heading, list and recommend matching study notes or video tutorials from the "ADDITIONAL STUDY MATERIALS AVAILABLE ON STUDYHIVE" list above that relate to their question (provide the exact title/subject and say they can access them on the platform).
`;

        // 6. Generate AI Answer
        let aiAnswer;
        try {
            aiAnswer = await generateAIResponse(prompt);
        } catch (aiErr) {
            console.error('AI Generation error, using offline response:', aiErr.message || aiErr);
            aiAnswer = `Hi ${name}, I am currently experiencing connection issues with my AI core. However, we have resources on this topic. Please look at the Notes and Video Tutorials sections on StudyHive for materials related to "${question}".`;
        }

        // 7. Save to Queries database
        const [result] = await pool.query(
            'INSERT INTO Queries (student_name, question, ai_answer) VALUES (?, ?, ?)',
            [name, question, aiAnswer]
        );

        return res.status(200).json({
            id: result.insertId,
            student_name: name,
            question: question,
            ai_answer: aiAnswer
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to process student query' });
    }
});

// --- Dynamic Assignments Endpoints ---
app.get('/api/assignments', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM Assignments WHERE status = 'approved' ORDER BY uploaded_at DESC");
        return res.status(200).json({ assignments: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/assignments', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
    }
    const { title, user_id } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }
    const status = user_id ? 'pending' : 'approved';
    const filename = req.file.filename;
    const filepath = `assets/uploads/${filename}`;
    try {
        const [result] = await pool.query(
            'INSERT INTO Assignments (title, filename, filepath, uploaded_by, status) VALUES (?, ?, ?, ?, ?)',
            [title, filename, filepath, user_id || null, status]
        );
        return res.status(201).json({ message: 'Assignment uploaded successfully', assignment_id: result.insertId });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/assignments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM Assignments WHERE id = ?', [id]);
        return res.status(200).json({ message: 'Assignment deleted successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/pending-assignments', async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM Assignments WHERE status = 'pending' ORDER BY uploaded_at DESC"
        );
        return res.status(200).json({ assignments: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/admin/moderate-assignment', async (req, res) => {
    const { assignment_id, action } = req.body; // 'approve' or 'reject'
    if (!assignment_id || !action) {
        return res.status(400).json({ error: 'Missing assignment_id or action' });
    }
    
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        if (action === 'approve') {
            await conn.query("UPDATE Assignments SET status = 'approved' WHERE id = ?", [assignment_id]);
            const [rows] = await conn.query("SELECT uploaded_by FROM Assignments WHERE id = ?", [assignment_id]);
            if (rows.length > 0 && rows[0].uploaded_by) {
                await conn.query("UPDATE Users SET points = points + 10 WHERE id = ?", [rows[0].uploaded_by]);
            }
        } else if (action === 'reject') {
            await conn.query("UPDATE Assignments SET status = 'rejected' WHERE id = ?", [assignment_id]);
        }

        await conn.commit();
        return res.status(200).json({ message: `Assignment ${action}d successfully` });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
    } finally {
        conn.release();
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    await initializeDatabase();
    console.log(`Server running on port ${PORT}`);
});
