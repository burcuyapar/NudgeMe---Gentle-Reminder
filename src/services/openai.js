import { CONFIG } from '../constants/config';

export async function callOpenAI(conversationHistory, userMessage, systemPrompt) {
  try {
    console.log('🟦 callOpenAI: start');
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(m => ({
        role: m.role === 'ai' ? 'assistant' : m.role,
        content: m.content
      })),
      { role: 'user', content: userMessage }
    ];
    console.log('🟦 callOpenAI: before fetch with model', CONFIG.OPENAI_CHAT_MODEL || 'gpt-4.1-mini');

    const controller = new AbortController();
    const id = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CONFIG.OPENAI_CHAT_MODEL || 'gpt-4.1-mini',
          messages,
          temperature: 0.2,
          max_tokens: 512,
        }),
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const aiResponse = data?.choices?.[0]?.message?.content ?? '';
      console.log('🟦 callOpenAI: after fetch, got response length', aiResponse.length);
      return { success: true, response: aiResponse };
    } catch (err) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        console.error('🟥 callOpenAI: aborted by timeout');
        return { success: false, error: 'timeout' };
      }
      throw err;
    }
  } catch (error) {
    console.error('OpenAI error:', error);
    return { success: false, error: error.message };
  }
}

// ============== PARSING FUNCTIONS ==============

export async function parseChildren(text) {
  try {
    const prompt = `Extract ALL children information from this text: "${text}"

Return a JSON array of children:
[
  {
    "name": "child's name",
    "age": number
  }
]

Handle multiple formats:
- "Emma is 6 and John is 8" → [{"name": "Emma", "age": 6}, {"name": "John", "age": 8}]
- "Emma 6, John 8" → [{"name": "Emma", "age": 6}, {"name": "John", "age": 8}]
- "Sarah, she's 5" → [{"name": "Sarah", "age": 5}]
- "My kids are Emma (6) and John (8)" → [{"name": "Emma", "age": 6}, {"name": "John", "age": 8}]

If only one child, still return array with one item.
If can't extract clear information, return empty array.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'You extract structured child data from text. Return ONLY valid JSON array, no markdown, no explanations.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    const cleanContent = content.replace(/```json\n?|\n?```/g, '');
    
    const parsed = JSON.parse(cleanContent);
    
    // Ensure it's an array
    if (Array.isArray(parsed)) {
      return parsed.map(c => ({
        ...c,
        age: parseFloat(c.age) || c.age // Ensure age is a number (handles "2.5" -> 2.5)
      }));
    } else if (parsed.name && parsed.age) {
      return [{
        ...parsed,
        age: parseFloat(parsed.age) || parsed.age
      }]; // Single child, wrap in array
    }
    
    return [];
    
  } catch (err) {
    console.error('Parse children error:', err);
    return [];
  }
}

export async function parseActivities(text, childrenList = [], lastChildName = '') {
  try {
    const childNames = childrenList.map(c => c.name).join(', ');
    
    const prompt = `Extract ALL activities from this text: "${text}"

Available children: ${childNames || lastChildName || 'unknown'}

Return JSON:
{
  "hasActivity": true/false,
  "items": [
    {
      "activity": "activity name",
      "child": "child name",
      "day": "day of week",
      "time": "time in 12-hour format",
      "icon": "emoji icon"
    }
  ]
}

CRITICAL RULES:
1) Extract EVERY activity mentioned.
2) If a user mentions multiple days (e.g. "Mondays and Wednesdays"), create SEPARATE items for each day.
   Example: "Soccer Mon & Wed 5pm" → 
   [{"activity":"Soccer", "day":"Monday", "time":"5:00 PM", "icon":"⚽"}, {"activity":"Soccer", "day":"Wednesday", "time":"5:00 PM", "icon":"⚽"}]
3) NEVER invent or assume a day or time. If missing, set to null.
4) If the user answer clearly corrects the last mentioned activity, keep using the same activity name from context.
5) NEVER return "Unknown Activity".

CRITICAL ICON SELECTION:
For each activity reminder you create, you MUST select the most appropriate emoji icon from this list:

