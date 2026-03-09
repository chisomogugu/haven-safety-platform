from flask import Flask
from flask_cors import CORS
import os
from dotenv import load_dotenv

from database import init_db
from routes.threats import threats_bp
from routes.profile import profile_bp
from routes.ai import ai_bp
from routes.checkins import checkins_bp

load_dotenv()

app = Flask(__name__)
CORS(app)

# Register blueprints
app.register_blueprint(threats_bp, url_prefix='/api')
app.register_blueprint(profile_bp, url_prefix='/api')
app.register_blueprint(ai_bp, url_prefix='/api')
app.register_blueprint(checkins_bp, url_prefix='/api')

# Always init DB — runs whether started via `flask run` or `python app.py`
with app.app_context():
    init_db()



if __name__ == '__main__':
    app.run(debug=True, port=5000)
