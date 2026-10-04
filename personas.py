"""Three SYNTHETIC sample personas. Fictional people; no real health data.

Constraints are generic caregiver preferences ("soft foods"), not diagnoses.
No name or identifier is ever sent to Qloo - only taste concepts (per the kit's
docs/SAFE_USE.md).
"""

PERSONAS = {
    "rosa": {
        "id": "rosa",
        "label": "Rosa, 82 (fictional) - salsa & Cuban home cooking",
        "cuisines": ["Cuban", "Mexican"],
        "music": ["Celia Cruz"],
        "films": ["West Side Story"],
        "constraints": ["soft_foods", "low_sodium", "wheelchair"],
        "city": "Pasadena",
    },
    "harold": {
        "id": "harold",
        "label": "Harold, 88 (fictional) - crooners & Southern supper clubs",
        "cuisines": ["Southern", "Diner"],
        "music": ["Nat King Cole", "Frank Sinatra"],
        "films": ["Casablanca"],
        "constraints": ["low_sodium", "wheelchair"],
        "city": "Pasadena",
    },
    "mei": {
        "id": "mei",
        "label": "Mei, 79 (fictional) - Beatles, Audrey Hepburn & tofu",
        "cuisines": ["Japanese", "Italian"],
        "music": ["The Beatles"],
        "films": ["Roman Holiday", "Singin' in the Rain"],
        "constraints": ["soft_foods"],
        "city": "Pasadena",
    },
}
