const OpenAI = require('openai');
require('dotenv').config();

// Initialize AI configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_API_BASE || 'https://api.openai.com/v1',
});

// Default model setting
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

class SemanticSearchAgent {
    async ratePerson(person, searchDescription) {
        const prompt = `Rate how well this person matches the following description (0-100):
        Person: ${person.name}, Title: ${person.title}, Experience: ${person.experience}
        Search Description: ${searchDescription}
        Provide only a number between 0-100.`;

        try {
            const completion = await openai.completions.create({
                model: DEFAULT_MODEL,
                prompt: prompt,
                max_tokens: 5,
                temperature: 0.1
            });

            const rating = parseInt(completion.choices[0].text.trim());
            return isNaN(rating) ? 0 : rating;
        } catch (error) {
            console.error('Error in semantic search:', error);
            return 0;
        }
    }
}

module.exports = SemanticSearchAgent; 