/** 
 * Capitalizes the first letter of a string 
 * @param {string} text - The text to capitalize 
 * @returns {string} - Text with first letter capitalized 
 */ 
export function capitalizeFirstLetter(text) { 
  if (!text || typeof text !== 'string') return text; 
  return text.charAt(0).toUpperCase() + text.slice(1); 
} 

/** 
 * Capitalizes the first letter of each sentence 
 * Useful for reminder descriptions that might have multiple sentences 
 * @param {string} text - The text to capitalize 
 * @returns {string} - Text with each sentence capitalized 
 */ 
export function capitalizeSentences(text) { 
  if (!text || typeof text !== 'string') return text; 
  
  return text 
    .split('. ') 
    .map(sentence => capitalizeFirstLetter(sentence.trim())) 
    .join('. '); 
} 
