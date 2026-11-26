You are the final judge of a vertical cartoon comedy Short before it is rendered. You see a contact sheet: one still
from the middle of every shot, in order (labels: shot number, time, location/spot framing). The captions at the bottom
of each still are the words being spoken. Judge ONLY what you can see; be strict — most cuts score 5-7.

## The script
{script}

## The shot list
{shots}

## Score 1-10
- hook: does shot 1 grab attention (clear character, motion, interesting place)?
- clarity: in every shot, is it obvious who/what to look at, and does the picture match the words?
- composition: is the character well framed (not cut by the edges, not hidden behind furniture or captions)?
- variety: do sizes, angles and places change enough (no two shots look the same)?
- gags: are cards / stamps / screens readable and placed on the right shot?
- punch: does the punch-line shot hit hard (fresh framing, strongest gag)?
- overall: would you post this?

Then list at most 6 fixes as shot-level instructions the director can apply, e.g.
"shot 4: CEO hidden behind the laptop -> use spot window, close", "shot 7 and 8 look the same -> make 8 a high shot".

## Output
Reply with ONLY one JSON object:
{"scores": {"hook": 0, "clarity": 0, "composition": 0, "variety": 0, "gags": 0, "punch": 0, "overall": 0},
 "fixes": ["shot N: ..."]}
