
const { extractReminderFromResponse, formatReminderForDB } = require('./src/services/reminderExtractor');

// Mock Supabase
const supabase = {
  from: (table) => ({
    insert: (data) => ({
      select: () => Promise.resolve({ data: data, error: null })
    })
  })
};

const scenarios = [
  {
    name: 'SCENARIO 1: Morning reminder',
    input: `Got it! I'll remind you to take vitamins at 8am tomorrow.
\`\`\`json
{
  "reminder_detected": true,
  "what": "take vitamins",
  "when_date": "2025-12-23",
  "when_time": "08:00",
  "who": null,
  "where": null,
  "recurrence": "once",
  "notes": null
}
\`\`\``,
    expected: {
      what: 'take vitamins',
      when_time: '08:00',
      when_date: '2025-12-23'
    }
  },
  {
    name: 'SCENARIO 2: Pickup reminder',
    input: `Okay, I'll remind you to pick up Sarah from school at 3pm today.
\`\`\`json
{
  "reminder_detected": true,
  "what": "pick up Sarah from school",
  "when_date": "2025-12-22",
  "when_time": "15:00",
  "who": "Sarah",
  "where": "school",
  "recurrence": "once",
  "notes": null
}
\`\`\``,
    expected: {
      what: 'pick up Sarah from school',
      when_time: '15:00',
      who: 'Sarah'
    }
  },
  {
    name: 'SCENARIO 3: Weekly recurring',
    input: `I'll remind you to call mom every Sunday.
\`\`\`json
{
  "reminder_detected": true,
  "what": "call mom",
  "when_date": null,
  "when_time": null,
  "who": "mom",
  "where": null,
  "recurrence": "weekly",
  "notes": "every Sunday"
}
\`\`\``,
    expected: {
      what: 'call mom',
      recurrence: 'weekly'
    }
  }
];

async function runE2ETests() {
  console.log("🚀 RUNNING END-TO-END REMINDER FLOW TESTS...\n");

  for (const scenario of scenarios) {
    console.log(`--- ${scenario.name} ---`);
    
    // 1. Voice Assistant Step: Extract
    const reminderData = extractReminderFromResponse(scenario.input);
    
    if (!reminderData) {
        console.log('❌ FAILED: Extraction returned null');
        continue;
    }
    
    // Validate Extraction
    let extractionPass = true;
    for (const [key, val] of Object.entries(scenario.expected)) {
        if (reminderData[key] !== val) {
            console.log(`❌ EXTRACTION MISMATCH: ${key} expected "${val}", got "${reminderData[key]}"`);
            extractionPass = false;
        }
    }
    
    if (!extractionPass) continue;
    console.log('✅ Extraction verified');

    // 2. Database Step: Save
    console.log('💾 Saving to database...');
    const userId = 'test_user_123';
    const formattedReminder = formatReminderForDB(reminderData, userId);
    
    const { data } = await supabase.from('reminders').insert([formattedReminder]).select();
    
    // 3. Dashboard Step: Verify Data Structure
    const saved = data[0];
    let dbPass = true;
    
    // Check if critical fields made it to DB object
    if (saved.what !== scenario.expected.what) dbPass = false;
    if (scenario.expected.when_time && saved.when_time !== scenario.expected.when_time) dbPass = false;
    if (scenario.expected.recurrence && saved.recurrence !== scenario.expected.recurrence) dbPass = false;
    
    if (dbPass) {
        console.log('✅ Database save verified');
        console.log('📊 Dashboard would display:', 
            `"${saved.what}"`, 
            saved.when_time ? `@ ${saved.when_time}` : '',
            saved.when_date ? `on ${saved.when_date}` : '',
            saved.recurrence ? `(${saved.recurrence})` : ''
        );
    } else {
        console.log('❌ DATABASE SAVE MISMATCH:');
        console.log('Expected:', scenario.expected);
        console.log('Saved:', saved);
    }
    
    console.log('\n');
  }
}

runE2ETests();
