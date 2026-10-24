// Two prompts for the same model. The reader only copies text. The baseline is asked
// for the finished Taiwan time, which is what you'd do if you trusted the model with the math.

export function extractPrompt(excerpt) {
  return `These lines come from a contest or event web page. Find every date a participant should know about: deadlines, start dates, judging, winner announcements, live events.

For each one, copy text EXACTLY from the lines, character for character. Do not convert, fix, translate or add anything.
- "name": a short name for the event, 2 to 6 words, in English (your own words)
- "kind": deadline, start, judging, results, event, or other
- "date": the exact text of the date, for example "Nov 2, 2026" or "28 October" or "2026年11月7日"
- "time": the exact text of the clock time for that date, for example "2:00pm" or "23:59", or "" if there is none
- "zone": the exact text of the time zone, for example "PST" or "UTC" or "Pacific Time", or "" if there is none

Lines:
"""
${excerpt}
"""`;
}

export const EXTRACT_GRAMMAR = String.raw`root ::= "{\"events\": [" ("]}" | "\n  " ev (",\n  " ev)* "\n]}")
ev ::= "{\"name\": " str ", \"kind\": " kind ", \"date\": " str ", \"time\": " str0 ", \"zone\": " str0 "}"
kind ::= "\"deadline\"" | "\"start\"" | "\"judging\"" | "\"results\"" | "\"event\"" | "\"other\""
str ::= "\"" chr+ "\""
str0 ::= "\"" chr* "\""
chr ::= [^"\\\n] | "\\" ["\\/nt]
`;

export function baselinePrompt(excerpt, today) {
  return `These lines come from a contest or event web page. Today is ${today}. I live in Taiwan (UTC+8, no daylight saving time).

Find every date a participant should know about: deadlines, start dates, judging, winner announcements, live events. For each one, give the date and time converted to Taiwan time. Take the time zone written on the page into account, including daylight saving time in that region on that date.
- "name": a short name for the event, 2 to 6 words, in English
- "kind": deadline, start, judging, results, event, or other
- "taiwan_time": the moment in Taiwan time, as YYYY-MM-DD HH:MM

Lines:
"""
${excerpt}
"""`;
}

export const BASELINE_GRAMMAR = String.raw`root ::= "{\"events\": [" ("]}" | "\n  " ev (",\n  " ev)* "\n]}")
ev ::= "{\"name\": " str ", \"kind\": " kind ", \"taiwan_time\": \"" dt "\"}"
kind ::= "\"deadline\"" | "\"start\"" | "\"judging\"" | "\"results\"" | "\"event\"" | "\"other\""
dt ::= "20" [0-9] [0-9] "-" [01] [0-9] "-" [0-3] [0-9] " " [0-2] [0-9] ":" [0-5] [0-9]
str ::= "\"" chr+ "\""
chr ::= [^"\\\n] | "\\" ["\\/nt]
`;
