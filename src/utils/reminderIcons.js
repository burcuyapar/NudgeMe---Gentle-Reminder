export const isValidEmoji = (str) => {
  if (!str || str.length === 0) return false;
  // Basic emoji validation - check if string is 1-2 characters and contains emoji
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  return emojiRegex.test(str) && str.length <= 4;
};

export const getReminderIcon = (reminderText, reminderType) => {
  const text = (reminderText || '').toLowerCase();

  // Helper for whole word matching to avoid "coffee" matching "fee"
  const has = (word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(text);
  };
  const hasAny = (words) => words.some(w => text.includes(w)); // Keep includes for partial matches where safe

  // 1. Specific Items (Check these first)

  // Activities / Sports / Hobbies (Check these before generic "class" or "school")
  if (text.includes('ballet') || text.includes('dance') || text.includes('dancing')) return '🩰';
  if (text.includes('soccer') || text.includes('football')) return '⚽';
  if (text.includes('basketball') || text.includes('hoops')) return '🏀';
  if (text.includes('swim') || text.includes('pool')) return '🏊';
  if (text.includes('piano') || text.includes('music') || text.includes('guitar') || text.includes('violin') || text.includes('lesson') || text.includes('choir') || text.includes('sing')) return '🎵';
  if (text.includes('art') || text.includes('draw') || text.includes('paint') || text.includes('sketch') || text.includes('craft')) return '🎨';
  if (text.includes('karate') || text.includes('judo') || text.includes('martial') || text.includes('taekwondo') || text.includes('kung fu')) return '🥋';
  if (text.includes('gymnast') || text.includes('tumbling')) return '🤸';
  if (text.includes('tennis') || text.includes('racket')) return '🎾';
  if (text.includes('baseball') || text.includes('softball')) return '⚾';
  if (text.includes('volleyball')) return '🏐';
  if (text.includes('drama') || text.includes('theater') || text.includes('acting')) return '🎭';
  if (text.includes('chess')) return '♟️';
  if (text.includes('coding') || text.includes('robotics')) return '🤖';
  if (text.includes('scout')) return '⚜️';
  if (text.includes('yoga') || text.includes('pilates')) return '🧘';
  
  // Coffee/Drinks
  if (text.includes('coffee') || text.includes('latte') || text.includes('espresso') || text.includes('caffeine')) return '☕';
  if (text.includes('tea') || text.includes('matcha')) return '🍵';
  if (text.includes('water') || text.includes('drink') || text.includes('hydrate')) return '💧';
  if (text.includes('wine') || text.includes('beer') || text.includes('alcohol') || text.includes('drink')) return '🍷';

  // Laundry/Clothing
  if (text.includes('dry clean') || text.includes('laundry') || text.includes('clothes') || text.includes('shirt') || text.includes('suit') || text.includes('dress') || text.includes('wash') || text.includes('iron')) return '🧺';

  // Party/Social
  if (text.includes('party') || text.includes('birthday') || text.includes('celebrat') || text.includes('invit') || text.includes('event') || text.includes('dinner')) return '🎉';

  // Mail/Communication
  if (text.includes('email') || text.includes('mail') || text.includes('send') || text.includes('write') || text.includes('text') || text.includes('message')) return '📧';

  // Health/Medicine
  if (text.includes('medicine') || text.includes('medication') || text.includes('pill') || text.includes('vitamin') || text.includes('supplement') || text.includes('prescription') || text.includes('pharmacy') || text.includes('drug') || text.includes('refill')) return '💊';
  if (text.includes('doctor') || text.includes('appointment') || text.includes('dentist') || text.includes('clinic') || text.includes('hospital')) return '🩺';

  // Shopping
  if (text.includes('buy') || text.includes('shop') || text.includes('store') || text.includes('grocery') || text.includes('groceries') || text.includes('milk') || text.includes('bread') || text.includes('market') || text.includes('supermarket')) return '🛒';

  // Home/Chores
  if (text.includes('clean') || text.includes('tidy') || text.includes('vacuum') || text.includes('mop') || text.includes('dust')) return '🧹';
  if (text.includes('trash') || text.includes('garbage') || text.includes('recycle') || text.includes('bin')) return '🗑️';
  if (text.includes('plant') || text.includes('garden') || text.includes('water the')) return '🪴';
  if (text.includes('repair') || text.includes('fix') || text.includes('maintenance')) return '🔧';
  if (text.includes('bed') || text.includes('sleep') || text.includes('nap')) return '🛌';

  // Work/School
  if (text.includes('study') || text.includes('read') || text.includes('book') || text.includes('homework')) return '📚';
  if (text.includes('work') || text.includes('meeting') || text.includes('laptop') || text.includes('computer')) return '💻';
  if (text.includes('write') || text.includes('note') || text.includes('journal')) return '📝';
  if (text.includes('school') || text.includes('class') || text.includes('teacher') || text.includes('backpack') || text.includes('dropoff') || text.includes('pickup')) return '🎒';
  
  // Finance - Use word boundary for 'fee' to avoid 'coffee' match
  if (text.includes('pay') || text.includes('bill') || text.includes('rent') || has('fee') || text.includes('bank') || text.includes('money')) return '💳';

  // Self Care
  if (text.includes('yoga') || text.includes('meditate') || text.includes('mindfulness') || text.includes('breathe')) return '🧘';
  if (text.includes('exercise') || text.includes('gym') || text.includes('run') || text.includes('jog') || text.includes('workout') || text.includes('walk') || text.includes('fitness')) return '🏃';
  if (text.includes('haircut') || text.includes('salon') || text.includes('barber') || text.includes('spa') || text.includes('massage')) return '💇';
  if (text.includes('shower') || text.includes('bath') || text.includes('wash face') || text.includes('skincare')) return '🚿';
  if (text.includes('rest') || text.includes('relax') || text.includes('nap') || text.includes('sleep') || text.includes('quiet time')) return '😴';
  if (text.includes('journal') || text.includes('diary') || text.includes('gratitude')) return '📓';
  if (text.includes('read') || text.includes('book')) return '📖';
  if (text.includes('self-care') || text.includes('self care') || text.includes('me time')) return '💖';

  // Pets
  if (text.includes('dog') || text.includes('walk the') || text.includes('vet')) return '🐕';
  if (text.includes('cat') || text.includes('litter')) return '🐈';
  
  // General
  if (text.includes('call') || text.includes('phone')) return '📞';
  if (text.includes('food') || text.includes('meal') || text.includes('eat') || text.includes('lunch') || text.includes('breakfast') || text.includes('cook')) return '🍽️';

  // Fallbacks based on type
   if (reminderType === 'school_dropoff' || reminderType === 'school_pickup') return '🎒';
  if (reminderType === 'activity') return '⚽'; // Generic activity
  
  return '📝'; // Default
};
