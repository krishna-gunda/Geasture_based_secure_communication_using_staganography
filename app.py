# app.py  —  Gesture-Based Secure Communication · with Auth
import os, sqlite3, hashlib
from functools import wraps
from io import BytesIO

from flask import (Flask, render_template, request, jsonify,
                   send_file, redirect, url_for, session, flash)
from werkzeug.security import generate_password_hash, check_password_hash
import stego_utils

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'stego-secret-2026-change-me')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

ALLOWED_EXT = {'png', 'jpg', 'jpeg'}
DB_PATH = 'users.db'

# ─────────────────────────────────────────
# Database helpers
# ─────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Create users table if it doesn't exist."""
    with get_db() as db:
        db.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                username  TEXT    UNIQUE NOT NULL,
                email     TEXT    UNIQUE NOT NULL,
                password  TEXT    NOT NULL,
                created   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        db.commit()

init_db()

# ─────────────────────────────────────────
# Auth guard decorator
# ─────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

# ─────────────────────────────────────────
# Auth routes
# ─────────────────────────────────────────
@app.route('/')
def home():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        db = get_db()
        user = db.execute(
            'SELECT * FROM users WHERE username = ?', (username,)
        ).fetchone()
        db.close()
        if user and check_password_hash(user['password'], password):
            session.clear()
            session['user_id']   = user['id']
            session['username']  = user['username']
            return redirect(url_for('index'))
        else:
            error = 'Invalid username or password.'
    return render_template('login.html', error=error)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if 'user_id' in session:
        return redirect(url_for('index'))
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email    = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        confirm  = request.form.get('confirm', '')
        if not username or not email or not password:
            error = 'All fields are required.'
        elif password != confirm:
            error = 'Passwords do not match.'
        elif len(password) < 6:
            error = 'Password must be at least 6 characters.'
        else:
            try:
                db = get_db()
                db.execute(
                    'INSERT INTO users (username, email, password) VALUES (?,?,?)',
                    (username, email, generate_password_hash(password))
                )
                db.commit()
                db.close()
                return redirect(url_for('login') + '?registered=1')
            except sqlite3.IntegrityError:
                error = 'Username or email already exists.'
    return render_template('register.html', error=error)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# ─────────────────────────────────────────
# Main app (protected)
# ─────────────────────────────────────────
@app.route('/app')
@login_required
def index():
    return render_template('index.html', username=session.get('username'))

# ─────────────────────────────────────────
# API routes (protected)
# ─────────────────────────────────────────
@app.route('/api/estimate', methods=['POST'])
@login_required
def api_estimate():
    if 'snapshot' not in request.files:
        return jsonify({'error': 'No snapshot provided'}), 400
    f = request.files['snapshot']
    try:
        count = stego_utils.estimate_finger_count_from_bytes(f.read())
        return jsonify({'count': int(count)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/encrypt', methods=['POST'])
@login_required
def api_encrypt():
    if 'cover' not in request.files:
        return jsonify({'error': 'No cover image'}), 400
    cover = request.files['cover']
    if not cover.filename or not allowed_file(cover.filename):
        return jsonify({'error': 'Invalid cover image'}), 400

    message  = request.form.get('message', '')
    passcode = request.form.get('passcode', '')
    gesture  = request.form.get('gesture', None)

    if (gesture is None or gesture == '') and 'snapshot' in request.files:
        try:
            gesture = stego_utils.estimate_finger_count_from_bytes(
                request.files['snapshot'].read())
        except Exception:
            gesture = 0

    try:
        gesture = int(gesture)
    except Exception:
        gesture = 0

    if not message or not passcode:
        return jsonify({'error': 'Enter both message and passcode'}), 400

    combined_key = passcode + str(gesture)
    hashed  = stego_utils.hash_password(combined_key)
    payload = hashed + message
    try:
        stego_bytes = stego_utils.embed_message_lsb_file(cover.read(), payload)
        return send_file(BytesIO(stego_bytes),
                         mimetype='image/png',
                         as_attachment=True,
                         download_name='stego_encrypted.png')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/decrypt', methods=['POST'])
@login_required
def api_decrypt():
    if 'stego' not in request.files:
        return jsonify({'error': 'No stego image provided'}), 400
    st = request.files['stego']
    if not st.filename or not allowed_file(st.filename):
        return jsonify({'error': 'Invalid stego image'}), 400

    passcode = request.form.get('passcode', '')
    gesture  = request.form.get('gesture', None)

    if (gesture is None or gesture == '') and 'snapshot' in request.files:
        try:
            gesture = stego_utils.estimate_finger_count_from_bytes(
                request.files['snapshot'].read())
        except Exception:
            gesture = 0
    try:
        gesture = int(gesture)
    except Exception:
        gesture = 0

    if not passcode:
        return jsonify({'error': 'Enter passcode'}), 400
    try:
        extracted   = stego_utils.extract_message_lsb_from_bytes(st.read())
        stored_hash = extracted[:10]
        secret_msg  = extracted[10:]
        hashed_key  = stego_utils.hash_password(passcode + str(gesture))
        if stored_hash == hashed_key:
            return jsonify({'success': True, 'message': secret_msg})
        else:
            return jsonify({'success': False,
                            'message': 'Incorrect passcode or gesture.'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
