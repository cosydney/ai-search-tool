const OpenAI = require('openai');
require('dotenv').config();

// Initialize AI configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.openai.com/v1',
});

// Default model setting
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

class AIMatchVerificationAgent {
    async verifyMatch(person, searchDescription) {
        const prompt = `Verify if this person is a good match for the following description:
        Person: ${JSON.stringify(person)}
        Search Description: ${searchDescription}
        Respond with either "MATCH" or "NO_MATCH" only.`;

        try {
            const completion = await openai.completions.create({
                model: DEFAULT_MODEL,
                prompt: prompt,
                max_tokens: 10,
                temperature: 0.1
            });

            const response = completion.choices[0].text.trim();
            
            // Validate response
            if (response !== "MATCH" && response !== "NO_MATCH") {
                throw new Error(`Invalid AI response: "${response}". Expected either "MATCH" or "NO_MATCH"`);
            }

            return response === "MATCH";
        } catch (error) {
            console.error('Error in AI verification:', error);
            throw error; // Re-throw the error to handle it in the calling code
        }
    }
}

module.exports = AIMatchVerificationAgent; 