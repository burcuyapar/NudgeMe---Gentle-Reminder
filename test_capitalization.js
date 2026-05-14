
const { formatReminderForDB } = require('./src/services/reminderExtractor');

console.log('🧪 Testing formatReminderForDB Capitalization...');

const mockReminder = {
  what: 'buy milk',
  recurrence: 'once',
  when_time: '10:00',
  when_date: '2025-12-25'
};

const formatted = formatReminderForDB(mockReminder, 'user123');

console.log('Original:', mockReminder.what);
console.log('Formatted:', formatted.what);

if (formatted.what === 'Buy milk') {
  console.log('✅ Capitalization SUCCESS');
} else {
  console.log('❌ Capitalization FAILED');
}

const mockNull = {
  what: null,
  recurrence: 'once'
};

const formattedNull = formatReminderForDB(mockNull, 'user123');
console.log('Null input:', formattedNull.what); 

if (formattedNull.what === null) {
    console.log('✅ Null handling SUCCESS');
} else {
    console.log('❌ Null handling FAILED');
}
