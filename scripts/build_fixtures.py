"""Regenerates fixtures/qloo_fixtures.json.

ALL DATA HERE IS SYNTHETIC. Venue names are fictional, entity IDs are prefixed
"FIX-" so they can never be mistaken for real Qloo IDs, and affinity numbers are
hand-assigned to exercise the agent. Shapes follow the documented Qloo response
envelopes (see qloo_client.py header for doc URLs). Replace with a recorded live
response (keys redacted) once a hackathon key is issued.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "fixtures" / "qloo_fixtures.json"

def tag(tid, name, ttype):
    return {"tag_id": tid, "name": name, "type": ttype}

CUISINE = "urn:tag:genre:place:restaurant"
ACCESS = "urn:tag:accessibility:place"
VENUE = "urn:tag:category:place"

cuisines = ["Cuban", "Mexican", "Southern", "Diner", "Japanese", "Italian"]
venues = ["Jazz Club", "Movie Theater", "Museum", "Concert Hall"]
TAGS = [{"id": f"urn:tag:genre:restaurant:{c}", "name": c, "type": CUISINE,
         "aka": {"Diner": ["american", "comfort food"], "Southern": ["soul food"]}.get(c, [])}
        for c in cuisines]
TAGS += [{"id": f"urn:tag:category:place:{v.lower().replace(' ', '_')}", "name": v, "type": VENUE,
          "aka": {"Movie Theater": ["cinema", "classic film"], "Jazz Club": ["jazz"],
                  "Concert Hall": ["symphony", "big band"]}.get(v, [])}
         for v in venues]

def ctag(c):
    return tag(f"urn:tag:genre:restaurant:{c}", c, CUISINE)

def vtag(v):
    return tag(f"urn:tag:category:place:{v.lower().replace(' ', '_')}", v, VENUE)

WHEEL = tag("urn:tag:accessibility:place:wheelchair_accessible_entrance",
            "Wheelchair accessible entrance", ACCESS)
STEPS = tag("urn:tag:accessibility:place:steps_at_entrance", "Steps at entrance", ACCESS)

ARTISTS = {"FIX-A-celia": "Celia Cruz", "FIX-A-nat": "Nat King Cole", "FIX-A-frank": "Frank Sinatra",
           "FIX-A-beatles": "The Beatles", "FIX-A-ella": "Ella Fitzgerald"}
MOVIES = {"FIX-M-roman": "Roman Holiday", "FIX-M-casa": "Casablanca",
          "FIX-M-singin": "Singin' in the Rain", "FIX-M-wss": "West Side Story"}

search_entities = (
    [{"entity_id": k, "name": v, "types": ["urn:entity:artist"], "popularity": 0.97, "tags": []}
     for k, v in ARTISTS.items()]
    + [{"entity_id": k, "name": v, "types": ["urn:entity:movie"], "popularity": 0.95, "tags": []}
       for k, v in MOVIES.items()]
)

def place(pid, name, tags, kw, price, pop, signals, hours="Mon-Sun"):
    return {"entity_id": pid, "name": name, "types": ["urn:entity:place"], "popularity": pop,
            "tags": tags,
            "properties": {"address": "Synthetic address (fixture)",
                           "geocode": {"city": "Pasadena", "country_code": "US"},
                           "keywords": [{"name": k, "count": 10} for k in kw],
                           "price_level": price, "hours_summary": hours},
            "_signals": signals}

places = [
    place("FIX-P-01", "Casa Habana Kitchen", [ctag("Cuban"), WHEEL],
          ["black bean soup", "picadillo", "flan", "made to order"], 2, 0.71,
          {"FIX-A-celia": 0.91, "FIX-M-wss": 0.74}),
    place("FIX-P-02", "La Paloma Cantina", [ctag("Mexican"), STEPS],
          ["pozole", "tamales", "live mariachi"], 2, 0.80, {"FIX-A-celia": 0.86}),
    place("FIX-P-03", "Abuela's Table", [ctag("Mexican"), WHEEL],
          ["caldo de pollo", "refried beans", "low sodium options"], 1, 0.62,
          {"FIX-A-celia": 0.83, "FIX-M-roman": 0.55}),
    place("FIX-P-04", "Malecon Sandwich Shop", [ctag("Cuban")],
          ["cuban sandwich", "pressed bread", "cured ham", "pickles"], 1, 0.66,
          {"FIX-A-celia": 0.88}),
    place("FIX-P-05", "Magnolia Supper Club", [ctag("Southern"), WHEEL],
          ["grits", "mashed potatoes", "heart-healthy menu", "steamed vegetables"], 3, 0.69,
          {"FIX-A-nat": 0.89, "FIX-A-frank": 0.84, "FIX-M-casa": 0.81}),
    place("FIX-P-06", "Smokehouse 66", [ctag("Southern"), WHEEL],
          ["bbq ribs", "brisket", "cured meats", "fried pickles"], 2, 0.83,
          {"FIX-A-nat": 0.72, "FIX-A-frank": 0.70}),
    place("FIX-P-07", "Blue Plate Diner", [ctag("Diner"), WHEEL],
          ["meatloaf", "mashed potatoes", "soups", "made to order"], 1, 0.75,
          {"FIX-A-frank": 0.87, "FIX-M-casa": 0.77, "FIX-A-beatles": 0.61}),
    place("FIX-P-08", "Starlight Grill", [ctag("Diner"), STEPS],
          ["burgers", "milkshakes", "fried chicken"], 1, 0.78, {"FIX-A-nat": 0.80}),
    place("FIX-P-09", "Kotobuki Tofu House", [ctag("Japanese"), WHEEL],
          ["tofu", "steamed fish", "chawanmushi", "low sodium options"], 2, 0.64,
          {"FIX-A-beatles": 0.82, "FIX-M-singin": 0.58}),
    place("FIX-P-10", "Ramen Tatsu", [ctag("Japanese"), WHEEL],
          ["tonkotsu ramen", "rich broth", "pickled vegetables"], 1, 0.88,
          {"FIX-A-beatles": 0.79}),
    place("FIX-P-11", "Trattoria Nonna Lucia", [ctag("Italian"), WHEEL],
          ["risotto", "polenta", "minestrone", "made to order"], 2, 0.73,
          {"FIX-M-roman": 0.92, "FIX-A-frank": 0.90, "FIX-A-beatles": 0.76, "FIX-M-singin": 0.71}),
    place("FIX-P-12", "Salumeria Roma", [ctag("Italian")],
          ["cured meats", "crusty bread", "olives"], 2, 0.70, {"FIX-M-roman": 0.85}),
    place("FIX-P-13", "Osteria del Ponte", [ctag("Italian"), STEPS],
          ["gnocchi", "soups"], 3, 0.67, {"FIX-A-frank": 0.86, "FIX-M-roman": 0.80}),
    # cultural venues
    place("FIX-V-01", "The Blue Note Room (fictional)", [vtag("Jazz Club"), WHEEL],
          ["live jazz", "early seating", "big band night"], 2, 0.72,
          {"FIX-A-nat": 0.93, "FIX-A-frank": 0.91, "FIX-A-ella": 0.94, "FIX-A-celia": 0.70},
          hours="Thu-Sun"),
    place("FIX-V-02", "Rialto Revival Cinema (fictional)", [vtag("Movie Theater"), WHEEL],
          ["classic film series", "matinee", "assisted listening"], 1, 0.68,
          {"FIX-M-roman": 0.95, "FIX-M-casa": 0.94, "FIX-M-singin": 0.92, "FIX-M-wss": 0.90}),
    place("FIX-V-03", "Arroyo Museum of Latin Music (fictional)", [vtag("Museum"), WHEEL],
          ["exhibits", "salsa history", "guided tours"], 1, 0.58,
          {"FIX-A-celia": 0.96, "FIX-M-wss": 0.66}),
    place("FIX-V-04", "Colorado Street Concert Hall (fictional)", [vtag("Concert Hall"), STEPS],
          ["symphony", "british invasion tribute"], 3, 0.77,
          {"FIX-A-beatles": 0.95, "FIX-A-frank": 0.82}),
    place("FIX-V-05", "Pacific Pops Pavilion (fictional)", [vtag("Concert Hall"), WHEEL],
          ["pops concerts", "60s tribute", "matinee"], 2, 0.63,
          {"FIX-A-beatles": 0.89, "FIX-M-singin": 0.70}),
]

data = {
    "_note": "SYNTHETIC fixture. Fictional venues, FIX- ids, hand-set affinities. Not Qloo data.",
    "_doc_shapes": ["https://docs.qloo.com/reference/insights-api-deep-dive",
                    "https://docs.qloo.com/reference/get-search",
                    "https://docs.qloo.com/reference/get-tags-1"],
    "search_entities": search_entities,
    "tags": TAGS,
    "places": places,
}

if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(places)} places, {len(search_entities)} entities, {len(TAGS)} tags)")
