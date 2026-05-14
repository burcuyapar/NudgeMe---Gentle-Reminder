
const { extractReminderFromResponse, formatReminderForDB } = require('./src/services/reminderExtractor');

// Mock Supabase
const supabase = {
  from: (table) => ({
    insert: (data) => ({
      select: () => Promise.resolve({ data, error: null })
    })
  })
};

const tests = [
  {
    name: 'TEST 1: Simple reminder with time',
    input: `Got it! I'll remind you to buy milk at 8am tomorrow.
\`\`\`json
{
  "reminder_detected": true,
  "what": "buy milk",
  "when_date": "2025-12-23",
  "when_time": "08:00",
  "who": null,
  "where": null,
  "recurrence": "once",
  "notes": null
}
\`\`\``,
    expectSave: true
  },
  {
    name: 'TEST 2: Reminder without time',
    input: `I'll remind you to call mom.
\`\`\`json
{
  "reminder_detected": true,
  "what": "call mom",
  "when_date": null,
  "when_time": null,
  "who": "mom",
  "where": null,
  "recurrence": "once",
  "notes": null
}
\`\`\``,
    expectSave: true
  },
  {
    name: 'TEST 3: Not a reminder',
    input: `I can help you with setting reminders, tracking tasks, and organizing your schedule. Just let me know what you need!`,
    expectSave: false
  }
];

async function runTests() {
  console.log("🧪 RUNNING REMINDER EXTRACTION TESTS...\n");

  for (const test of tests) {
    console.log(`--- ${test.name} ---`);
    
    const reminderData = extractReminderFromResponse(test.input);
    
    if (reminderData) {
      console.log('✅ Reminder extracted:', reminderData);
      
      if (test.expectSave) {
          console.log('💾 Saving reminder to database...');
          try {
              const userId = 'temp_user_id';
              const formattedReminder = formatReminderForDB(reminderData, userId);
              const { data } = await supabase.from('reminders').insert([formattedReminder]).select();
              console.log('✅ Reminder saved successfully:', data);
          } catch (err) {
              console.error('❌ Database error:', err);
          }
      } else {
          console.log('❌ UNEXPECTED SAVE: Should not have saved');
      }
      
    } else {
      if (test.expectSave) {
          console.log('❌ FAILED: Expected extraction but got null');
      } else {
          console.log('✅ Correctly ignored (no reminder detected)');
      }
    }
    console.log('\n');
  }
}

runTests();