Common Activities:
- Ballet, Dance, Dancing → 🩰
- Soccer, Football → ⚽
- Basketball → 🏀
- Swimming, Swim → 🏊
- Tennis → 🎾
- Gymnastics → 🤸
- Karate, Martial Arts, Judo → 🥋
- Piano, Music lessons → 🎵
- Art, Painting, Drawing → 🎨
- Yoga → 🧘
- Baseball → ⚾
- Volleyball → 🏐
- Hockey → 🏒
- Golf → ⛳
- Cycling, Bike → 🚴
- Running, Track → 🏃
- Skating → ⛸️
- Climbing → 🧗

School:
- School, Class (general) → 🎒
- Dropoff, Pickup → 🎒

IMPORTANT: Include the icon emoji in your response for EVERY activity/reminder you create.

Examples:
"Emma goes to ballet on Saturdays at 2pm and John goes to soccer on Sundays at 1pm"
→ {
  "hasActivity": true,
  "items": [
    {"activity": "Ballet", "child": "Emma", "day": "Saturday", "time": "2:00 PM", "icon": "🩰"},
    {"activity": "Soccer", "child": "John", "day": "Sunday", "time": "1:00 PM", "icon": "⚽"}
  ]
}

"Playgroup Wed and Fri at 2pm"
→ {
  "hasActivity": true, 
  "items": [
    {"activity": "Playgroup", "child": "${lastChildName || 'unknown'}", "day": "Wednesday", "time": "2:00 PM"},
    {"activity": "Playgroup", "child": "${lastChildName || 'unknown'}", "day": "Friday", "time": "2:00 PM"}
  ]
}

"No" / "None" / "Not yet"
→ {"hasActivity": false, "items": []}`; 

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'You extract ALL activity data from text. Return ONLY valid JSON, no markdown.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const cleanContent = content.replace(/```json\n?|\n?```/g, '');
    
    const parsed = JSON.parse(cleanContent);
    
    console.log('✅ Parsed activities:', parsed);
    
    return parsed;
    
  } catch (err) {
    console.error('❌ Parse activities error:', err);
    return { hasActivity: false, items: [] };
  }
}

export async function parseSelfReminder(text) {
  try {
    const prompt = `Extract self-care reminders from: "${text}"

Return ONLY JSON in this shape:
{
  "items": [
    { 
      "what": "task description", 
      "time": "8:00 AM or similar, or null",
      "recurrence": "daily" or "weekly",
      "days": [1, 3], // Array of numbers 0=Sun, 1=Mon... 6=Sat (only if weekly)
      "icon": "emoji icon"
    }
  ]
}

