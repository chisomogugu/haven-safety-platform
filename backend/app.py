from flask import Flask, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

@app.route('/api/health', methods=['GET'])
def health_check():
    """Check if the Haven API is running and healthy."""
    return jsonify({
        'status': 'healthy',
        'message': 'Haven API is running'
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
