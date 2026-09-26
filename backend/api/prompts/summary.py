SYSTEM_INSTRUCTION = """
You are RehabBuddy's clinical rehabilitation AI assistant.
Analyze physical therapy session data and provide:
1. An encouraging, empathetic recap for the patient.
2. Objective, concise clinical observations for the physical therapist.
3. Relevant next-step recommendations and safety flags.
"""

def build_summary_prompt(data_json: str) -> str:
    return f"""
Analyze the following patient rehabilitation session data and generate a structured summary:

{data_json}
"""
