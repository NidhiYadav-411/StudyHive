import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from dotenv import load_dotenv
import bcrypt
from werkzeug.utils import secure_filename
import PyPDF2
import json
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
CORS(app)

DB_HOST = os.getenv('MYSQL_HOST', 'localhost')
DB_PORT = os.getenv('MYSQL_PORT', '3307')
DB_USER = os.getenv('MYSQL_USER', 'root')
DB_PASS = os.getenv('MYSQL_PASSWORD', '@Nidhi21346')
DB_NAME = os.getenv('MYSQL_DB', 'studyhive')

UPLOAD_FOLDER = 'assets/uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def get_db_connection():
    try:
        # Connect without db name first to create it if necessary
        conn = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS
        )
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        conn.database = DB_NAME
        
        # Create Tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS Users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'student'
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS Notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subject VARCHAR(255) NOT NULL,
                topic VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                filepath VARCHAR(512) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS QuizScores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                quiz_id VARCHAR(255) NOT NULL,
                score INT NOT NULL,
                total INT NOT NULL,
                taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Ensure at least one admin exists
        cursor.execute("SELECT * FROM Users WHERE role='admin'")
        admin = cursor.fetchone()
        if not admin:
            hashed = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode('utf-8')
            cursor.execute("INSERT INTO Users (name, email, password_hash, role) VALUES (%s, %s, %s, %s)", 
                          ("Admin", "admin@studyhive.com", hashed, "admin"))
            conn.commit()
            
        return conn
    except mysql.connector.Error as err:
        print(f"Error connecting to MySQL: {err}")
        return None

# Initialize DB on start
db = get_db_connection()
if db:
    db.close()

# --- Auth Routes ---
@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    if not name or not email or not password:
        return jsonify({"error": "Missing fields"}), 400
        
    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database error"}), 500
        
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO Users (name, email, password_hash) VALUES (%s, %s, %s)", (name, email, hashed_pw))
        conn.commit()
        return jsonify({"message": "User registered successfully"}), 201
    except mysql.connector.IntegrityError:
        return jsonify({"error": "Email already exists"}), 409
    finally:
        cursor.close()
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({"error": "Missing fields"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Users WHERE email = %s", (email,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        return jsonify({
            "message": "Login successful",
            "user": {
                "id": user['id'],
                "name": user['name'],
                "email": user['email'],
                "role": user['role'],
                "points": user.get('points', 0)
            }
        }), 200
    else:
        return jsonify({"error": "Invalid email or password"}), 401

