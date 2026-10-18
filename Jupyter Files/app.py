import joblib
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

bundle = joblib.load("normal_model.joblib")
model, features, medians = bundle["model"], bundle["features"], bundle["medians"]

app = Flask(__name__)
CORS(app)

@app.post("/predict")
def predict():
    data = request.get_json(silent=True) or {}
    row, filled = {}, []
    for f in features:
        try:
            row[f] = float(data.get(f))
        except (TypeError, ValueError):
            row[f] = medians[f]
            filled.append(f)

    X = pd.DataFrame([row])[features]
    verdict = "Normal" if model.predict(X)[0] == 1 else "Unusual"
    score = float(model.decision_function(X)[0])
    return jsonify(verdict=verdict, score=round(score, 3), filled_with_median=filled)

@app.get("/health")
def health():
    return jsonify(status="ok")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
