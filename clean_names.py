# Removes personal names from code comments/docs before merging to main.
import pathlib
REPLACE = [
    ("// Satyabrata's private test page:", "// Private pose test page:"),
    ("// Satyabrata — ", "// "),
    ("Daniel's screens are untouched.", "app screens are untouched."),
    ("for Daniel's screens.", "for the app screens."),
    ("everything Daniel's exercise screen needs", "everything an exercise screen needs"),
    (" prototype (Satyabrata).", " prototype."),
    ("conda activate rehabbuddy-proto", "pip install -r requirements.txt"),
    ("(for Luis: backend + schema)", "(backend + schema reference)"),
    ("what Daniel's frontend expects", "what the frontend expects"),
    ("## To agree with Daniel", "## Proposed API additions"),
    ("not yet in his", "not yet in the frontend's"),
    ("not yet in Daniel's", "not yet in the frontend's"),
    ("Queries Luis needs for", "Queries behind"),
    (" (Daniel)", ""),
]
files = [p for d in ["frontend/src/pose", "ml", "database/sample_data"]
         for p in pathlib.Path(d).rglob("*")
         if p.is_file() and p.suffix in {".ts", ".tsx", ".py", ".md", ".sql", ".json"}]
for p in files:
    s = p.read_text(encoding="utf-8")
    new = s
    for a, b in REPLACE:
        new = new.replace(a, b)
    if new != s:
        p.write_text(new, encoding="utf-8")
        print("cleaned", p)