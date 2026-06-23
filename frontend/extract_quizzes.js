const fs = require('fs');

const files = [
  { id: '2stroke', file: '2stroke4strokequiz.js' },
  { id: 'bjt', file: 'bjtfetquiz.js' },
  { id: 'hydrolic', file: 'hydrolicliftquiz.js' },
  { id: 'pump', file: 'pumpquiz.js' },
  { id: 'refridgerator', file: 'refridgeratorquiz.js' },
  { id: 'turbine', file: 'turbinequiz.js' },
  { id: 'zener', file: 'zenerquiz.js' }
];

const quizzes = {};

files.forEach(f => {
  const content = fs.readFileSync(f.file, 'utf8');
  // extract the array let quizData = [...] or const quizData = [...]
  const match = content.match(/const quizData = (\[[\s\S]*?\]);/);
  if (match) {
    // safely evaluate the array string
    try {
      quizzes[f.id] = eval(match[1]);
    } catch (e) {
      console.log('Error parsing', f.file, e.message);
    }
  }
});

fs.writeFileSync('quizzes.json', JSON.stringify(quizzes, null, 2));
console.log('quizzes.json generated');
