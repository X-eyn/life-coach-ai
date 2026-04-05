import google.generativeai as genai
import json
import os
import sys
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in .env file")
genai.configure(api_key=API_KEY)

EVALUATION_CRITERIA = {
    "ACADEMIC_COACHING": {
        "5": "Conceptual Mastery & Mental Mapping: Excellent use of analogies and real-life examples to compensate for lack of visuals. Actively uses 'Socratic questioning' to lead the student to the answer. Checks for understanding frequently.",
        "4": "Interactive Scaffolding: Explains the 'why' behind concepts clearly. Provides structured verbal hints rather than just giving the answer. Maintains a high level of student talk time.",
        "3": "Clear Logical Delivery: Provides a structured explanation of the topic. The flow is logical and easy to follow without a slide. Confidently answers student questions but may rely more on lecturing than coaching.",
        "2": "Passive Knowledge Transfer: Information is accurate but delivered in a 'reading from a textbook' style. Lacks engagement; the teacher speaks for the majority of the time without pausing for student reflection.",
        "1": "Fragmented Communication: Vague explanations or long, unproductive silences. The teacher struggles to explain complex points without a visual aid, leading to student confusion.",
    },
    "COMMUNICATION": {
        "5": "Proactive & Empathetic Support: Teacher anticipates student needs and proactively asks, 'What specific part of this can I make clearer for you?' Responds with high patience and encouraging tone.",
        "4": "Responsive & Supportive Guidance: Teacher addresses all student questions thoroughly. The tone is warm and professional, ensuring the student feels safe to ask for clarification.",
        "3": "Functional Two-Way Dialogue: A balanced conversation where the student feels comfortable enough to ask questions. The teacher provides accurate but standard answers.",
        "2": "Teacher-Led Interaction: Communication is mostly one-way. The teacher asks questions to prompt the student, but the student remains mostly reactive rather than curious.",
        "1": "Dismissive or Inadequate Response: Teacher provides incorrect, vague, or dismissive answers. Fails to acknowledge the student's specific confusion.",
    },
    "STUDENT_PARTICIPATION": {
        "5": "High Inquiry & Curiosity: Student actively drives the lesson by asking insightful questions. Shows a strong desire to connect the topic to broader concepts.",
        "4": "Knowledge Synthesis: Student demonstrates review of previous lessons by asking follow-up questions. Actively tries to bridge 'old' knowledge with 'new' topics.",
        "3": "Passive Compliance: Student answers when called upon and follows instructions, but does not initiate questions or show independent curiosity.",
        "2": "Delayed or Hesitant Response: Long silences when the teacher asks a question. Student seems distracted or struggles to formulate a basic verbal response.",
        "1": "Disengaged / Silent: Student remains silent or gives 'I don't know' answers repeatedly. Minimal effort to participate in the verbal exchange.",
    },
    "ATTITUDE_OF_TEACHER": {
        "5": "Student-Centered Deep Dive: Teacher adapts the lesson flow entirely to the student's pace and interests. Explains complex topics with depth, passion, and professional 'honorifics' (respectful language).",
        "4": "Motivational Coaching: Teacher actively encourages the student to think critically. Uses positive reinforcement (e.g., 'That's an excellent question!') to build student confidence.",
        "3": "Professional & Respectful: Maintains a polite and respectful tone (appropriate use of titles/honorifics). Follows the lesson plan adequately without being overly dismissive or overly enthusiastic.",
        "2": "Transaction-Oriented: Teacher provides answers but in a 'mechanical' or 'cold' way. Lack of warmth or encouragement in the vocal delivery.",
        "1": "Discouraging or Defensive: Teacher shuts down student curiosity (e.g., 'This isn't important now' or 'Just listen'). Tone may sound frustrated or impatient.",
    },
}

def evaluate_transcript(transcript: str) -> Dict[str, Any]:
    """
    Evaluate a transcript based on teacher-student interaction criteria.
    Returns a dictionary with scores and feedback for each category.
    """
    
    evaluation_prompt = f"""
You are an expert education evaluator specializing in teacher-student interactions. 
Analyze the following transcript and evaluate it based on these specific criteria.

TRANSCRIPT:
{transcript}

---

EVALUATION CRITERIA:

1. ACADEMIC COACHING:
   - 5: Excellent use of analogies/examples, Socratic questioning, frequent understanding checks
   - 4: Clear explanations of "why", structured verbal hints, high student talk time
   - 3: Structured explanation with logical flow, confident answers, slight lecturing tendency
   - 2: Accurate but textbook-like delivery, lacks engagement, teacher-heavy
   - 1: Vague explanations, long silences, struggles without visual aids

2. COMMUNICATION:
   - 5: Proactive empathetic support, anticipates needs, high patience, encouraging tone
   - 4: Responds thoroughly to questions, warm/professional tone, safe environment
   - 3: Balanced conversation, comfortable questioning, standard accurate answers
   - 2: Mostly one-way, teacher asks questions, students mostly reactive
   - 1: Incorrect/vague/dismissive answers, fails to acknowledge confusion

3. STUDENT PARTICIPATION:
   - 5: Active questioning, insightful questions, connects to broader concepts
   - 4: References previous lessons, follow-up questions, bridges old/new knowledge
   - 3: Answers when called upon, follows instructions, no independent curiosity
   - 2: Long silences, hesitant responses, seems distracted
   - 1: Silent or repeated "I don't know", minimal participation

4. ATTITUDE OF TEACHER:
   - 5: Adapts to student pace/interests, depth, passion, respectful language
   - 4: Encourages critical thinking, positive reinforcement, builds confidence
   - 3: Polite, respectful, appropriate use of titles, adequate lesson following
   - 2: Mechanical/cold delivery, lacks warmth/encouragement
   - 1: Discouraging, defensive, shuts down curiosity, frustrated/impatient

---

Please provide:
1. A score (1-5) for each of the 4 categories
2. A detailed justification for each score (2-3 sentences)
3. Key observations from the transcript
4. Specific recommendations for improvement

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{{
  "academic_coaching": {{
    "score": 4,
    "justification": "Clear explanation...",
    "key_evidence": ["Evidence point 1", "Evidence point 2"]
  }},
  "communication": {{
    "score": 4,
    "justification": "Well-structured dialogue...",
    "key_evidence": ["Evidence point 1", "Evidence point 2"]
  }},
  "student_participation": {{
    "score": 3,
    "justification": "Student participates when prompted...",
    "key_evidence": ["Evidence point 1", "Evidence point 2"]
  }},
  "attitude_of_teacher": {{
    "score": 4,
    "justification": "Professional and encouraging tone...",
    "key_evidence": ["Evidence point 1", "Evidence point 2"]
  }},
  "overall_score": 3.75,
  "key_observations": "Summary of main findings",
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}}
"""

    try:
        model = genai.GenerativeModel('models/gemini-3-flash-preview')
        response = model.generate_content(evaluation_prompt)
        
        # Parse the response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        response_text = response_text.strip()
        
        evaluation_data = json.loads(response_text)
        return {
            "success": True,
            "data": evaluation_data
        }
    except json.JSONDecodeError as e:
        print(f"Failed to parse evaluation response: {e}", file=sys.stderr)
        return {
            "success": False,
            "error": f"Failed to parse evaluation response: {str(e)}"
        }
    except Exception as e:
        print(f"Evaluation failed: {e}", file=sys.stderr)
        return {
            "success": False,
            "error": f"Evaluation failed: {str(e)}"
        }
