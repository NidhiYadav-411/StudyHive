const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY is not defined in backend/.env!");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

const questions = [
    // Category 1: Frontend & DOM Manipulation
    "Q1: What is the DOM, and how does the browser parse HTML?",
    "Q2: Explain the difference between DOMContentLoaded and window.onload.",
    "Q3: How does StudyHive fetch and display notes dynamically? Explain the JavaScript workflow.",
    "Q4: Explain the difference between element.innerHTML and element.textContent. Which one is safer and why?",
    "Q5: What is event delegation, and why is it useful?",
    "Q6: How does the client-side search filtering work in the assignments page?",
    "Q7: Explain localStorage vs sessionStorage. How does StudyHive maintain user state?",
    "Q8: How can a user manipulate local storage via dev tools, and how do we prevent security exploits?",
    "Q9: What is Glassmorphism, and how did you implement it in StudyHive CSS?",
    "Q10: What are CSS Custom Properties (variables), and how do they benefit theme setups?",
    "Q11: Explain CSS Flexbox vs CSS Grid. When would you use which?",
    "Q12: How do you achieve responsive design without UI frameworks like Bootstrap or Tailwind?",
    "Q13: What is the benefit of using the input event over keyup/keydown for search filters?",
    "Q14: How does the front-end handle navigation active states?",
    "Q15: Explain how data binding works in pure JavaScript.",

    // Category 2: Asynchronous JavaScript & APIs
    "Q16: What is a Promise in JavaScript? What are its different states?",
    "Q17: Explain the difference between callback-based asynchronous code and Promises.",
    "Q18: Explain the async and await keywords. How do they work under the hood?",
    "Q19: What is the JavaScript Event Loop? Explain call stack, web APIs, callback queue, and microtask queue.",
    "Q20: How does fetch() work, and how do you handle HTTP errors using fetch?",
    "Q21: What is a FormData object, and why is it used for file uploads in StudyHive?",
    "Q22: Explain the concept of Cross-Origin Resource Sharing (CORS).",
    "Q23: Why do we use template literals in ES6 JavaScript?",
    "Q24: What is JSON, and why is it the standard for API communication?",
    "Q25: Explain the difference between synchronous and asynchronous operations in Node.js.",
    "Q26: What is window.location.hostname check in index.js and why is it useful?",
    "Q27: How do you handle network failure gracefully in the frontend?",
    "Q28: Explain the difference between fetch and axios.",
    "Q29: What is rate limiting, and why would you implement it for APIs?",
    "Q30: How do you serialize and deserialize objects in JavaScript?",

    // Category 3: Node.js & Express Backend
    "Q31: What is Node.js? Why is it single-threaded and how does it handle concurrency?",
    "Q32: What is Express.js, and what are its key features?",
    "Q33: What is Middleware in Express? Explain with examples from StudyHive.",
    "Q34: What is the role of cors middleware in server.js?",
    "Q35: How does Multer handle file uploads, and how is it configured in StudyHive?",
    "Q36: Explain the structure of an Express route handler. What are req and res?",
    "Q37: What is dotenv and why is it used to manage environment variables?",
    "Q38: Why should we never commit the .env file to version control?",
    "Q39: Explain how app.use(express.json()) works in Node.js.",
    "Q40: What is the purpose of express.static middleware, and how is it used in StudyHive?",
    "Q41: Explain path resolution in Node.js using path.join and __dirname.",
    "Q42: What is the difference between require() (CommonJS) and import (ES6 modules)?",
    "Q43: How do you handle global errors in an Express application?",
    "Q44: What is package.json, and what is the difference between dependencies and devDependencies?",
    "Q45: What is package-lock.json, and why is it important?",
    "Q46: How do you design clean, scalable RESTful API endpoints?",
    "Q47: What is Node.js cluster module, and how does it help in scaling applications?",
    "Q48: What is PM2, and why is it used for running Node.js production servers?",
    "Q49: How do you debug a memory leak in Node.js?",
    "Q50: Explain standard streaming vs buffering in Node.js file operations.",

    // Category 4: Database & SQL (MySQL)
    "Q51: What is a Relational Database Management System (RDBMS)? Why choose MySQL?",
    "Q52: What is SQL Injection, and how does StudyHive prevent it?",
    "Q53: What is Connection Pooling, and why is it preferred over opening individual connections?",
    "Q54: Explain the difference between SQL JOIN operations (INNER, LEFT, RIGHT, FULL).",
    "Q55: What are foreign key constraints, and what does ON DELETE SET NULL or ON DELETE CASCADE mean?",
    "Q56: What is a Database Transaction? Explain the ACID properties.",
    "Q57: How is a database transaction implemented in StudyHive's moderation routes?",
    "Q58: Explain database normalization (1NF, 2NF, 3NF). Why is it important?",
    "Q59: What is database indexing, and how does it improve query performance?",
    "Q60: Explain the difference between SQL and NoSQL databases.",
    "Q61: What is the purpose of CREATE TABLE IF NOT EXISTS queries in server.js?",
    "Q62: What is the difference between pool.query and pool.getConnection?",
    "Q63: How do you handle schema changes (migrations) dynamically at server startup in StudyHive?",
    "Q64: What is the purpose of seeding databases, and how does StudyHive seed initial data?",
    "Q65: What is the difference between CHAR and VARCHAR in MySQL?",
    "Q66: Explain SQL aggregations (COUNT, SUM, AVG, GROUP BY).",
    "Q67: What is the difference between DELETE and TRUNCATE in SQL?",
    "Q68: How do database constraints like UNIQUE protect data integrity?",
    "Q69: Explain the N+1 query problem and how to optimize it in SQL.",
    "Q70: What is database sharding and replication?",

    // Category 5: Security & Cryptography
    "Q71: What is cryptography, and what is the difference between encryption and hashing?",
    "Q72: Why should passwords never be decrypted? Explain one-way hashing.",
    "Q73: What is salt in hashing, and why is it used in Bcrypt?",
    "Q74: Explain the authentication flow in StudyHive.",
    "Q75: What is Role-Based Access Control (RBAC)? How is it implemented in StudyHive?",
    "Q76: Explain the difference between Session-based authentication and Token-based authentication (JWT).",
    "Q77: What is Session Hijacking, and how do you protect against it?",
    "Q78: Explain Cross-Site Scripting (XSS). How can a frontend application prevent it?",
    "Q79: What is CSRF (Cross-Site Request Forgery), and how do you prevent it?",
    "Q80: What is HTTPS, and how does SSL/TLS protect web traffic?",
    "Q81: What is the difference between authorization and authentication?",
    "Q82: How do you secure REST APIs against brute-force attacks?",
    "Q83: What is input validation, and why is it critical for security?",
    "Q84: How do clean file names prevent directory traversal attacks?",
    "Q85: What are security headers like Helmet in Express?",

    // Category 6: AI, Gemini & PDF Extraction
    "Q86: What is a Large Language Model (LLM)? How does Google Gemini work?",
    "Q87: Explain prompt engineering. What techniques are used in StudyHive for generating quiz questions?",
    "Q88: How does the AI chatbot in StudyHive utilize context to answer student queries?",
    "Q89: What is Retrieval-Augmented Generation (RAG)? How is it simplified in StudyHive?",
    "Q90: How does pdf-parse extract text from PDF documents? Explain the process.",
    "Q91: What is the difference between structured text extraction and OCR?",
    "Q92: What are tokens in LLMs, and how does token length limit affect prompts?",
    "Q93: Explain the role of fallback systems in AI integration (e.g. offline fallback response).",
    "Q94: How do you format LLM outputs as JSON programmatically?",
    "Q95: What is temperature parameter in LLMs?",
    "Q96: How does StudyHive parse raw AI output to populate the quiz structure dynamically?",
    "Q97: What are some limitations of LLMs (e.g., hallucinations), and how do we mitigate them?",
    "Q98: How do API keys work, and why should they be kept confidential?",
    "Q99: Explain how semantic search differs from keyword matching.",
    "Q100: How would you scale the AI features in StudyHive to support thousands of active users?"
];

