export const formatWeeklyDays = (days) => {
  if (!Array.isArray(days) || days.length === 0) return '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Sort days just in case
  const sortedDays = [...days].sort((a, b) => a - b);
  
  // Check for Weekdays (1,2,3,4,5)
  if (sortedDays.length === 5 && sortedDays.every((d, i) => d === i + 1)) {
    return 'Weekdays';
  }
  
  // Check for Weekends (0,6)
  if (sortedDays.length === 2 && sortedDays.includes(0) && sortedDays.includes(6)) {
    return 'Weekends';
  }
  
  // Check for Everyday (0-6)
  if (sortedDays.length === 7) {
    return 'Daily';
  }
  
  // Single day
  if (sortedDays.length === 1) {
    return fullDayNames[sortedDays[0]];
  }
  
  // Multiple days
  return sortedDays.map(d => dayNames[d]).join(', ');
};