Rules:
- If the user lists MULTIPLE self-care items with different times, return one entry per item in "items".
- Do not merge multiple separate items into a single reminder.
- If time is not clearly stated for an item, set "time" to null.
- Never invent a time. If unclear, use null.
- Check for day-of-week mentions to determine recurrence:
- "on Mondays", "on Tuesdays", "Wednesdays", etc. → recurrence: "weekly", days: [2] or [4] (Mon=1, Wed=3 in Expo? No, let's use standard JS: 0=Sun, 1=Mon... 6=Sat)
- "every Monday and Wednesday" → recurrence: "weekly", days: [1, 3]
- "Monday mornings", "Wednesday evenings" → recurrence: "weekly", days: [1] or [3]
- If NO day-of-week mentioned (e.g. "every day", "daily", or just a time like "at 8am"):
  - recurrence: "daily"
  - days: null

CRITICAL ICON SELECTION:
For each self-care reminder you create, you MUST select the most appropriate emoji icon from this list:

Self-Care:
- Supplements, Vitamins, Medicine → 💊
- Meditation, Mindfulness → 🧘
- Exercise, Workout, Gym → 💪
- Reading → 📚
- Water, Hydration → 💧
- Rest, Sleep, Nap → 😴
- Journaling, Writing → 📓
- Skin Care, Bath → 🚿
- Me Time, Relax → 💖

IMPORTANT: Include the icon emoji in your response for EVERY reminder you create.

Examples:
  - "yoga class on Wednesdays at 11am" → recurrence: "weekly", days: [3], time: "11:00 AM", icon: "🧘"
  - "meditation every Monday and Friday at 8pm" → recurrence: "weekly", days: [1, 5], time: "08:00 PM", icon: "🧘"
  - "take supplements at 10am" → recurrence: "daily", days: null, time: "10:00 AM", icon: "💊"
  - "morning walk at 7am" → recurrence: "daily", day: null, time: "07:00 AM", icon: "💪"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.3,
        messages: [
          { 
            role: 'system', 
            content: 'Extract self-care reminders. Return ONLY valid JSON with "items" array of { "what", "time", "recurrence", "day" } objects.' 
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const cleanContent = content.replace(/```json\n?|\n?```/g, '');
    
    const parsed = JSON.parse(cleanContent);
    if (Array.isArray(parsed)) {
      return { items: parsed };
    }
    if (parsed && Array.isArray(parsed.items)) {
      return { items: parsed.items };
    }
    if (parsed && parsed.what) {
      return { items: [parsed] };
    }
    return { items: [] };
    
  } catch (err) {
    console.error('Parse self-reminder error:', err);
    return { items: [] };
  }
}

export async function parseSchoolSchedule(text, childrenList = []) {
  try {
    const names = (childrenList || []).map(c => c.name).filter(Boolean);
    const systemPrompt = `When user provides school or daycare times for one or more children, you must extract a schedule for each child mentioned.

User may answer in formats like:
- "[times] for [child1], [times] for [child2]"
- "[child1] [times], [child2] [times]"
- "8am and 4pm for Emma, 9am and 5pm for John"
- "both kids are 8am to 3pm"
- "all kids 9 to 5"

You MUST extract and return JSON:
{
  "children": [
    {
      "name": "Emma",
      "dropoff_time": "08:00 AM",
      "pickup_time": "04:00 PM"
    },
    {
      "name": "John",
      "dropoff_time": "09:00 AM",
      "pickup_time": "05:00 PM"
    }
  ]
}

CRITICAL RULES:
- Match child names exactly from previous conversation
- Always return one object per child in the children list
- Each child gets their OWN times; only reuse the same times for multiple children if the user clearly says they share the same schedule (for example "both kids" or "all kids")
- If the user gives only one clear dropoff and pickup time with no per-child distinction, apply that same schedule to ALL children in the list
- Never invent a time that the user did not clearly state
- Return ONLY valid JSON, no extra text

TIME PARSING RULES (STRICT):
- Extract the EXACT times mentioned by the user.
- Do NOT round times - if user says 8:30, use 8:30, NOT 8:00.
- Preserve minutes - 8:30 means 8:30, not 8:00.
- Parse format: HH:MM AM/PM (e.g., 08:30 AM, 04:30 PM).
- Times must be valid (1:00-12:59 AM/PM).
- Examples:
  - "8:30 a.m. and 4:30 p.m." → Drop-off: "08:30 AM", Pickup: "04:30 PM"
  - "quarter past eight and four fifteen" → Drop-off: "08:15 AM", Pickup: "04:15 PM"
  - "eight and four" → Drop-off: "08:00 AM", Pickup: "04:00 PM"
  - "three thirty pm" → "03:30 PM"
  - "8:30" (morning context) → "08:30 AM"
  - "4" (afternoon context) → "04:00 PM"
- Do NOT output impossible times like "30:00 AM" or "25:00 PM".
- Ensure hours are 01-12 and minutes 00-59.`;

    const childrenLine = names.length ? `Children: ${names.join(', ')}` : '';
    const userPrompt = childrenLine
      ? `${childrenLine}\nUser input: ${text}`
      : `User input: ${text}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const cleanContent = content.replace(/```json\n?|\n?```/g, '');
    const parsed = JSON.parse(cleanContent);
    if (parsed && Array.isArray(parsed.children)) {
      return { children: parsed.children };
    }
    return { children: [] };
  } catch (err) {
    console.error('Parse school schedule error:', err);
    return { children: [] };
  }
}