@app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user_data(user_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name, email, role, points FROM Users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    if user:
        return jsonify({"user": user}), 200
    return jsonify({"error": "User not found"}), 404

# --- Admin Routes ---
@app.route('/api/upload', methods=['POST'])
def upload_note():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
        
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        subject = request.form.get('subject', 'General')
        topic = request.form.get('topic', 'General')
        
        # User auth can be passed securely from frontend
        uploaded_by = request.form.get('user_id')
        status = 'pending' if uploaded_by else 'approved'
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO Notes (subject, topic, original_name, filename, filepath, uploaded_by, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                      (subject, topic, file.filename, filename, filepath, uploaded_by or None, status))
        conn.commit()
        note_id = cursor.lastrowid
        cursor.close()
        conn.close()
        
        return jsonify({"message": "File uploaded successfully", "note_id": note_id}), 200

@app.route('/api/notes', methods=['GET'])
def get_notes():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Notes WHERE status = 'approved' ORDER BY uploaded_at DESC")
    notes = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify({"notes": notes}), 200

@app.route('/api/admin/pending', methods=['GET'])
def get_pending_notes():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Notes WHERE status = 'pending' ORDER BY uploaded_at DESC")
    notes = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify({"notes": notes}), 200

@app.route('/api/admin/moderate', methods=['POST'])
def moderate_note():
    data = request.json
    note_id = data.get('note_id')
    action = data.get('action') # 'approve' or 'reject'
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    if action == 'approve':
        cursor.execute("UPDATE Notes SET status = 'approved' WHERE id = %s", (note_id,))
        # Award 10 points!
        cursor.execute("SELECT uploaded_by FROM Notes WHERE id = %s", (note_id,))
        row = cursor.fetchone()
        if row and row['uploaded_by']:
            cursor.execute("UPDATE Users SET points = points + 10 WHERE id = %s", (row['uploaded_by'],))
            
    elif action == 'reject':
        cursor.execute("UPDATE Notes SET status = 'rejected' WHERE id = %s", (note_id,))
        
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": f"Note {action}d successfully"}), 200

# --- User Analytics Routes ---
@app.route('/api/submit_quiz', methods=['POST'])
def submit_quiz():
    data = request.json
    user_id = data.get('user_id')
    quiz_id = data.get('quiz_id')
    score = data.get('score')
    total = data.get('total')
    
    if not all([user_id, quiz_id, score is not None, total]):
        return jsonify({"error": "Missing data"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO QuizScores (user_id, quiz_id, score, total) VALUES (%s, %s, %s, %s)",
                   (user_id, quiz_id, score, total))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Score saved successfully"}), 200

@app.route('/api/analytics/<int:user_id>', methods=['GET'])
def get_analytics(user_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM QuizScores WHERE user_id = %s ORDER BY taken_at ASC", (user_id,))
    scores = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify({"scores": scores}), 200

# Configure Gemini
genai.configure(api_key=os.getenv('GEMINI_API_KEY', ''))

def extract_text_from_pdf(pdf_path):
    text = ""
    try:
        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            for page_num in range(min(5, len(reader.pages))):
                text += reader.pages[page_num].extract_text()
    except Exception as e:
        print(f"Error reading PDF: {e}")
    return text

@app.route('/api/generate_quiz', methods=['POST'])
def generate_quiz():
    data = request.json
    note_id = data.get('note_id')
    
    if not note_id:
        return jsonify({"error": "Note ID is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM Notes WHERE id = %s", (note_id,))
    note = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not note:
        return jsonify({"error": "Note not found"}), 404
        
    # Extract text and generate quiz
    text = extract_text_from_pdf(note['filepath'])
    if not text:
        return jsonify({"error": "Could not extract text from the file. Try docx/text methods if needed."}), 500
        
    prompt = f"""
    You are an expert university professor. Carefully read the following educational text and generate an extremely tough, in-depth, and highly conceptual 5-question multiple choice quiz. 
    DO NOT ask surface-level questions like "What is the heading?" or "What is the title?". 
    Instead, ask applied questions, deep technical specifications, mathematical/theoretical properties, scenario-based insights, or complex correlations derived strictly from the core material in the text.
    
    Return ONLY a raw JSON array of objects without any markdown formatting like ```json.
    Each object must strictly match this format:
    {{
      "question": "Deep conceptual question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Exact Correct Option Here"
    }}
    
    TEXT:
    {text[:15000]}
    """
    
    try:
        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(prompt)
        quiz_json_string = response.text.replace('```json', '').replace('```', '').strip()
        quiz_array = json.loads(quiz_json_string)
        
        # Save to existing quizzes.json
        quizzes_file = 'quizzes.json'
        if os.path.exists(quizzes_file):
            with open(quizzes_file, 'r') as f:
                quizzes_data = json.load(f)
        else:
            quizzes_data = {}
            
        new_quiz_id = f"auto_{note_id}"
        quizzes_data[new_quiz_id] = quiz_array
        
        with open(quizzes_file, 'w') as f:
            json.dump(quizzes_data, f, indent=2)
            
        return jsonify({"message": "Quiz generated successfully", "quiz_id": new_quiz_id}), 200
        
    except Exception as e:
        print(f"Error generating quiz: {e}")
        return jsonify({"error": "Failed to generate quiz via AI"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
