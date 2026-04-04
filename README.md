# SecureStego — Gesture-Based Secure Communication

## Project Structure

```
your_project/
│
├── app.py                  ← Main Flask app (with auth + all routes)
├── stego_utils.py          ← YOUR EXISTING FILE (keep as-is)
├── requirements.txt        ← Python dependencies
├── users.db                ← SQLite database (auto-created on first run)
│
├── templates/
│   ├── login.html          ← Login page
│   ├── register.html       ← Register page
│   └── index.html          ← Main stego app (protected)
│
├── static/                 ← (optional) CSS/JS/image assets
│
└── logs/                   ← YOUR EXISTING log files
    └── ...
```

## Setup Instructions

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Place your existing files
Make sure `stego_utils.py` and your existing `Model.pkl`, `standar_scaler.pkl` are in the root project folder alongside `app.py`.

### 3. Run the app
```bash
python app.py
```

Then open: **http://127.0.0.1:5000**

---

## How Auth Works

- **Register** at `/register` → creates account in `users.db` (SQLite, passwords hashed with werkzeug)
- **Login** at `/login` → sets a session cookie
- **All `/app` and `/api/*` routes** are protected — redirect to login if not authenticated
- **Logout** at `/logout` → clears session

## Route Map

| Route          | Method     | Description                        |
|----------------|------------|------------------------------------|
| `/`            | GET        | Redirects to login or app          |
| `/login`       | GET, POST  | Login page                         |
| `/register`    | GET, POST  | Register page                      |
| `/logout`      | GET        | Logs out user                      |
| `/app`         | GET        | Main steganography app (protected) |
| `/api/estimate`| POST       | Finger count from webcam snapshot  |
| `/api/encrypt` | POST       | Embed message into image           |
| `/api/decrypt` | POST       | Extract message from stego image   |

## Security Notes

- Passwords are hashed using `werkzeug.security.generate_password_hash` (PBKDF2)
- Session secret key: change `stego-secret-2026-change-me` in `app.py` for production
- Set `SECRET_KEY` as an environment variable in production
