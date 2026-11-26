You are the head writer of a comedy Shorts channel. Write ONE skit from the idea below.

{format}

## The idea (already chosen and checked for originality)
{idea}

{language_rules}

## Length
{min_words}-{max_words} spoken words in total, {min_lines}-{max_lines} lines. One line = one sentence or two very short
ones, 5-14 words. Calm, confident narrator pace (the voice reads about {wps} words per second).

## What the viewer sees (write for it)
The cartoon world has: his home office (desk + laptop, big window with the city, couch, a "CEO OF THE MONTH" frame),
a meeting room (long table, empty office chairs, a wall chart with the line going down), a cafe he calls his office
(counter, menu board, laptop and coffee), a city street (bench, cars), his room at night (sofa, phone glow).
Other characters can appear for one line: {personas}.
Per line you may add ONE on-screen gag (optional, only when it makes the joke land faster):
- "card": a small label that pops on a word: {"kind": "stat", "label": "MEETINGS", "value": "0"} or
  {"kind": "stat", "label": "EMPLOYEES", "count_to": 1} or {"kind": "role", "text": "CEO, CFO, INTERN"}.
  Max 14 characters per label, 9 per value, 22 per role text. Latin letters only.
- "stamp": a big rubber stamp slammed on a word: {"text": "CANCELLED", "color": "red"} (max 14 letters).
- "insert": a phone or laptop screen the viewer can READ: {"device": "phone", "app": "chat", "title": "Mom",
  "lines": ["< beta job mili?", "> I AM the job"]} or {"device": "laptop", "app": "calendar", "title": "Today",
  "lines": ["10:00 Meeting with myself", "11:00 Cancelled by myself"], "strike": [1]}. Apps: calendar, email, bank,
  chat, notes, social, search. 2-5 lines, max 30 characters each, Latin letters only (Hinglish in Roman letters).
Use 2-4 gags in the whole skit, never two in one line. The twist line usually gets the strongest one.

## Output
Reply with ONLY one JSON object, no markdown:
{
  "title": "{title_rule}",
  "description": "one or two sentences in the video's language",
  "hashtags": ["#tag", "#tag", "#tag", "#tag"],
  "topic": "short topic name in English",
  "canonical_en": "copy from the idea",
  "category": "copy from the idea",
  "punch_line": 0-based index of the twist line,
  "laptop": ["up to 3 short lines shown on his laptop screen in the background (Latin letters)"],
  "lines": [
    {
      "text": "what the narrator says",
      "caption": "{caption_rule}",
      "emphasis": "the ONE most important word of this line, copied exactly from caption",
      "visual": "what the viewer should see while this is said",
      "ceo": {"action": "idle|type|scroll|point|cheer|cross|nod|shake|look|sad|bounce|raise|write", "expression": "neutral|happy|angry|sceptic|sad|worried|sleepy|surprised|closed"},
      "who": "optional second character for this line: {personas}",
      "card": {}, "stamp": {}, "insert": {}
    }
  ]
}
Omit "who", "card", "stamp", "insert" on lines that do not use them.
