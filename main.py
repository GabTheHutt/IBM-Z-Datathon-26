from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.neural_network import MLPRegressor
import numpy as np

app = FastAPI(title="Fitness & Energy Tracker API")

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dummy Pre-Trained Model (Replaces Keras Sequential)
# Inputs: [calories_logged, carbs, protein, fat, steps, mood, energy]
X_dummy = np.random.rand(100, 7)
y_dummy = np.random.rand(100, 2) # Outputs: [predicted_fatigue_index, recommended_protein_boost]

model = MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=200, random_state=42)
model.fit(X_dummy, y_dummy)

class UserInput(BaseModel):
    calories_logged: float
    carbs_g: float
    protein_g: float
    fat_g: float
    steps_today: int
    mood_score: int
    energy_score: int

@app.get("/")
def health_check():
    return {"status": "online", "engine": "scikit-learn on IBM LinuxONE"}

@app.post("/api/predict-dashboard")
def predict_dashboard(data: UserInput):
    # Prepare input for scikit-learn
    features = np.array([[
        data.calories_logged, data.carbs_g, data.protein_g, 
        data.fat_g, data.steps_today, data.mood_score, data.energy_score
    ]])
    
    # Run prediction
    prediction = model.predict(features)[0]
    fatigue_index = float(prediction[0] * 100)
    
    # Generate dynamic advice
    protein_deficit = 140 - data.protein_g
    if protein_deficit > 20:
        recommendation = f"Increase protein intake by {int(protein_deficit)}g to prevent cognitive fatigue."
    else:
        recommendation = "Your macros are well balanced for today's load!"

    return {
        "calories": {"current": data.calories_logged, "goal": 2200},
        "macros": {
            "carbs": {"current": data.carbs_g, "target": 220},
            "protein": {"current": data.protein_g, "target": 140},
            "fat": {"current": data.fat_g, "target": 60},
            "recommendation": recommendation
        },
        "cognitive_fatigue_index": round(fatigue_index, 1)
    }