const BATCH_SIZE = 5;
const DELAY_MS = 6000; // 6 seconds delay to respect API rate limits

const outputPath = path.join(__dirname, '..', 'frontend', 'interview_guide_detailed.html');

const headerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StudyHive - 100 Interview Q&As Comprehensive Hinglish Guide</title>
    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: #1e293b;
            --text-color: #e2e8f0;
            --text-muted: #94a3b8;
            --accent: #38bdf8;
            --accent-green: #34d399;
            --border-color: #334155;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 0;
            line-height: 1.6;
        }

        .container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        header {
            text-align: center;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 30px;
            margin-bottom: 40px;
        }

        h1 {
            color: var(--accent);
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        header p {
            color: var(--text-muted);
            font-size: 1.2rem;
        }

        .category-section {
            margin-bottom: 50px;
        }

        .qna-card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 30px;
            page-break-inside: avoid;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        }

        .question {
            color: var(--accent);
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 15px;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 10px;
        }

        .answer {
            color: var(--text-color);
            font-size: 1rem;
        }

        .section-block {
            margin-bottom: 16px;
        }

        .section-block strong {
            color: var(--accent-green);
            display: inline-block;
            margin-bottom: 5px;
        }

        ul, ol {
            margin-top: 5px;
            padding-left: 20px;
        }

        li {
            margin-bottom: 5px;
        }

        code {
            background-color: rgba(255, 255, 255, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.95rem;
            color: #f472b6;
        }

        pre {
            background-color: #05070f;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            border: 1px solid var(--border-color);
            margin: 10px 0;
        }

        pre code {
            color: #38bdf8;
            background: none;
            padding: 0;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }

        th, td {
            border: 1px solid var(--border-color);
            padding: 10px;
            text-align: left;
        }

        th {
            background-color: rgba(56, 189, 248, 0.1);
            color: var(--accent);
        }

        /* Print styling optimized for exporting to PDF */
        @media print {
            body {
                background-color: #fff;
                color: #000;
            }
            .container {
                max-width: 100%;
                padding: 10px;
            }
            .qna-card {
                background-color: #fff;
                border: 1px solid #ccc;
                color: #000;
                box-shadow: none;
                margin-bottom: 20px;
                padding: 20px;
                page-break-inside: avoid;
            }
            .question {
                color: #0284c7;
                border-bottom: 1px solid #ccc;
            }
            .section-block strong {
                color: #16a34a;
            }
            .answer {
                color: #111;
            }
            th {
                background-color: #f4f4f5;
                color: #000;
            }
            code, pre {
                background-color: #f4f4f5;
                color: #000;
                border: 1px solid #e4e4e7;
            }
            pre code {
                color: #000;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>StudyHive Master Interview Guide (Detailed Hinglish)</h1>
            <p>100 Questions fully explained with examples, analogies, and deep technical details</p>
        </header>
        <div class="category-section">
`;

async function main() {
    console.log("Starting interview guide generator...");
    fs.writeFileSync(outputPath, headerHTML, 'utf8');
    console.log(`Initialized output file at: ${outputPath}`);

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        const batch = questions.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(questions.length / BATCH_SIZE);

        console.log(`[${batchNum}/${totalBatches}] Generating details for questions ${i + 1} to ${Math.min(i + BATCH_SIZE, questions.length)}...`);

        const prompt = `You are a Senior Software Engineer and technical educator. 
We have a Node.js/Express backend (server.js), MySQL database (Users, Notes, Assignments, QuizScores, Tutorials), Gemini AI API integration, and vanilla HTML/JS frontend (index.html, notes.html, assignments.html, query.html, user_dashboard.html, admin_dashboard.html).

Translate and explain the following ${batch.length} interview questions into extremely rich, highly detailed explanations in Hinglish (Hindi + English mix).
Each question's output must be an HTML block wrapped in a <div class="qna-card">.
Inside the card, you must provide EXACTLY these 5 sections:

1. <div class="question">Q(number): [Question Text]</div>
2. <div class="answer">
   - <div class="section-block"><strong>1. Core Concept (Simple Hinglish):</strong> Explain the concept in simple, easy-to-understand Hinglish with direct, everyday examples. Explain *why* it is needed.</div>
   - <div class="section-block"><strong>2. Database / Code Level Example:</strong> Write down detailed code templates or database queries directly reflecting our StudyHive project codebase. Mention specific tables, APIs, or JS files. Use code blocks (&lt;pre&gt;&lt;code&gt;) where relevant.</div>
   - <div class="section-block"><strong>3. Real-life Analogy:</strong> Provide a relatable real-life analogy (like a restaurant, library, traffic, etc.) to visual-map the concept.</div>
   - <div class="section-block"><strong>4. Under the Hood (Interviewer 'Wow' Points):</strong> Explain deep technical details (like event loop phases, database transaction logs, Bcrypt cost metrics, vector math, Cosine Similarity, security vulnerabilities etc.) to show senior developer expertise.</div>
   - <div class="section-block"><strong>5. Summary Table / Quick Recall points:</strong> Create a summary table or bullet list summarizing the key takeaways for quick revision.</div>
   </div>

Here are the questions to generate:
${batch.map((q, idx) => `${i + idx + 1}. ${q}`).join('\n')}

Important constraints:
- Do not output any markdown formatting wrapper like \`\`\`html or \`\`\`. Output ONLY the raw HTML string.
- Make the answers extremely long, detailed, and rich—make sure each question is fully explained like a dedicated chapter of a premium interview prep book.`;

        let success = false;
        let retries = 3;

        while (!success && retries > 0) {
            try {
                const result = await model.generateContent(prompt);
                const responseText = result.response.text();
                
                // Strip possible markdown code wrappers
                const cleanHTML = responseText.replace(/```html/g, '').replace(/```/g, '').trim();
                
                fs.appendFileSync(outputPath, cleanHTML + '\n\n', 'utf8');
                success = true;
            } catch (err) {
                console.error(`Error generating batch ${batchNum}:`, err.message || err);
                retries--;
                if (retries > 0) {
                    console.log(`Retrying batch ${batchNum} in 10 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
        }

        if (!success) {
            console.error(`Failed to generate batch ${batchNum} after 3 retries. Skipping.`);
        }

        // Delay to prevent hitting rate limits
        if (i + BATCH_SIZE < questions.length) {
            console.log(`Waiting ${DELAY_MS / 1000} seconds before next batch...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    fs.appendFileSync(outputPath, '\n</div>\n</div>\n</body>\n</html>', 'utf8');
    console.log(`\nSuccess! Detailed interview guide successfully generated at: ${outputPath}`);
    console.log("You can view it locally at http://localhost:3000/interview_guide_detailed.html and print it as a PDF.");
}

main().catch(err => {
    console.error("Critical error in main loop:", err);
});
